import json

from openai import OpenAI

RUBRIC_PROMPT = """\
You score a hackathon pitch transcript against this rubric.
Idea (50%): technical depth and coolness.
Execution (50%): how impressive the demo sounds, and whether a useful eval/benchmark exists.
Also judge: clarity of the demo, strength of the "why realtime voice" justification,
and whether any benchmark/eval is mentioned.
Be a tough but fair judge; a vague pitch scores low.

Return ONLY a JSON object with EXACTLY these keys:
{"idea": <int 0-10>, "execution": <int 0-10>, "demo_clarity": <int 0-10>,
 "technical_depth": <int 0-10>, "why_voice": <int 0-10>,
 "benchmark_present": <true|false>, "best_next_fix": "<one sentence>"}
"""

_INT_KEYS = ["idea", "execution", "demo_clarity", "technical_depth", "why_voice"]


def _normalize(data: dict) -> dict:
    out = {}
    for k in _INT_KEYS:
        try:
            out[k] = max(0, min(10, int(data.get(k, 0))))
        except (TypeError, ValueError):
            out[k] = 0
    out["benchmark_present"] = bool(data.get("benchmark_present", False))
    out["best_next_fix"] = str(data.get("best_next_fix") or "No fix suggested.")
    return out


def score_pitch(transcript: str, model: str = "gpt-4o-mini") -> dict:
    client = OpenAI()
    for _ in range(2):
        try:
            resp = client.chat.completions.create(
                model=model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": RUBRIC_PROMPT},
                    {"role": "user", "content": transcript},
                ],
            )
            return _normalize(json.loads(resp.choices[0].message.content))
        except Exception:
            continue
    return {
        **{k: 0 for k in _INT_KEYS},
        "benchmark_present": False,
        "best_next_fix": "scoring unavailable — check OPENAI_API_KEY",
    }
