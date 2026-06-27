# PitchPilot — Pitch History & Progress Design

**Date:** 2026-06-27
**Status:** Approved, ready for implementation plan
**Builds on:** [judgemode design](2026-06-27-judgemode-design.md)

## Problem

Today PitchPilot is **ephemeral**. You pitch, the judge barges in, you say "score me,"
you get a scorecard on screen — and then nothing is kept. Close the tab and the session is
gone. There is no way to re-read what you said, replay your voice, or see whether your score
is climbing across practice runs.

A single review is a **tool**. Many reviews plus a score trend is a **training system**. This
feature is what turns PitchPilot from a realtime-judge gimmick into a **voice pitch practice
loop**:

> PitchPilot doesn't just judge a pitch. It turns every practice run into a measurable
> improvement loop — saved, scored, and compared, so a team can *prove* their pitch got better.

It also upgrades the eval story. The benchmark starts as fixtures (bad vs good). With history,
it becomes **personal**: every team can compare their own pitch before and after revision.

> Eval starts as fixtures. Then it becomes your own history.

## Scope

**In scope (this spec):**
- Save every finished pitch to local disk. **Scorecard is required; transcript and audio are
  best-effort.**
- A history page that leads with a **score-over-time trend**, then a list.
- A per-pitch detail page.
- Optional audio replay (phased — see Phasing).
- One small agent change: publish the transcript on the data channel.
- Update `docs/pitch-deck.html` with a new slide framing the practice loop.

**Explicitly out of scope (possible future specs):**
- Accounts / login / multi-user (decision: **single user, no login**).
- Richer LLM-generated written critique beyond the scorecard.
- Web-search-enriched feedback.
- Sharing / sending pitches to others.

These were considered and deferred — the user chose "memory / progress" as the core.

## Phasing (protects the demo)

This is a real product feature, not a 3-hour add-on, so it ships in slices. Each slice is
demo-able on its own; stop at any line and the demo still tells the story.

| Phase | Ships | Demo story |
| --- | --- | --- |
| **V1 — text history (must-have)** | Save scorecard + transcript; `/history` with score trend; detail page | "Every run is saved and scored — watch the trend climb." This is the whole product story. |
| **V1.5 — audio replay (nice-to-have)** | Browser audio capture + upload + `/audio` route + player | "…and replay your actual voice." |
| **V2 — deck** | New pitch-deck slide | Investor/judge framing. |

**Audio timebox:** in implementation, if browser audio capture + upload isn't working within
~20 minutes, **ship text-only history and move on.** Audio replay is cool but it is *not*
required for the progress loop, and `MediaRecorder` + LiveKit local-track + stop-timing +
multipart upload is the riskiest part of this spec.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Users | Single user, no login | Simplest; great for demo. Keeps the whole feature local. |
| **What must persist** | **Scorecard required; transcript optional; audio optional** | The live judging loop must never fail because persistence failed. A save with `transcript: []` and no audio is still a valid, useful record (the trend only needs the total). |
| Storage | Flat JSON + audio files in `data/pitches/` | No native deps (Vite/Nitro server isn't Bun, so no `bun:sqlite`); a directory read trivially powers history + trend. SQLite/cloud is overkill at one user. |
| Who saves | The web app | It already has server routes (`api.token.ts`) and serves the pages. One place to own persistence. |
| Audio capture | Browser `MediaRecorder` on LiveKit's local mic track | No LiveKit egress config or extra cloud cost; blob uploads when the verdict lands. Phased as V1.5. |

**Core safety decision (must be honored in implementation):**

> **Scorecard persistence is required; transcript and audio are best-effort.**
> Why: the live judging loop must never fail because persistence failed. The most important
> saved artifact is the **score trend**, not a complete transcript or a recording.

## Architecture & data flow

```
 During pitch                          On "score me" / verdict
 ───────────                           ───────────────────────
 Agent (Python)                        Agent publishes:
   • already scores pitch                • topic "scorecard"  (existing, REQUIRED)
   • NEW: also publishes transcript      • topic "transcript" (NEW, optional)
                                              │
 Browser (JudgeApp)                          ▼
   • (V1.5) MediaRecorder taps the   Browser collects { scorecard, transcript?, audioBlob? }
     local mic track                  and POSTs once to  /api/pitches  (multipart)
                                              │
                                              ▼
                              Web server route writes to disk:
                                data/pitches/<id>.json   ← always (scorecard + meta)
                                data/pitches/<id>.webm   ← only if audio present
```

Fallback rule: if the `transcript` topic never arrives, the browser still saves the scorecard
with `transcript: []`. If audio capture failed or is disabled, it still saves with
`audioExt: null`. **Only the scorecard is required to produce a valid record.**

A saved pitch = **one JSON file + (optionally) one audio file**. `id` is an ISO-ish,
filesystem-safe, sortable timestamp string (e.g. `2026-06-27T16-40-12-704Z`), so "newest first"
and "score over time" are a directory read + sort. The `data/` directory is gitignored.

## Components

### 1. Storage format

`data/pitches/<id>.json`:

```jsonc
{
  "version": 1,
  "id": "2026-06-27T16-40-12-704Z",
  "createdAt": "2026-06-27T16:40:12.704Z",
  "total": 81,                 // top-level: list/trend never parses the scorecard schema
  "verdict": "Verdict: demo-ready.",
  "scorecard": { /* exact card.payload(): idea, execution, demo_clarity,
                    technical_depth, why_voice, benchmark_present,
                    best_next_fix, verdict, total */ },
  "transcript": [              // optional — [] if the transcript topic never arrived
    { "role": "founder", "text": "..." },
    { "role": "judge",   "text": "..." }
  ],
  "audioExt": "webm"           // null if no audio was captured
}
```

`total` and `verdict` are duplicated at the top level on purpose: the list/trend route reads
only those and never needs to understand the scorecard's internal shape. `version` is cheap now
and saves pain if the schema changes later. The audio file `data/pitches/<id>.webm` is written
**only** when audio is present.

### 2. Server routes (TanStack Start, mirror `api.token.ts` style)

**V1 (must-have) — three routes:**

- **`POST /api/pitches`** — accepts `multipart/form-data` with a `meta` JSON field
  (`scorecard`, optional `transcript`) and an optional `audio` blob. Validates that a scorecard
  is present (rejects otherwise); generates `id` from the current time; writes `<id>.json` with
  top-level `total`/`verdict` lifted from the scorecard, and `<id>.<audioExt>` only if audio was
  sent. Returns `{ id, createdAt }`. Creates `data/pitches/` on first write.
- **`GET /api/pitches`** — reads the directory, returns a lightweight list
  `[{ id, createdAt, total, verdict }]` sorted newest-first (reading only the top-level fields).
  Skips and logs any unparseable file rather than failing the whole list.
- **`GET /api/pitches/$id`** — returns the full record. 404 if missing.

**V1.5 (with audio):**

- **`GET /api/pitches/$id/audio`** — streams the audio file with the correct content-type
  (e.g. `audio/webm`). 404 if no audio for that id.

All file paths are resolved under a single `data/pitches/` base; `$id` is validated against the
timestamp pattern before being used in a path (no traversal).

### 3. Frontend — capture

In `web/src/components/JudgeApp.tsx`:
- Keep the latest `transcript` payload received on the `transcript` data topic (may never come).
- **(V1.5)** When the LiveKit room connects, start a `MediaRecorder` on the **local mic track's**
  `MediaStreamTrack` (from the room's local participant), buffering chunks.
- When a `scorecard` data message arrives (the verdict moment): (V1.5) stop the recorder and
  assemble the blob; then `POST /api/pitches` once with `{ scorecard, transcript?, audioBlob? }`.
- Show a small **"SAVED ✓"** marker under the verdict (and a quiet failure note if the POST
  fails — the live verdict still works regardless).
- Saving is best-effort and must never break the live experience. A missing transcript or audio
  must not block the save.

### 4. Frontend — history pages (new TanStack routes)

- **`web/src/routes/history.tsx`** (`/history`): leads with **progress, not a file list**.
  - Top: a **score trend** — heading like **"Proof you improved"** and the totals oldest→newest,
    e.g.

    ```
    Run 01   38 / 100   implementation-led
    Run 02   61 / 100   clearer problem
    Run 03   81 / 100   demo-ready
    ```

    rendered as a simple line/sequence in the existing cobalt/acid styling.
  - Below: the full list (date · `TOTAL/100` · verdict), newest first, each linking to detail.
  - Empty state when no pitches yet.
- **`web/src/routes/history.$id.tsx`** (`/history/:id`): reuses the existing `Scoreboard`
  component for the card, plus the full transcript (founder vs judge styling). **(V1.5)** an
  `<audio controls>` player pointed at `/api/pitches/$id/audio`, shown only when `audioExt` is set.
- Add a **HISTORY** link in the app header / landing screen so it's reachable.

(If time is very tight, `/history` can ship before the detail page by expanding the most recent
transcript inline. The detail page is cleaner and is the default target when time allows.)

### 5. Agent change

In `agent/main.py` `_publish_card()`: after publishing the scorecard, also call
`publish_data(topic="transcript")` with a JSON array of `{role, text}` lines built from the
already-captured `full_transcript` (mapping the realtime roles to `founder`/`judge`). No other
agent behavior changes; the scorecard remains the one source of truth for numbers. If this
publish fails, the browser falls back to `transcript: []` — the save still happens.

### 6. Pitch deck

Update `docs/pitch-deck.html`. The new slide is **product-loop framing, not storage tech.**

- **Title:** *The loop doesn't end at the buzzer.*
- **Body:**

  ```
  Every practice run becomes a record:
  scorecard · transcript · replay

  Teams can see whether the pitch actually improved —
  not just whether it felt better.
  ```

- **Visual:** three score blocks showing progress:

  ```
  Run 01   38/100   "implementation-led"
  Run 02   61/100   "clearer problem"
  Run 03   81/100   "demo-ready"
  ```

- **Bottom line:** `Practice → interrupted → scored → revised → improved`
- Optionally fold in the personal-benchmark point: *Eval starts as fixtures. Then it becomes
  your own history.*
- Keep the cobalt-grid visual language (hairlines, pixel-glitch, mono tags). Renumber page
  markers from `xx / 07` to `xx / 08` across all slides, including the new one. The vanilla
  slide nav counts `.slide` elements, so it picks up the new slide automatically.

## Error handling

- **Transcript topic never arrives:** save with `transcript: []`. Not an error.
- **Mic/recording unavailable or audio timeboxed out:** save with `audioExt: null`; detail page
  hides the player. Not an error.
- **POST fails:** quiet inline note on the verdict screen; nothing else breaks; user can still
  see the live scorecard.
- **Missing scorecard:** the only hard failure — POST is rejected. (In practice the scorecard
  always arrives before save is triggered, since the scorecard message *is* the trigger.)
- **Corrupt/partial JSON file in `data/pitches/`:** list route skips it with a warning; detail
  route 404s.
- **Bad `$id`:** routes reject ids not matching the timestamp pattern (no path traversal).

## Testing

- **Server routes:** unit tests (vitest) for the storage round-trip — POST a scorecard-only
  record (no transcript, no audio) and confirm it saves; POST with transcript + audio; GET the
  list (top-level fields only, newest-first ordering); GET by id; GET a missing id (404); reject
  a traversal-y id; reject a POST with no scorecard. Use a temp `data/` dir.
- **Trend/list shaping:** a small pure function that maps records → list/trend points, unit
  tested (ordering, empty case, scorecard-only records).
- **Agent:** the transcript publish is covered by manual smoke test (consistent with the
  existing voice smoke-test approach); no new automated agent test required.
- **Manual smoke:** run a real session, say "score me," confirm a `.json` appears in
  `data/pitches/` (even with audio disabled), then open `/history`, see the trend, open the
  detail page, and (V1.5) replay the audio.

## Implementation order

Strictly incremental — each step is independently demo-able. Ship in this order:

1. **Save scorecard JSON only** (`POST /api/pitches` + storage helper; top-level total/verdict + version).
2. **`/history` list + score trend** (`GET /api/pitches`).
3. **Save transcript** (agent publishes `transcript`; browser includes it; best-effort).
4. **Detail page** (`GET /api/pitches/$id`, reuse `Scoreboard` + transcript).
5. **Audio recording** (MediaRecorder + multipart upload) — *timeboxed; skippable.*
6. **Audio replay** (`GET /api/pitches/$id/audio` + player).
7. **Deck slide** (product-loop framing + renumber to `/08`).

If the clock runs out, stopping after step 4 still ships the complete progress-loop story.

## File-level change summary

- `agent/main.py` — publish `transcript` topic in `_publish_card()` (best-effort).
- `web/src/lib/pitches.ts` (new) — storage read/write helpers + record→list/trend shaping
  (the unit-testable core).
- `web/src/routes/api.pitches.ts` (+ `api.pitches.$id.ts`, and `api.pitches.$id.audio.ts` in
  V1.5) — the endpoints.
- `web/src/routes/history.tsx`, `web/src/routes/history.$id.tsx` (new) — history pages.
- `web/src/components/JudgeApp.tsx` — save-on-verdict + SAVED marker + HISTORY link; (V1.5)
  MediaRecorder capture.
- `.gitignore` — add `data/`.
- `docs/pitch-deck.html` — new slide + renumbering.
</content>
