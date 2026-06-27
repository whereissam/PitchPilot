"""Richer written feedback — one structured LLM call after score_pitch().

Feedback is an *explanation of the scorecard*, not a second judge: the scorecard owns the
numbers, and the lowest metric is chosen here in code (never by the model). The model only
writes prose — a critique, the reason the lowest metric dragged the score, and a rewrite of
the founder's weakest line. Best-effort: any failure returns None and never blocks the verdict.
"""

import logging

from openai import OpenAI
from pydantic import BaseModel

from scoring import SCORER_MODEL, Scorecard

logger = logging.getLogger("feedback")

# Lazy singleton — importing this module never requires OPENAI_API_KEY.
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


# Tie-break order: favor pitch/demo impact over deep technical critique. PitchPilot's job is
# making the pitch land, not grading engineering. First in this list wins a tie.
_TIE_BREAK = ["why_voice", "demo_clarity", "execution", "technical_depth", "idea"]


def lowest_metric(card: Scorecard) -> tuple[str, int]:
    """The single weakest of the five 0-10 metrics, computed in code. Ties resolve by
    _TIE_BREAK priority. This is the only numeric input handed to the feedback prompt."""
    best_name = _TIE_BREAK[0]
    best_score = getattr(card, best_name)
    for name in _TIE_BREAK[1:]:
        score = getattr(card, name)
        if score < best_score:  # strict <, so earlier (higher-priority) ties survive
            best_name, best_score = name, score
    return best_name, best_score


class WeakestLine(BaseModel):
    quote: str | None  # verbatim founder line, or null if no single weak line exists
    why_weak: str      # one sentence (a pattern name if quote is null)
    rewrite: str       # punched-up version


class Feedback(BaseModel):
    action_title: str          # short imperative heading, e.g. "Lead with the pain, not the stack."
    what_landed: str | None    # only if something genuinely worked — else null, never invented
    critique: str              # one tight paragraph
    lowest_metric_reason: str  # one sentence — the model's job
    weakest_line: WeakestLine

    def payload(self, name: str, score: int) -> dict:
        """JSON for the data channel. name + score are injected from code (the argmin over
        the scorecard), never chosen by the model — so feedback can't disagree with the card."""
        return {
            "action_title": self.action_title,
            "what_landed": self.what_landed,
            "critique": self.critique,
            "lowest_metric": {"name": name, "score": score, "reason": self.lowest_metric_reason},
            "weakest_line": self.weakest_line.model_dump(),
        }


FEEDBACK_PROMPT = """\
You explain a hackathon pitch's scorecard to the founder. You are not a second judge — the
numbers are already final. Your job is to make the score actionable in a few seconds of reading.

Voice: direct, dry, specific. No buzzwords (leverage, robust, seamless, synergy, unlock,
revolutionize). No filler. Never sound like ChatGPT. Short sentences.

Return:
- action_title: a short imperative heading, 8 words or fewer (e.g. "Lead with the pain, not the stack.").
- what_landed: ONE sentence, ONLY if the transcript has a genuinely strong line, a concrete demo,
  or clear user pain. If nothing genuinely landed, return null. Do not invent praise.
- critique: ONE tight paragraph. Tie it to the pitch in front of you, not generic startup advice.
- lowest_metric_reason: ONE sentence explaining why the lowest metric (given below) scored low.
- weakest_line:
    - quote: a single weak line copied VERBATIM from the founder transcript. If no single weak
      line exists, set quote to null and name the pattern in why_weak (e.g. "implementation
      before pain").
    - why_weak: ONE sentence on why it costs points.
    - rewrite: a punched-up version the founder can say instead.
"""


def write_feedback(transcript: str, card: Scorecard, model: str = SCORER_MODEL) -> Feedback | None:
    """Best-effort structured critique. Returns None on any failure (logged), so callers can
    simply skip publishing feedback when it isn't available."""
    name, score = lowest_metric(card)
    user = (
        f"FOUNDER TRANSCRIPT:\n{transcript}\n\n"
        f"SCORECARD (0-10 each): idea {card.idea}, execution {card.execution}, "
        f"demo_clarity {card.demo_clarity}, technical_depth {card.technical_depth}, "
        f"why_voice {card.why_voice}. Total {card.total}/100.\n"
        f"The lowest metric is {name} ({score}/10). Explain why it scored low."
    )
    try:
        resp = _get_client().chat.completions.parse(
            model=model,
            temperature=0.3,
            response_format=Feedback,
            messages=[
                {"role": "system", "content": FEEDBACK_PROMPT},
                {"role": "user", "content": user},
            ],
        )
        parsed = resp.choices[0].message.parsed
        if parsed is not None:
            return parsed
    except Exception:
        logger.warning("write_feedback failed; skipping feedback", exc_info=True)
    return None
