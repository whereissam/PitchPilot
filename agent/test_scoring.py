import os
import pytest

from scoring import score_pitch

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

REQUIRED_KEYS = {
    "idea", "execution", "demo_clarity", "technical_depth",
    "why_voice", "benchmark_present", "best_next_fix",
}


def test_shape():
    card = score_pitch(BAD)
    assert REQUIRED_KEYS.issubset(card.keys())
    for k in ["idea", "execution", "demo_clarity", "technical_depth", "why_voice"]:
        assert isinstance(card[k], int) and 0 <= card[k] <= 10
    assert isinstance(card["benchmark_present"], bool)
    assert isinstance(card["best_next_fix"], str) and card["best_next_fix"]


def test_good_beats_bad():
    bad = score_pitch(BAD)
    good = score_pitch(GOOD)
    assert good["idea"] + good["why_voice"] >= bad["idea"] + bad["why_voice"]
    assert good["benchmark_present"] is True
