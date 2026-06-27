import logging

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai

from prompts import JUDGE_INSTRUCTIONS

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
    await session.start(room=ctx.room, agent=JudgeAgent())
    await session.generate_reply(
        instructions="In ONE short sentence, say you are JudgeMode and tell them to start their pitch."
    )


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
