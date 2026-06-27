# JudgeMode — Realtime Voice Hackathon Judge

**Date:** 2026-06-27
**Context:** LiveKit + Telli hackathon. 3-hour build. Judging criteria: Idea 50% / Execution 50%.

## One-liner

A realtime voice AI judge that listens to your hackathon pitch, **barges in** when the
pitch is weak, asks judge-style questions, and prints a **scorecard** based on the actual
judging criteria — so teams fix their pitch before the real judges hear it.

> "JudgeMode turns your voice agent into a realtime hackathon judge that interrupts weak
> demos before the real judges do."

## Goals (MVP)

A 60–90s scripted demo where:
1. User starts a bad pitch (leads with implementation/API, not the problem).
2. The judge **interrupts mid-sentence** with a sharp note.
3. User corrects course; judge acknowledges and pushes for "why voice?".
4. On finish, a **scorecard** renders with per-criterion scores + one best-next-fix.

The memorable moment is the live barge-in. Everything serves that.

## Non-goals (explicitly cut for 3h)

- No database, auth, or persistence. Scorecard lives in UI memory only.
- No multi-room / multi-user. Single session.
- No realtime-model **function tools** (known LiveKit bug #2383/#3344 — tool runs then agent errors).
- Telephony / Telli SIP is a **stretch only** (see below), not MVP.

## Architecture

```
┌─────────────┐   WebRTC    ┌──────────────┐   joins    ┌────────────────────────┐
│  Browser UI │ ──────────► │ LiveKit Room │ ◄───────── │  Python Agent          │
│ (Next.js +  │             │ (LiveKit     │            │  JudgeMode persona     │
│  React)     │ ◄── data ── │  Cloud)      │            │  openai.realtime       │
│  Scorecard  │  channel    └──────────────┘            │  (gpt-realtime)        │
└─────────────┘                                          └────────────────────────┘
```

Three units, each independently understandable/testable:

### 1. Python agent worker (`agent/`)
- LiveKit Agents (Python 1.5.x). `AgentSession(llm=openai.realtime.RealtimeModel(voice="marin"))`.
- Carries the **JUDGE system prompt**: stay mostly silent; barge in immediately on a trigger;
  be sharp but constructive (one-line interjections, not monologues).
- **Interruption triggers** (in the prompt, not custom VAD):
  talking >~25s with no problem stated · no "why voice" · no demo/benchmark mentioned ·
  jargon-dumping · no user value.
- Captures the running **transcript** (user + agent turns) from session conversation events.
- On end-of-pitch signal (user says "done"/"that's it", or a UI "Finish" button via data
  message), runs `score_pitch(transcript)` and publishes the scorecard JSON on the data channel.
- Depends on: `LIVEKIT_URL/API_KEY/API_SECRET`, `OPENAI_API_KEY`.

### 2. Scoring module (`agent/scoring.py`) — pure function, no voice
- `score_pitch(transcript: str) -> Scorecard` calls `gpt-4o-mini` with a strict JSON schema.
- Output fields (the eval/benchmark artifact):
  `idea /10`, `execution /10`, `demo_clarity /10`, `technical_depth /10`, `why_voice /10`,
  `benchmark_present: bool`, `best_next_fix: str`.
- Separate from the realtime path → avoids the function-tool bug AND is unit-testable with a
  plain transcript string (no mic, no room). This is our correctness anchor.
- Depends on: `OPENAI_API_KEY` only.

### 3. Frontend (`web/`) — Next.js + React
- `@livekit/components-react` + `livekit-client` for room connect, mic publish, audio playback.
- A Next.js route handler `GET /api/token` mints a LiveKit join token (server-side, using the
  API key/secret) — no separate token server process.
- **Scorecard panel** subscribes to the data channel; renders live transcript, a running
  "judge interjections" count (derived from agent transcript turns), and the final card.
- A "Finish pitch" button sends a data message the agent listens for.

## Data flow

1. Browser hits `/api/token` → gets token → connects to room, publishes mic.
2. Agent worker auto-joins the room, greets briefly, then listens.
3. User pitches. Realtime model transcribes; transcript events stream to UI.
4. On a trigger, model **barges in** (native interruption) with a one-line judge note.
5. User says "done" or clicks Finish → agent calls `score_pitch(transcript)` →
   publishes scorecard JSON on data channel → UI renders the card.

## Error handling

- Missing env vars → agent logs a clear fatal at startup; frontend `/api/token` returns 500 with message.
- `score_pitch` LLM/JSON failure → retry once, then publish a fallback card with
  `best_next_fix = "scoring unavailable — check OPENAI_API_KEY"` so the demo never hard-crashes.
- LiveKit connection drop → frontend shows a reconnect banner (component default).

## Testing

- **scoring.py**: unit test with 2 fixture transcripts (a bad pitch, a good pitch); assert
  JSON shape + that bad < good on `idea`/`why_voice`. Runnable without any voice infra.
- **agent**: manual smoke — `python agent/main.py dev`, talk, confirm barge-in + final card.
- **frontend**: manual — connect, see transcript, click Finish, see card.
- Primary verification is the scripted 90s demo rehearsal in H3.

## Build order (3 hours)

- **H1 (riskiest plumbing first):** LiveKit Agents worker + `gpt-realtime` answering in a room;
  Next.js frontend connects via `/api/token`, mic works, you can converse.
- **H2:** Judge system prompt + interruption triggers; `scoring.py` + its unit test green;
  wire end-of-pitch → scorecard on data channel.
- **H3:** Scorecard panel UI + transcript view + interjection count; rehearse the 90s script.

## Stretch (only if H1–H3 land early)

- **Telli integration:** judge "calls your phone" via Telli for a real-judge-calls-you moment →
  bonus-prize bait. Adds SIP plumbing; do not start unless MVP is demo-ready.

## Demo script (target 90s)

- User: "Our project is a platform using LiveKit and AI with realtime transcription and LLM scoring and—"
- Judge (barge-in): "Pause. That's implementation, not a pitch. What user problem are you solving?"
- User: "Hackathon teams get 2 minutes to convince judges but don't know what judges listen for."
- Judge: "Better. Now — why does this need realtime voice instead of chat?"
- User: "Because the coach interrupts during practice, like a real mentor."
- User: "Done."
- Judge: "Here's your scorecard." → card renders.

## Open naming

Working name **JudgeMode** (hackathon-flavored). PitchPilot is the directory/fallback name.
