# JudgeMode — Realtime Voice Hackathon Judge

**Date:** 2026-06-27
**Context:** LiveKit + Telli hackathon. 3-hour build. Judging criteria: Idea 50% / Execution 50%.

## One-liner

> **JudgeMode is a realtime voice judge that interrupts weak hackathon pitches before the real judges do.**

> It listens for a missing problem, weak "why voice," unclear demo, and absent benchmark,
> then gives a scorecard based on the judging rubric.

## Guiding principle

**The memorable moment is the live barge-in. Everything serves that.**

Priority order, strict: **barge-in > scoring > UI polish > Telli/SMS.**
If the UI/data channel doesn't finish, the demo still completes on voice alone.
If barge-in fails, the project is just a普通 pitch reviewer — so barge-in is non-negotiable.

## Staged build (ship V0 first, never pivot)

### V0 — must work (voice-only JudgeMode)
User joins room → AI judge listens → AI **barges in** on a weak pitch → user says
"Done. Score me." → AI **speaks the scorecard aloud**. No UI, no data channel, no
transcript reconstruction required. This alone is a complete demo.

### V1 — nice UI
Frontend renders a live panel:
```txt
JudgeMode is listening...
Final score:
Idea: 7/10
Execution: 6/10
Why voice: 8/10
Best next fix: Open with the user pain.
```
Agent publishes scorecard JSON on the data channel; UI renders it. If publish isn't
ready in time, a hand-mocked card on the frontend is an acceptable fallback — the live
interruption is the real wow, not the card.

### V2 — eval artifact (benchmark story)
Two fixture transcripts checked into the repo: a **bad pitch → low score**, a
**good pitch → high score**, scored by `score_pitch()`. Even if the UI is unfinished,
this lets us say on stage: *"We also ship a scoring benchmark so teams can test whether
their pitch actually improved."*

## Non-goals (explicitly cut for 3h)

- No database, auth, or persistence.
- No multi-room / multi-user. Single session.
- No realtime-model **function tools** (known LiveKit bug #2383/#3344 — tool runs then agent errors).
- **No "Finish pitch" button.** End-of-pitch is the spoken phrase "Done. Score me." (faster, more natural on stage).
- **No interjection-count UI metric** (would require deriving counts from agent transcript turns — a time sink).
- **No transcript streaming as a V0 requirement.** The realtime model keeps its own
  conversation context and scores from what it heard. Pulling the transcript out for a
  separate scorer is a V1/V2 refinement, not a V0 blocker.
- Telephony / Telli SIP is a **stretch only**, only if all of V0 runs in ~90 min.

## Architecture

```
┌─────────────┐   WebRTC    ┌──────────────┐   joins    ┌────────────────────────┐
│  Browser UI │ ──────────► │ LiveKit Room │ ◄───────── │  Python Agent          │
│ (Next.js +  │             │ (LiveKit     │            │  JudgeMode persona     │
│  React)     │ ◄── data ── │  Cloud)      │            │  openai.realtime       │
│  Scorecard  │  (V1 only)  └──────────────┘            │  (gpt-realtime)        │
└─────────────┘                                          └────────────────────────┘
```

Three units, each independently understandable/testable:

### 1. Python agent worker (`agent/`) — V0 core
- LiveKit Agents (Python 1.5.x). `AgentSession(llm=openai.realtime.RealtimeModel(voice="marin"))`.
- Carries the **JUDGE system prompt**: stay mostly silent; barge in immediately on a trigger;
  be sharp but constructive (one-line interjections, not monologues).
- **Interruption triggers** (in the prompt, not custom VAD):
  talking >~25s with no problem stated · no "why voice" · no demo/benchmark mentioned ·
  jargon-dumping · no user value.
- On hearing **"done" / "score me"**, the model **speaks the scorecard aloud** using the
  rubric below (V0). In V1 it additionally publishes the JSON on the data channel.
- Depends on: `LIVEKIT_URL/API_KEY/API_SECRET`, `OPENAI_API_KEY`.

### 2. Scoring module (`agent/scoring.py`) — pure function, V1/V2 (not a V0 blocker)
- `score_pitch(transcript: str) -> dict` calls `gpt-4o-mini` with a strict JSON schema.
- Output fields (the eval/benchmark artifact):
  `idea /10`, `execution /10`, `demo_clarity /10`, `technical_depth /10`, `why_voice /10`,
  `benchmark_present: bool`, `best_next_fix: str`.
- Separate from the realtime path → avoids the function-tool bug AND is unit-testable with a
  plain transcript string (no mic, no room). This is the V2 benchmark anchor.
- Depends on: `OPENAI_API_KEY` only.

### 3. Frontend (`web/`) — Next.js + React, V1
- `@livekit/components-react` + `livekit-client` for room connect, mic publish, audio playback.
- A Next.js route handler `GET /api/token` mints a LiveKit join token server-side (API key/secret).
- **Scorecard panel** subscribes to the data channel and renders the final card. Mock fallback OK.

## Data flow (V0 path in bold)

1. **Browser hits `/api/token` → connects to room, publishes mic.**
2. **Agent worker auto-joins, greets briefly, then listens.**
3. **User pitches; realtime model transcribes internally.**
4. **On a trigger, model barges in with a one-line judge note.**
5. **User says "Done. Score me." → model speaks the scorecard aloud.**
6. (V1) Model also publishes scorecard JSON on the data channel → UI renders the card.

## Error handling

- Missing env vars → agent logs a clear fatal at startup; `/api/token` returns 500 with a message.
- `score_pitch` LLM/JSON failure → retry once, then fall back to
  `best_next_fix = "scoring unavailable — check OPENAI_API_KEY"`. V0 demo never depends on this.
- LiveKit connection drop → frontend shows the component-default reconnect banner.

## Testing

- **scoring.py** (V2): unit test with 2 fixture transcripts (bad pitch, good pitch); assert
  JSON shape + that bad < good on `idea`/`why_voice`. Runs without any voice infra.
- **agent** (V0): manual smoke — `python agent/main.py dev`, talk, confirm barge-in + spoken card.
- **frontend** (V1): manual — connect, see the card render.
- Primary verification is the scripted 90s demo rehearsal.

## Build order (3 hours, V0 first)

- **H1 — V0 plumbing + soul (riskiest first):** LiveKit Agents worker + `gpt-realtime` answering
  in a room; Next.js frontend connects via `/api/token`, mic works, you can converse;
  judge system prompt + interruption triggers so **barge-in works**; "done" → **spoken scorecard**.
  At the end of H1, the demo is already complete on voice.
- **H2 — V1:** `scoring.py` + publish scorecard JSON on data channel; Scorecard panel UI renders it.
- **H3 — V2 + polish:** two fixture transcripts + `scoring.py` unit test (the benchmark);
  light UI polish; rehearse the 90s script.

## Stretch (only if V0 lands in ~90 min)

- **Telli integration:** judge "calls your phone" via Telli for a real-judge-calls-you moment →
  bonus-prize bait. Adds SIP plumbing; do not start unless V0 is demo-ready.

## Demo script (target 90s)

- Open: "Most hackathon teams don't lose because their idea is bad. They lose because their demo sounds bad."
- User (deliberately bad): "Our project uses LiveKit, realtime transcription, OpenAI, scoring, data channels—"
- Judge (barge-in): "Pause. That's implementation, not a pitch. What problem are you solving?"
- User: "Teams only get two minutes to convince judges, but they don't know what judges are listening for."
- Judge: "Better. Now explain why this must be realtime voice."
- User: "Because a good mentor interrupts you while you practice, not after you fail on stage."
- User: "Done. Score me."
- Judge / UI:
```txt
Idea: 8/10
Execution: 7/10
Demo clarity: 8/10
Why voice: 9/10
Benchmark: present

Best next fix:
Show the interruption within the first 20 seconds.
```

## Name & tone

- Name: **JudgeMode** (directory stays PitchPilot).
- Tone: **sharp but constructive** — one-line interjections, never a monologue.
