import asyncio
import json
import logging

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai
from openai.types.beta.realtime.session import InputAudioNoiseReduction, TurnDetection

from prompts import JUDGE_INSTRUCTIONS
from scoring import Scorecard, score_pitch

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("judgemode")


class JudgeAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=JUDGE_INSTRUCTIONS)


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
    scored = {"done": False}

    @session.on("conversation_item_added")
    def _on_item(ev):
        role = getattr(ev.item, "role", "?")
        text = getattr(ev.item, "text_content", None) or ""
        if not text:
            return
        full_transcript.append(f"{role}: {text}")
        if role == "user":
            founder_transcript.append(text)
            if _is_scoring_cue(text) and not scored["done"]:
                scored["done"] = True
                asyncio.create_task(_publish_card())

    async def _publish_card():
        try:
            pitch = "\n".join(founder_transcript)
            card = await asyncio.to_thread(score_pitch, pitch)
            # One source of truth: publish the card, then have the voice read THAT same card.
            await ctx.room.local_participant.publish_data(
                json.dumps(card.payload()).encode("utf-8"), reliable=True, topic="scorecard"
            )
            logger.info("published scorecard: %s", card.payload())
            await session.generate_reply(instructions=_read_card_instructions(card))
        except Exception:
            logger.exception("scorecard publish failed")

    await session.start(room=ctx.room, agent=JudgeAgent())
    await session.generate_reply(
        instructions=(
            "Speak first, before they say anything. In two short sentences: introduce "
            "yourself as PitchPilot, the hackathon judge, then invite them to begin — "
            "e.g. 'Whenever you're ready, give me your pitch — and say \"score me\" when "
            "you're done.' Keep it crisp and confident, then stop and listen."
        )
    )


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
