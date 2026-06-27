# PitchPilot — Richer Written Feedback Design

**Date:** 2026-06-27
**Status:** Approved, ready for implementation plan
**Builds on:** [judgemode design](2026-06-27-judgemode-design.md) ·
[pitch history design](2026-06-27-pitch-history-design.md)

## Problem

The scorecard tells you *what* you scored (65/100, why_voice 3/10) but not *why*, and not
*how to fix the exact sentence that cost you*. A founder reads the numbers and the one-line
`best_next_fix`, but there's no connective tissue between the qualitative judgement and the
score, and no concrete rewrite to copy.

This feature adds a short, structured **written critique** delivered alongside the verdict and
saved with every pitch: one paragraph of critique, the reason the lowest metric dragged the
score, and the founder's weakest line quoted verbatim with a punched-up rewrite.

It makes PitchPilot feel like a real judge:

> "Your weakest metric was why_voice: 3/10 — the pitch still sounds like chat with a microphone.
> You said 'we use LiveKit and OpenAI realtime to score pitches'; lead with the pain instead:
> 'Hackathon teams lose judges in the first 20 seconds, so PitchPilot interrupts the weak line
> before it kills the demo.'"

## Scope

**In scope:**
- A typed `Feedback` produced by one extra `gpt-4o` call in the agent, right after `score_pitch()`.
- Published on a new `feedback` data-channel topic; shown on the live verdict screen.
- Saved with the pitch record and shown on the history detail page.

**Out of scope (possible future specs):**
- Web-search-enriched feedback (market/competitor grounding).
- Retroactively generating feedback for already-saved pitches.
- Spoken delivery of the written feedback (it is read on screen, not read aloud).

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Where generated | In the agent, live, right after scoring | Reuses the publish → browser → save pipeline already built; the web app stays free of `OPENAI_API_KEY`. |
| Which metric is "lowest" | Computed in **code** (argmin over the five), reason written by the model | The project rule: the model writes prose, code owns the numbers. `lowest_metric` can never disagree with the scorecard. |
| Contents | `what_landed?`, `critique`, `lowest_metric{name,score,reason}`, `weakest_line{quote,why_weak,rewrite}` | Connects the critique to the score and gives a copy-pasteable rewrite. `what_landed` optional so praise is never forced. |
| Requiredness | Best-effort, like transcript and audio | The scorecard remains the only required artifact; a feedback failure must never block the verdict, the voice, or the save. |
| Model | `gpt-4o` (same as the scorer), `temperature` low | Prose quality matters for the rewrite. |

## Data model (`agent/feedback.py`, new)

A typed sibling to `Scorecard`, produced via the same Pydantic + structured-outputs path.

```python
class WeakestLine(BaseModel):
    quote: str        # verbatim from the founder transcript
    why_weak: str     # one sentence
    rewrite: str      # punched-up version

class Feedback(BaseModel):
    what_landed: str | None    # optional — only if something genuinely worked
    critique: str              # one tight paragraph
    lowest_metric_reason: str  # one sentence — the model's job
    weakest_line: WeakestLine

    def payload(self, name: str, score: int) -> dict:
        """JSON for the data channel. name + score are injected from code (the
        argmin over the scorecard), never chosen by the model."""
        return {
            "what_landed": self.what_landed,
            "critique": self.critique,
            "lowest_metric": {"name": name, "score": score, "reason": self.lowest_metric_reason},
            "weakest_line": self.weakest_line.model_dump(),
        }
```

The published / saved JSON shape:

```jsonc
{
  "what_landed": "The live interruption demo is easy to understand.",   // or null
  "critique": "The pitch has a clear hook, but spends too long on implementation before…",
  "lowest_metric": { "name": "why_voice", "score": 4, "reason": "You say it uses voice but…" },
  "weakest_line": {
    "quote": "We use LiveKit and OpenAI realtime to score hackathon pitches.",
    "why_weak": "That describes the stack before the pain.",
    "rewrite": "Hackathon teams lose judges in the first 20 seconds, so PitchPilot interrupts…"
  }
}
```

`lowest_metric.name` is one of `idea | execution | demo_clarity | technical_depth | why_voice`.

## Lowest-metric computation (code)

A pure helper (`lowest_metric(card) -> tuple[str, int]`) returns the argmin over the five
0–10 fields. Ties are broken by interruption priority so the most pitch-relevant weakness wins:

```
why_voice → demo_clarity → technical_depth → execution → idea
```

This is the only numeric input to the feedback prompt and is unit-testable without a key.

## Agent flow

`write_feedback(transcript: str, card: Scorecard, model="gpt-4o") -> Feedback | None` in
`feedback.py`:

1. Compute `(name, score) = lowest_metric(card)`.
2. One structured-outputs call: system prompt (a feedback-writer persona consistent with the
   judge voice — direct, no buzzwords, no praise unless earned) + the transcript + the
   scorecard numbers + "the lowest metric is `name` (`score`/10); explain why." Returns `Feedback`.
3. Lazy module client + `logging.warning(..., exc_info=True)` fallback returning `None`, mirroring
   the hardened `score_pitch()`.

In `agent/main.py` `_publish_card()`, **after** the scorecard is published (so the voice reads
the verdict without waiting on a second call):

```python
fb = await asyncio.to_thread(write_feedback, pitch, card)
if fb is not None:
    name, score = lowest_metric(card)
    await ctx.room.local_participant.publish_data(
        json.dumps(fb.payload(name, score)).encode("utf-8"), reliable=True, topic="feedback"
    )
```

Wrapped so any failure is logged and swallowed — the scorecard, transcript publish, and spoken
verdict are unaffected.

## Save & timing

The feedback is a second LLM call, so it lands a beat after the scorecard. Today the browser
saves on scorecard arrival; that would race the feedback. Change:

- On `scorecard` arrival, start a **grace window** (~8s) and keep the latest `feedback` payload
  received on the `feedback` topic.
- Save once **either** the feedback arrives **or** the window elapses — whichever first. The
  POST includes `feedback` (or `null`).
- One write-once POST, as today. The audio recorder still stops inside the save step.

Storage: `PitchRecord` gains an optional `feedback: Feedback | null` field (additive; older
records simply lack it; `version` stays `1`). The web POST route accepts `feedback` inside the
existing `meta` JSON and persists it as-is — the web app never calls OpenAI.

**Best-effort:** feedback joins transcript and audio. The scorecard is still the only required
artifact; a missing/failed/slow feedback saves as `null` and the record is still valid.

## UI

A new `web/src/components/FeedbackPanel.tsx` (extracted and reused, like `Scoreboard`), rendered
below the `Scoreboard`:

- **what landed** — shown only when present.
- **critique** — the paragraph.
- **lowest metric** — a chip, e.g. `WHY_VOICE 3/10`, with the one-line reason.
- **weakest line** — the `quote`, the `why_weak` line, and the `rewrite` shown as a
  before → after pair, in the existing cobalt/acid brutalist style.

Mounted in two places:
- **Live verdict screen** (`JudgeApp`): appears when the `feedback` topic arrives (a beat after
  the scoreboard). Hidden until then.
- **History detail** (`history.$id`): shown when `record.feedback` is present; hidden otherwise.

## Error handling

- **Feedback call fails / returns None:** agent logs a warning, publishes nothing. Browser grace
  window elapses, saves `feedback: null`. UI hides the panel.
- **Quote not verbatim:** the prompt requires a verbatim founder line; this is best-effort and
  not hard-validated (low risk). The rewrite is still useful even if the quote is lightly
  paraphrased.
- **Malformed `feedback` payload in the browser:** caught and ignored, exactly like the existing
  `scorecard` / `transcript` handlers.

## Testing

- **Python unit (no key):** `lowest_metric(card)` — argmin and the tie-break priority order, plus
  an all-equal case.
- **Python shape test (skips without key):** `write_feedback` returns a `Feedback` with the
  expected fields, mirroring the `score_pitch` shape test in `test_scoring.py`.
- **Web unit:** extend `web/src/lib/pitches.test.ts` so a record round-trips both with a
  `feedback` object and with `feedback: null`.
- **Manual smoke:** real session → verdict screen shows the feedback panel a beat after the
  scoreboard → the saved record on `/history/$id` shows the same feedback.

## File-level change summary

- `agent/feedback.py` (new) — `WeakestLine`, `Feedback`, `lowest_metric()`, `write_feedback()`.
- `agent/main.py` — generate + publish the `feedback` topic in `_publish_card()` (best-effort).
- `agent/test_feedback.py` (new) — lowest-metric unit tests + a skipped-without-key shape test.
- `web/src/lib/pitches.ts` (+ test) — add optional `feedback` to `PitchRecord`.
- `web/src/routes/api.pitches.ts` — accept `feedback` from `meta` and persist it.
- `web/src/components/FeedbackPanel.tsx` (new) — the panel.
- `web/src/components/JudgeApp.tsx` — collect the `feedback` topic, grace-window the save, render
  the panel on the verdict screen.
- `web/src/routes/history.$id.tsx` — render the panel when `record.feedback` is present.
