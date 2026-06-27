from typing import Annotated

from openai import OpenAI
from pydantic import BaseModel, Field

RUBRIC_PROMPT = """\
You are a tough but fair hackathon judge scoring a pitch transcript against the OFFICIAL rubric.
The rubric is two equally weighted halves (50% each):

Idea (50%): technical depth, and how impressive the demo is.
Execution (50%): how cool / inspiring the idea is, and how useful the eval/benchmark is.

Score these fields 0-10:
- idea: the Idea half — genuine technical depth AND an impressive, concrete demo.
- execution: the Execution half — an inspiring, memorable concept AND a genuinely useful eval/benchmark.
- demo_clarity: can a listener grasp the demo in 20 seconds (clear before/after, a wow moment)?
- technical_depth: nontrivial engineering tied to a user outcome — realtime interruption, state
  tracking, evals, multi-modal handoff. NOT a list of dependencies.
- why_voice: is realtime voice necessary (timing, interruption, live coaching, hands-free,
  back-and-forth)? If the same thing works as text chat, score this low.

Anti-gaming (critical): listing technologies, frameworks, APIs, or "we wired up the API and it
runs" is NOT technical depth and is NOT impressive. A pitch that name-drops a stack with no clear
user, no demo, and no eval is implementation theater — score it LOW across idea, execution,
demo_clarity, and technical_depth, no matter how much tech it mentions.

- benchmark_present: true ONLY if the pitch mentions an eval, rubric, scorecard, test set,
  benchmark, or a measurable before/after. Otherwise false.
- best_next_fix: one sentence, the single highest-leverage improvement.
- verdict: one short judge's line, e.g. "Verdict: clear demo, weak benchmark." or
  "Verdict: promising, but the voice case is weak."
"""


class Scorecard(BaseModel):
    """The one and only scorecard shape. Produced by score_pitch(), published on the data
    channel, and read aloud by the realtime judge — so the voice and the UI can never disagree."""

    idea: Annotated[int, Field(ge=0, le=10)]
    execution: Annotated[int, Field(ge=0, le=10)]
    demo_clarity: Annotated[int, Field(ge=0, le=10)]
    technical_depth: Annotated[int, Field(ge=0, le=10)]
    why_voice: Annotated[int, Field(ge=0, le=10)]
    benchmark_present: bool
    best_next_fix: str
    verdict: str

    @property
    def total(self) -> int:
        """Official hackathon rubric total (0-100), computed in code — never invented by the
        model. Idea 50% + Execution 50%; the other fields are diagnostics."""
        return (self.idea + self.execution) * 5

    def payload(self) -> dict:
        """JSON-safe dict for the data channel, with the computed total folded in."""
        return {**self.model_dump(), "total": self.total}


def score_pitch(transcript: str, model: str = "gpt-4o") -> Scorecard:
    """Single source of truth for the scorecard. Structured outputs guarantee the shape, so
    there is no hand-rolled normalization — only a defensive fallback if the API is down."""
    try:
        resp = OpenAI().chat.completions.parse(
            model=model,
            temperature=0,
            response_format=Scorecard,
            messages=[
                {"role": "system", "content": RUBRIC_PROMPT},
                {"role": "user", "content": transcript},
            ],
        )
        parsed = resp.choices[0].message.parsed
        if parsed is not None:
            return parsed
    except Exception:
        pass
    return Scorecard(
        idea=0,
        execution=0,
        demo_clarity=0,
        technical_depth=0,
        why_voice=0,
        benchmark_present=False,
        best_next_fix="scoring unavailable — check OPENAI_API_KEY",
        verdict="Verdict: not scored.",
    )
