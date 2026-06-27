# PitchPilot — Richer Written Feedback Design

**Date:** 2026-06-27
**Status:** Approved, ready for implementation plan
**Builds on:** [judgemode design](2026-06-27-judgemode-design.md) ·
[pitch history design](2026-06-27-pitch-history-design.md)

## Problem

The scorecard tells you **where** you lost points. Feedback shows **the sentence that lost
them** — and how to rewrite it. A founder reads the numbers and the one-line `best_next_fix`,
but there's no connective tissue between the qualitative judgement and the score, and no
concrete rewrite to copy.

**Guiding principle:** *Feedback is not another judge. Feedback is an explanation of the
scorecard.* The scorecard owns the numbers; feedback only explains and fixes. This is why the
lowest metric is chosen in code, never by the model.

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
- A typed `Feedback` produced by one extra LLM call (same model as the scorer) in the agent,
  right after `score_pitch()`.
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
| Model | A shared `SCORER_MODEL` constant; feedback follows the scorer | Keeps the two in sync (today the scorer hardcodes `gpt-4o`; the deck wrongly says `gpt-4o-mini`). Because feedback is best-effort, dropping `SCORER_MODEL`/the feedback call to `gpt-4o-mini` for lower latency is acceptable — upgrade to `gpt-4o` only if rewrite quality is visibly weak. |

## Data model (`agent/feedback.py`, new)

A typed sibling to `Scorecard`, produced via the same Pydantic + structured-outputs path.

```python
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
        """JSON for the data channel. name + score are injected from code (the
        argmin over the scorecard), never chosen by the model."""
        return {
            "action_title": self.action_title,
            "what_landed": self.what_landed,
            "critique": self.critique,
            "lowest_metric": {"name": name, "score": score, "reason": self.lowest_metric_reason},
            "weakest_line": self.weakest_line.model_dump(),
        }
```

`action_title` is a one-line summary usable as the panel heading and (lifted to top level — see
Save & timing) as a history-list preview, e.g. `81/100 · Lead with the pain, not the stack.`

The published / saved JSON shape:

```jsonc
{
  "action_title": "Lead with the pain, not the stack.",
  "what_landed": "The live interruption demo is easy to understand.",   // or null
  "critique": "The pitch has a clear hook, but spends too long on implementation before…",
  "lowest_metric": { "name": "why_voice", "score": 4, "reason": "You say it uses voice but…" },
  "weakest_line": {
    "quote": "We use LiveKit and OpenAI realtime to score hackathon pitches.",  // or null
    "why_weak": "That describes the stack before the pain.",
    "rewrite": "Hackathon teams lose judges in the first 20 seconds, so PitchPilot interrupts…"
  }
}
```

`lowest_metric.name` is one of `idea | execution | demo_clarity | technical_depth | why_voice`.

## Lowest-metric computation (code)

A pure helper (`lowest_metric(card) -> tuple[str, int]`) returns the argmin over the five
0–10 fields. Ties are broken by a priority order that favors pitch/demo impact over deep
technical critique — PitchPilot's mission is making the pitch land, not grading engineering:

```
why_voice → demo_clarity → execution → technical_depth → idea
```

This is the only numeric input to the feedback prompt and is unit-testable without a key.

## Agent flow

`write_feedback(transcript: str, card: Scorecard, model=SCORER_MODEL) -> Feedback | None` in
`feedback.py` (`SCORER_MODEL` is the shared constant the scorer also uses):

1. Compute `(name, score) = lowest_metric(card)`.
2. One structured-outputs call: system prompt (a feedback-writer persona consistent with the
   judge voice — direct, no buzzwords, no praise unless earned) + the transcript + the
   scorecard numbers + "the lowest metric is `name` (`score`/10); explain why." Returns `Feedback`.
   The prompt makes three rules explicit, to keep the model honest:
   - **`what_landed`:** set it only if the transcript has a genuinely strong line, a concrete
     demo, or clear user pain. Otherwise return `null`. Do not invent praise.
   - **`weakest_line.quote`:** copy a single weak line **verbatim** from the founder transcript.
     If no single weak line exists, set `quote` to `null` and put the pattern in `why_weak`
     (e.g. "implementation before pain"). Never fabricate a quote.
   - **`action_title`:** a short imperative heading (≤ ~8 words), e.g. "Lead with the pain, not
     the stack."
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
saves on scorecard arrival; that would race the feedback. The verdict must still feel instant,
so the scorecard never waits on feedback:

1. `scorecard` arrives → render the scoreboard **immediately**.
2. Feedback pending → the saved-marker shows **"Writing critique…"**.
3. Start a **grace window (~5s)** and keep the latest `feedback` payload from the `feedback` topic.
4. Save once **either** the feedback arrives **or** the window elapses — whichever first. The
   marker becomes **"Saved ✓"** (or **"Saved without critique"** on timeout).

One write-once POST, as today; the POST includes `feedback` (or `null`). The audio recorder still
stops inside the save step. (A two-write save-then-update was considered for snappier UX but
rejected to keep write-once-file storage simple — a 5s window is short enough.)

Storage: `PitchRecord` gains an optional `feedback: Feedback | null` field (additive; older
records simply lack it; `version` stays `1`). `action_title` is **also lifted to a top-level
`actionTitle: string | null`** (like `total`/`verdict`) so the history **list** route can preview
it without parsing the feedback object. The web POST route accepts `feedback` inside the existing
`meta` JSON, lifts `actionTitle` from it, and persists both as-is — the web app never calls OpenAI.

**Best-effort:** feedback joins transcript and audio. The scorecard is still the only required
artifact; a missing/failed/slow feedback saves as `null` and the record is still valid.

## UI

A new `web/src/components/FeedbackPanel.tsx` (extracted and reused, like `Scoreboard`), rendered
below the `Scoreboard`. It must stay **short and scannable** — an explanation, not an essay.
`action_title` is the panel heading; fixed section order:

```
WHAT LANDED            (only if what_landed is present)
The live interruption moment is easy to understand.

LOWEST METRIC
WHY_VOICE 3/10
This still sounds like a text reviewer with a microphone.

CRITIQUE
You have a strong demo hook, but the pitch leads with implementation before proving why
realtime interruption matters. Make the pain concrete first, then show the barge-in.

WEAKEST LINE
Before:  "We use LiveKit and OpenAI realtime to score hackathon pitches."
After:   "Hackathon teams lose judges in the first 20 seconds, so PitchPilot interrupts the
          weak line before it kills the demo."
```

- **Quote-null fallback:** when `weakest_line.quote` is `null`, drop the Before/After pair and
  show a single `Weakest pattern: <why_weak>` line, then the `rewrite` as the fix — never a
  fake quote.
- Existing cobalt/acid brutalist style. No long explanations.

Mounted in two places:
- **Live verdict screen** (`JudgeApp`): appears when the `feedback` topic arrives (a beat after
  the scoreboard). Hidden until then.
- **History detail** (`history.$id`): shown when `record.feedback` is present; hidden otherwise.

## Error handling

- **Feedback call fails / returns None:** agent logs a warning, publishes nothing. Browser grace
  window elapses, saves `feedback: null`. UI hides the panel.
- **No clear weak line:** the model returns `quote: null`; the UI shows the pattern instead of a
  fabricated quote. The quote is otherwise best-effort and not hard-validated (low risk).
- **Malformed `feedback` payload in the browser:** caught and ignored, exactly like the existing
  `scorecard` / `transcript` handlers.

## Testing

- **Python unit (no key):** `lowest_metric(card)` — argmin and the tie-break priority order, plus
  an all-equal case.
- **Python shape test (skips without key):** `write_feedback` returns a `Feedback` with the
  expected fields, mirroring the `score_pitch` shape test in `test_scoring.py`.
- **Web unit:** extend `web/src/lib/pitches.test.ts` so a record round-trips both with a
  `feedback` object (and top-level `actionTitle` lifted) and with `feedback: null`
  (`actionTitle: null`); the list item exposes `actionTitle`.
- **Manual smoke:** real session → verdict screen shows the feedback panel a beat after the
  scoreboard → the saved record on `/history/$id` shows the same feedback.

## Implementation order

Live panel first — it's the biggest demo value; save/timing comes after.

1. `lowest_metric(card)` + Python unit tests.
2. `WeakestLine` / `Feedback` Pydantic schema (+ `SCORER_MODEL` shared constant).
3. `write_feedback()` returns the structured object (skipped-without-key shape test).
4. Agent publishes the `feedback` topic, best-effort.
5. Frontend receives the topic and renders `FeedbackPanel` **live** on the verdict screen.
6. Persist `feedback` (+ lifted `actionTitle`) into the pitch record (grace-window save).
7. History detail renders the saved feedback; history list previews `actionTitle`.

## File-level change summary

- `agent/feedback.py` (new) — `WeakestLine`, `Feedback`, `lowest_metric()`, `write_feedback()`.
- `agent/scoring.py` — extract a shared `SCORER_MODEL` constant (used by the scorer and the
  feedback writer); reconcile the deck's stale `gpt-4o-mini` claim to match in passing.
- `agent/main.py` — generate + publish the `feedback` topic in `_publish_card()` (best-effort).
- `agent/test_feedback.py` (new) — lowest-metric unit tests + a skipped-without-key shape test.
- `web/src/lib/pitches.ts` (+ test) — add optional `feedback` to `PitchRecord` and top-level
  `actionTitle` to the record + list item.
- `web/src/routes/api.pitches.ts` — accept `feedback` from `meta`, lift `actionTitle`, persist both.
- `web/src/components/FeedbackPanel.tsx` (new) — the panel.
- `web/src/components/JudgeApp.tsx` — collect the `feedback` topic, "Writing critique…" pending
  state, grace-window the save, render the panel on the verdict screen.
- `web/src/routes/history.$id.tsx` — render the panel when `record.feedback` is present.
- `web/src/routes/history.tsx` — preview `actionTitle` in the list when present.
