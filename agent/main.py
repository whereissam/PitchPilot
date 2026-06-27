import asyncio
import json
import logging

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai

from prompts import JUDGE_INSTRUCTIONS
from scoring import score_pitch

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("judgemode")


class JudgeAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=JUDGE_INSTRUCTIONS)


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(voice="marin"),
    )

    transcript: list[str] = []
    scored = {"done": False}

    @session.on("conversation_item_added")
    def _on_item(ev):
        role = getattr(ev.item, "role", "?")
        text = getattr(ev.item, "text_content", None) or ""
        if not text:
            return
        transcript.append(f"{role}: {text}")
        if role == "user" and "score me" in text.lower() and not scored["done"]:
            scored["done"] = True
            asyncio.create_task(_publish_card())

    async def _publish_card():
        try:
            full = "\n".join(transcript)
            card = await asyncio.to_thread(score_pitch, full)
            await ctx.room.local_participant.publish_data(
                json.dumps(card).encode("utf-8"), reliable=True, topic="scorecard"
            )
            logger.info("published scorecard: %s", card)
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
