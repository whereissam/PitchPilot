import asyncio
import json
import logging

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai
from openai.types.beta.realtime.session import InputAudioNoiseReduction, TurnDetection

from feedback import lowest_metric, write_feedback
from prompts import DEFAULT_PERSONA, instructions_for, intro_for, persona_name
from scoring import Scorecard, score_pitch

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("judgemode")


class JudgeAgent(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


def _parse_meta(metadata: str | None) -> tuple[str, bool]:
    # Wire format: JSON {"persona": str, "brutal": bool}. Tolerates a bare legacy slug and any
    # junk — an unknown persona falls back to the default inside instructions_for().
    raw = (metadata or "").strip()
    if not raw:
        return DEFAULT_PERSONA, False
    try:
        data = json.loads(raw)
        return (data.get("persona") or DEFAULT_PERSONA), bool(data.get("brutal"))
    except (ValueError, TypeError):
        return raw, False  # legacy: metadata was just the persona slug


def _is_scoring_cue(text: str) -> bool:
    # PR1 keeps the simple substring trigger; PR2 will replace this with a score_now() tool.
    return "score me" in text.lower()


def _read_card_instructions(card: Scorecard) -> str:
    # The voice reads the EXACT card the code computed — no invented numbers.
    return (
        "The scorecard is ready. Read it aloud verbatim in under 20 seconds, do not change any "
        "number, then stop. Say it like a judge delivering a verdict:\n"
        f"Idea: {card.idea} out of 10. "
        f"Execution: {card.execution} out of 10. "
        f"Demo clarity: {card.demo_clarity} out of 10. "
        f"Technical depth: {card.technical_depth} out of 10. "
        f"Why voice: {card.why_voice} out of 10. "
        f"Benchmark: {'present' if card.benchmark_present else 'missing'}. "
        f"Best next fix: {card.best_next_fix} "
        f"{card.verdict}"
    )


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()

    # The founder picks a judge persona + intensity on the start screen; the token route stamps
    # them as JSON on participant metadata. Read it once the founder joins, then build the prompt.
    participant = await ctx.wait_for_participant()
    persona, brutal = _parse_meta(participant.metadata)
    logger.info("judge persona: %s (%s) brutal=%s", persona, persona_name(persona), brutal)

    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice="marin",
            # cut background noise so it doesn't false-trigger / stutter
            input_audio_noise_reduction=InputAudioNoiseReduction(type="near_field"),
            # predict end-of-turn semantically for smoother, lower-latency hand-offs
            turn_detection=TurnDetection(type="semantic_vad", eagerness="medium"),
        ),
    )

    # Two transcripts on purpose: the judge hears everything, but the SCORER only sees the
    # founder's words — so the judge's own interruptions can't be scored as pitch content.
    full_transcript: list[str] = []
    founder_transcript: list[str] = []
    # Structured transcript for the browser to persist with the scorecard (best-effort).
    transcript_lines: list[dict] = []
    scored = {"done": False}
    red_flags = {"n": 0}

    async def _publish_cutin(text: str, n: int):
        # Best-effort: a live judge interruption the browser flashes as an OBJECTION cut-in.
        try:
            await ctx.room.local_participant.publish_data(
                json.dumps({"text": text, "n": n}).encode("utf-8"), reliable=True, topic="cutin"
            )
        except Exception:
            logger.warning("cutin publish failed", exc_info=True)

    @session.on("conversation_item_added")
    def _on_item(ev):
        role = getattr(ev.item, "role", "?")
        text = getattr(ev.item, "text_content", None) or ""
        if not text:
            return
        full_transcript.append(f"{role}: {text}")
        is_founder = role == "user"
        transcript_lines.append({"role": "founder" if is_founder else "judge", "text": text})
        if is_founder:
            founder_transcript.append(text)
            if _is_scoring_cue(text) and not scored["done"]:
                scored["done"] = True
                asyncio.create_task(_publish_card())
        elif founder_transcript and not scored["done"]:
            # Judge spoke mid-pitch (not the greeting, not the verdict) = a barge-in. Flash it.
            red_flags["n"] += 1
            asyncio.create_task(_publish_cutin(text, red_flags["n"]))

    async def _publish_card():
        try:
            pitch = "\n".join(founder_transcript)
            card = await asyncio.to_thread(score_pitch, pitch)
            # One source of truth: publish the card, then have the voice read THAT same card.
            await ctx.room.local_participant.publish_data(
                json.dumps(card.payload()).encode("utf-8"), reliable=True, topic="scorecard"
            )
            logger.info("published scorecard: %s", card.payload())
            # Best-effort: the browser saves this with the scorecard for replay. If it
            # fails, the frontend falls back to an empty transcript — the save still happens.
            try:
                await ctx.room.local_participant.publish_data(
                    json.dumps(transcript_lines).encode("utf-8"), reliable=True, topic="transcript"
                )
            except Exception:
                logger.warning("transcript publish failed", exc_info=True)

            # Voice reads the verdict while we write the critique concurrently, so the
            # feedback lands within the browser's save window instead of after the speech.
            reply_task = asyncio.create_task(
                session.generate_reply(instructions=_read_card_instructions(card))
            )
            try:
                fb = await asyncio.to_thread(write_feedback, pitch, card)
                if fb is not None:
                    name, score = lowest_metric(card)
                    await ctx.room.local_participant.publish_data(
                        json.dumps(fb.payload(name, score)).encode("utf-8"),
                        reliable=True,
                        topic="feedback",
                    )
                    logger.info("published feedback: %s", fb.action_title)
            except Exception:
                logger.warning("feedback publish failed", exc_info=True)
            await reply_task
        except Exception:
            logger.exception("scorecard publish failed")

    await session.start(room=ctx.room, agent=JudgeAgent(instructions_for(persona, brutal)))
    await session.generate_reply(instructions=intro_for(persona, brutal))


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
