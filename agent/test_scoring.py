import os
import pytest

from scoring import Scorecard, score_pitch

pytestmark = pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY"), reason="needs OPENAI_API_KEY"
)

BAD = "user: We use LiveKit, realtime transcription, OpenAI, scoring, and data channels. We wired up the API and it runs."
GOOD = (
    "user: Hackathon teams get two minutes to convince judges but don't know what judges "
    "listen for. JudgeMode is a realtime voice judge that interrupts weak pitches. "
    "It must be realtime voice because a mentor interrupts you while you practice, not after "
    "you fail on stage. We also ship a scoring benchmark with bad and good fixture pitches."
)

_INT_FIELDS = ["idea", "execution", "demo_clarity", "technical_depth", "why_voice"]


def test_shape():
    card = score_pitch(BAD)
    assert isinstance(card, Scorecard)
    for f in _INT_FIELDS:
        v = getattr(card, f)
        assert isinstance(v, int) and 0 <= v <= 10
    assert isinstance(card.benchmark_present, bool)
    assert card.best_next_fix
    assert card.verdict
    # total is computed in code from the two rubric axes, never invented by the model
    assert card.total == (card.idea + card.execution) * 5
    assert 0 <= card.total <= 100


def test_payload_is_json_safe_and_includes_total():
    card = score_pitch(BAD)
    payload = card.payload()
    assert payload["total"] == card.total
    assert payload["verdict"] == card.verdict
    assert set(_INT_FIELDS).issubset(payload)


def test_good_beats_bad():
    bad = score_pitch(BAD)
    good = score_pitch(GOOD)
    # the core product claim the deck makes: a revised pitch out-scores an implementation dump
    assert good.total > bad.total
    assert good.idea + good.why_voice >= bad.idea + bad.why_voice
    assert good.benchmark_present is True
