import os

import pytest

from feedback import Feedback, lowest_metric
from scoring import Scorecard


def _card(**over) -> Scorecard:
    base = dict(
        idea=5,
        execution=5,
        demo_clarity=5,
        technical_depth=5,
        why_voice=5,
        benchmark_present=True,
        best_next_fix="x",
        verdict="Verdict: ok.",
    )
    base.update(over)
    return Scorecard(**base)


def test_lowest_metric_picks_the_unique_minimum():
    assert lowest_metric(_card(why_voice=2)) == ("why_voice", 2)
    assert lowest_metric(_card(idea=1)) == ("idea", 1)
    assert lowest_metric(_card(technical_depth=3)) == ("technical_depth", 3)


def test_tie_break_favors_pitch_impact_over_technical():
    # demo_clarity and execution tie at 4 — demo_clarity wins (higher priority).
    assert lowest_metric(_card(demo_clarity=4, execution=4)) == ("demo_clarity", 4)
    # execution and technical_depth tie — execution wins.
    assert lowest_metric(_card(execution=4, technical_depth=4)) == ("execution", 4)
    # why_voice beats everything on a tie.
    assert lowest_metric(_card(why_voice=4, demo_clarity=4)) == ("why_voice", 4)


def test_all_equal_returns_highest_priority():
    assert lowest_metric(_card()) == ("why_voice", 5)


def test_payload_injects_code_owned_name_and_score():
    fb = Feedback(
        action_title="Lead with the pain.",
        what_landed=None,
        critique="Too much stack.",
        lowest_metric_reason="Sounds like chat.",
        weakest_line={"quote": None, "why_weak": "stack before pain", "rewrite": "Teams lose judges fast."},
    )
    out = fb.payload("why_voice", 3)
    assert out["lowest_metric"] == {"name": "why_voice", "score": 3, "reason": "Sounds like chat."}
    assert out["action_title"] == "Lead with the pain."
    assert out["what_landed"] is None
    assert out["weakest_line"]["quote"] is None


@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="needs OPENAI_API_KEY")
def test_write_feedback_shape():
    from feedback import write_feedback

    fb = write_feedback("We use LiveKit and OpenAI to score pitches.", _card(why_voice=3))
    assert fb is not None
    assert isinstance(fb.critique, str) and fb.critique
    assert isinstance(fb.action_title, str) and fb.action_title
    assert fb.weakest_line.rewrite
