# PitchPilot — Pitch History & Progress Design

**Date:** 2026-06-27
**Status:** Approved, ready for implementation plan
**Builds on:** [judgemode design](2026-06-27-judgemode-design.md)

## Problem

Today PitchPilot is **ephemeral**. You pitch, the judge barges in, you say "score me,"
you get a scorecard on screen — and then nothing is kept. Close the tab and the session is
gone. There is no way to re-read what you said, replay your voice, or see whether your score
is climbing across practice runs.

This design gives the pitch an **after-the-buzzer life**: every finished session is saved to
one place, and you can browse history, replay audio, and watch your total score trend over time.

## Scope

**In scope (this spec):**
- Save every finished pitch (scorecard + transcript + audio) to local disk.
- A history list page and a per-pitch detail page in the web app.
- A score-over-time view.
- One small agent change: publish the transcript on the data channel.
- Update `docs/pitch-deck.html` with a new slide for this feature.

**Explicitly out of scope (possible future specs):**
- Accounts / login / multi-user (decision: **single user, no login**).
- Richer LLM-generated written critique beyond the scorecard.
- Web-search-enriched feedback.
- Sharing / sending pitches to others.

These were considered and deferred — the user chose "memory / progress" as the core.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Users | Single user, no login | Simplest; great for demo. Keeps the whole feature local. |
| What to save | Scorecard + transcript + audio | Richest replay; user explicitly chose this. |
| Storage | Flat JSON + audio files in `data/pitches/` | No native deps (Vite/Nitro server isn't Bun, so no `bun:sqlite`); a directory read trivially powers history + trend. SQLite/cloud is overkill at one user. |
| Who saves | The web app | It already has server routes (`api.token.ts`) and serves the pages. One place to own persistence. |
| Audio capture | Browser `MediaRecorder` on LiveKit's local mic track | No LiveKit egress config or extra cloud cost; blob uploads when the verdict lands. |

## Architecture & data flow

```
 During pitch                          On "score me" / verdict
 ───────────                           ───────────────────────
 Agent (Python)                        Agent publishes:
   • already scores pitch                • topic "scorecard"  (existing)
   • NEW: also publishes transcript      • topic "transcript" (NEW)
                                              │
 Browser (JudgeApp)                          ▼
   • MediaRecorder taps the         Browser collects {scorecard, transcript, audioBlob}
     local mic track, recording     and POSTs once to  /api/pitches  (multipart)
     the whole session                         │
                                               ▼
                              Web server route writes to disk:
                                data/pitches/<id>.json   ← scorecard + transcript + meta
                                data/pitches/<id>.webm   ← audio
```

A saved pitch = **one JSON file + one audio file**. `id` is an ISO-ish, filesystem-safe,
sortable timestamp string (e.g. `2026-06-27T16-40-12-704Z`), so "newest first" and
"score over time" are a directory read + sort. The `data/` directory is gitignored.

## Components

### 1. Storage format

`data/pitches/<id>.json`:

```jsonc
{
  "id": "2026-06-27T16-40-12-704Z",
  "createdAt": "2026-06-27T16:40:12.704Z",
  "scorecard": { /* exact card.payload(): idea, execution, demo_clarity,
                    technical_depth, why_voice, benchmark_present,
                    best_next_fix, verdict, total */ },
  "transcript": [
    { "role": "founder", "text": "..." },
    { "role": "judge",   "text": "..." }
  ],
  "audioExt": "webm"
}
```

The audio file `data/pitches/<id>.webm` sits beside it. If audio capture failed (e.g.
permissions), `audioExt` is `null` and no audio file is written — the record still saves.

### 2. Server routes (TanStack Start, mirror `api.token.ts` style)

- **`POST /api/pitches`** — accepts `multipart/form-data` with an `audio` blob and a `meta`
  JSON field (`scorecard`, `transcript`). Generates `id` from the current time, writes
  `<id>.json` and (if present) `<id>.<audioExt>`, returns the saved record `{ id, createdAt }`.
  Creates `data/pitches/` on first write.
- **`GET /api/pitches`** — reads the directory, parses each JSON, returns a lightweight list
  `[{ id, createdAt, total, verdict, benchmark_present }]` sorted newest-first. Skips and logs any
  unparseable file rather than failing the whole list.
- **`GET /api/pitches/$id`** — returns the full record. 404 if missing.
- **`GET /api/pitches/$id/audio`** — streams the audio file with the correct content-type
  (e.g. `audio/webm`). 404 if no audio for that id.

All file paths are resolved under a single `data/pitches/` base; `$id` is validated against the
timestamp pattern before being used in a path (no traversal).

### 3. Frontend — capture

In `web/src/components/JudgeApp.tsx`:
- When the LiveKit room connects, start a `MediaRecorder` on the **local mic track's**
  `MediaStreamTrack` (obtained from the room's local participant), buffering chunks.
- Keep the latest `transcript` payload received on the `transcript` data topic.
- When a `scorecard` data message arrives (the verdict moment): stop the recorder, assemble the
  blob, and `POST /api/pitches` once with `{ scorecard, transcript, audioBlob }`.
- Show a small **"SAVED ✓"** marker under the verdict (and a quiet failure note if the POST
  fails — the live verdict still works regardless).
- Saving is best-effort and must never break the live experience.

### 4. Frontend — history pages (new TanStack routes)

- **`web/src/routes/history.tsx`** (`/history`): brutalist list of past pitches
  (date · `TOTAL/100` · verdict), newest first, each linking to its detail page. Above the list,
  a simple **score-over-time line** built from the totals (oldest→newest). Reuses the existing
  cobalt/acid styling. Empty state when no pitches yet.
- **`web/src/routes/history.$id.tsx`** (`/history/:id`): reuses the existing `Scoreboard`
  component for the card, plus the full transcript (founder vs judge styling) and an
  `<audio controls>` player pointed at `/api/pitches/$id/audio`.
- Add a **HISTORY** link in the app header / landing screen so it's reachable.

### 5. Agent change

In `agent/main.py` `_publish_card()`: after publishing the scorecard, also call
`publish_data(topic="transcript")` with a JSON array of `{role, text}` lines built from the
already-captured `full_transcript` (mapping the realtime roles to `founder`/`judge`). No other
agent behavior changes; the scorecard remains the one source of truth for numbers.

### 6. Pitch deck

Update `docs/pitch-deck.html`:
- Add a new slide (after the current solution/data slides, before the closing colophon):
  **"The loop doesn't end at the buzzer"** — every session saved, score-over-time, replay your
  voice. Keep the cobalt-grid visual language (hairlines, pixel-glitch, mono tags).
- Renumber page markers from `xx / 07` to `xx / 08` across all slides, including the new one.
- The vanilla slide nav already counts `.slide` elements, so it picks up the new slide
  automatically.

## Error handling

- **Mic/recording unavailable:** save proceeds with `audioExt: null`; detail page hides the
  player.
- **POST fails:** quiet inline note on the verdict screen; nothing else breaks; user can still
  see the live scorecard.
- **Corrupt/partial JSON file in `data/pitches/`:** list route skips it with a warning; detail
  route 404s.
- **Bad `$id`:** routes reject ids not matching the timestamp pattern (no path traversal).

## Testing

- **Server routes:** unit tests (vitest) for the storage round-trip — POST a record, GET the
  list, GET by id, GET a missing id (404), reject a traversal-y id. Use a temp `data/` dir.
- **Trend/list shaping:** a small pure function that maps records → list/trend points, unit
  tested (ordering, empty case).
- **Agent:** the transcript publish is covered by manual smoke test (consistent with the
  existing voice smoke-test approach); no new automated agent test required.
- **Manual smoke:** run a real session, say "score me," confirm a file pair appears in
  `data/pitches/`, then open `/history` and the detail page and replay the audio.

## File-level change summary

- `agent/main.py` — publish `transcript` topic in `_publish_card()`.
- `web/src/routes/api.pitches.ts` (+ `api.pitches.$id.ts`, `api.pitches.$id.audio.ts` or
  equivalent route files) — the four endpoints.
- `web/src/lib/pitches.ts` (new) — storage read/write helpers + record→list/trend shaping
  (the unit-testable core).
- `web/src/components/JudgeApp.tsx` — MediaRecorder capture + save-on-verdict + SAVED marker +
  HISTORY link.
- `web/src/routes/history.tsx`, `web/src/routes/history.$id.tsx` (new) — history pages.
- `.gitignore` — add `data/`.
- `docs/pitch-deck.html` — new slide + renumbering.
</content>
</invoke>
