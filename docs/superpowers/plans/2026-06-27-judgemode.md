# JudgeMode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A realtime voice AI judge (LiveKit + OpenAI realtime) that interrupts a weak hackathon pitch and delivers a scorecard.

**Architecture:** A Python LiveKit Agents worker runs `openai.realtime.RealtimeModel` with a "tough judge" persona that barges in on weak pitches and speaks a scorecard on the cue "score me" (V0). A Next.js/React frontend mints a token and connects the browser mic to the same room (V0). A pure `score_pitch()` function scores a transcript to JSON for an offline benchmark (V2) and, optionally, for a live UI scorecard pushed over the data channel (V1).

**Tech Stack:** Python 3.12+, `livekit-agents[openai]` (1.x), `openai`, `python-dotenv`, `pytest`; Next.js (App Router) + React + `@livekit/components-react` + `livekit-server-sdk`.

## Global Constraints

- LiveKit Agents Python: `livekit-agents[openai]>=1.0,<2`.
- Realtime model: `openai.realtime.RealtimeModel(voice="marin")`, default model id `gpt-realtime`.
- No realtime-model function tools (LiveKit bug #2383/#3344). Scoring is a separate text-LLM call.
- Scoring model: `gpt-4o-mini`, `temperature=0`, `response_format={"type":"json_object"}`.
- Scorecard keys, EXACTLY: `idea`, `execution`, `demo_clarity`, `technical_depth`, `why_voice` (ints 0–10), `benchmark_present` (bool), `best_next_fix` (str).
- End-of-pitch cue is the spoken phrase containing "score me" (no UI button).
- Worker has NO `agent_name` set → LiveKit Cloud auto-dispatches it to every new room.
- Room name is `judgemode` (frontend and worker share it via auto-dispatch).
- Env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `OPENAI_API_KEY`.
- Priority order: **barge-in > scoring > UI > Telli.** Ship V0 (Tasks 1–2) before anything else.

---

### Task 1: Agent worker — judge persona + spoken scorecard (V0 core)

**Files:**
- Create: `agent/requirements.txt`
- Create: `agent/.env.example`
- Create: `agent/prompts.py`
- Create: `agent/main.py`

**Interfaces:**
- Produces: `JUDGE_INSTRUCTIONS: str` (in `prompts.py`); a runnable worker via `python agent/main.py dev`.

- [ ] **Step 1: Create `agent/requirements.txt`**

```
livekit-agents[openai]>=1.0,<2
python-dotenv>=1.0
openai>=1.40
pytest>=8.0
```

- [ ] **Step 2: Create `agent/.env.example`**

```
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
OPENAI_API_KEY=
```

- [ ] **Step 3: Create `agent/prompts.py`** with the judge persona

```python
JUDGE_INSTRUCTIONS = """\
You are JudgeMode, a sharp but fair hackathon judge evaluating a live pitch.
You are NOT a friendly assistant. You judge.

HOW YOU LISTEN
- Let the speaker talk. Stay silent while they are making sense.
- The MOMENT a weakness appears, cut in with ONE short, blunt sentence, then stop
  and let them continue. Never monologue. One sentence, then silence.

INTERRUPT IMMEDIATELY when any of these is true:
- They have talked for a while with no clear USER PROBLEM stated.
- They describe implementation/tech (APIs, frameworks, "we use X and Y") before the problem.
- They never explain WHY this needs realtime VOICE instead of chat.
- No demo or benchmark/eval is mentioned.
- They dump jargon without user value.

EXAMPLE INTERRUPTIONS (style, not scripts):
- "Pause. That's implementation, not a pitch. What problem are you solving?"
- "Stop — why does this need realtime voice instead of chat?"
- "I still don't hear a user. Who hurts without this?"

SCORING CUE
- When the speaker says "score me", "done", or "that's it", STOP listening and deliver
  the scorecard out loud in under 20 seconds, in this exact spoken format:
  "Idea X out of 10. Execution X. Demo clarity X. Technical depth X. Why voice X.
   Benchmark: present or missing. Best next fix: <one sentence>."

RUBRIC (hackathon criteria)
- Idea (50%): technical depth and coolness.
- Execution (50%): how impressive the demo sounds, and whether a useful eval/benchmark exists.
Be tough. A vague pitch scores low. Reward a clear problem, a strong "why voice",
a concrete demo, and a benchmark.
"""
```

- [ ] **Step 4: Create `agent/main.py`**

```python
import logging

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai

from prompts import JUDGE_INSTRUCTIONS

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("judgemode")


class JudgeAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=JUDGE_INSTRUCTIONS)


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(voice="marin"),
    )
    await session.start(room=ctx.room, agent=JudgeAgent())
    await session.generate_reply(
        instructions="In ONE short sentence, say you are JudgeMode and tell them to start their pitch."
    )


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
```

- [ ] **Step 5: Install deps**

Run:
```bash
cd agent && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```
Expected: installs without error. `python -c "import livekit.agents, livekit.plugins.openai"` prints nothing (success).

- [ ] **Step 6: Create `agent/.env`** from the example and fill in real LiveKit Cloud + OpenAI values.

(Manual: copy `.env.example` → `.env`, paste keys. Do not commit `.env`.)

- [ ] **Step 7: Smoke-run the worker**

Run (from `agent/`, venv active):
```bash
python main.py dev
```
Expected: logs `registered worker` / `starting worker` and it stays running, waiting for a room. Leave it running for Task 2. (No room yet, so no job — that's correct.)

- [ ] **Step 8: Commit**

```bash
git add agent/requirements.txt agent/.env.example agent/prompts.py agent/main.py
git commit -m "feat(agent): JudgeMode realtime worker with judge persona (V0)"
```

---

### Task 2: Frontend — token route + room connect + mic (V0 complete)

**Files:**
- Create: `web/` (via create-next-app)
- Create: `web/app/api/token/route.ts`
- Create: `web/app/page.tsx`
- Create: `web/.env.local` (manual, not committed)

**Interfaces:**
- Consumes: a running worker from Task 1 (auto-dispatched into room `judgemode`).
- Produces: `GET /api/token` → `{ token: string, url: string }`; a page that connects the browser mic to room `judgemode`.

- [ ] **Step 1: Scaffold Next.js app**

Run (from repo root):
```bash
npx create-next-app@latest web --ts --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-npm
```
If prompted about Turbopack or other options, accept defaults. Expected: `web/` created.

- [ ] **Step 2: Add LiveKit deps**

Run:
```bash
cd web && npm install @livekit/components-react @livekit/components-styles livekit-client livekit-server-sdk
```
Expected: installs without error.

- [ ] **Step 3: Create `web/app/api/token/route.ts`**

```ts
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json({ error: "Missing LiveKit env vars" }, { status: 500 });
  }
  const room = "judgemode";
  const identity = "pitcher-" + Math.random().toString(36).slice(2, 8);
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();
  return NextResponse.json({ token, url: LIVEKIT_URL });
}
```

- [ ] **Step 4: Replace `web/app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import "@livekit/components-styles";

type Conn = { token: string; url: string };

function Stage() {
  const { state } = useVoiceAssistant();
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>JudgeMode</h1>
      <p>Judge is: <b>{state}</b></p>
      <p>Pitch your project. Say <b>“score me”</b> when you’re done.</p>
    </div>
  );
}

export default function Page() {
  const [conn, setConn] = useState<Conn | null>(null);

  if (!conn) {
    return (
      <main style={{ padding: 48, fontFamily: "system-ui" }}>
        <h1>JudgeMode</h1>
        <p>A realtime voice judge that interrupts weak pitches before the real judges do.</p>
        <button
          style={{ fontSize: 18, padding: "12px 20px" }}
          onClick={async () => {
            const res = await fetch("/api/token");
            if (!res.ok) { alert("Token error — check web/.env.local"); return; }
            setConn(await res.json());
          }}
        >
          Start pitching
        </button>
      </main>
    );
  }

  return (
    <LiveKitRoom token={conn.token} serverUrl={conn.url} connect audio data-lk-theme="default">
      <Stage />
      <RoomAudioRenderer />
      <VoiceAssistantControlBar />
    </LiveKitRoom>
  );
}
```

- [ ] **Step 5: Create `web/.env.local`** (manual, not committed) with the SAME LiveKit values as `agent/.env`:

```
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

- [ ] **Step 6: Run the frontend and smoke-test V0 end-to-end**

Run (with the Task 1 worker still running):
```bash
cd web && npm run dev
```
Then open http://localhost:3000, click **Start pitching**, allow mic.
Expected:
- The worker terminal logs a new job / participant joining room `judgemode`.
- You hear the judge greet you.
- Give a deliberately bad pitch ("we use LiveKit, OpenAI, data channels…") and PAUSE — the judge cuts in with a blunt one-liner.
- Say "score me" — the judge speaks a scorecard.

This is the full V0 demo. If the judge feels too polite (won't cut in), do Step 7.

- [ ] **Step 7 (optional tuning): make the judge more eager to interrupt**

Only if the judge waits too long. In `agent/main.py`, replace the `RealtimeModel(...)` line with eager semantic turn detection:

```python
from openai.types.beta.realtime.session import TurnDetection

session = AgentSession(
    llm=openai.realtime.RealtimeModel(
        voice="marin",
        turn_detection=TurnDetection(type="semantic_vad", eagerness="high"),
    ),
)
```
If that import path errors, fall back to short server-VAD silence:
```python
turn_detection=TurnDetection(type="server_vad", threshold=0.5,
                             prefix_padding_ms=200, silence_duration_ms=200),
```
Restart `python main.py dev` and re-test.

- [ ] **Step 8: Commit**

```bash
git add web/app web/package.json web/package-lock.json
git commit -m "feat(web): browser mic connects to JudgeMode room (V0 complete)"
```

---

### Task 3: `score_pitch()` scoring function + benchmark test (V2)

**Files:**
- Create: `agent/scoring.py`
- Create: `agent/test_scoring.py`

**Interfaces:**
- Produces: `score_pitch(transcript: str, model: str = "gpt-4o-mini") -> dict` returning the exact scorecard keys from Global Constraints.

- [ ] **Step 1: Write the failing test `agent/test_scoring.py`**

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `agent/`, venv active, with `OPENAI_API_KEY` exported):
```bash
python -m pytest test_scoring.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'scoring'` / import error.

- [ ] **Step 3: Implement `agent/scoring.py`**

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
python -m pytest test_scoring.py -v
```
Expected: 2 passed. (This IS the V2 benchmark: a bad pitch scores below a good one.)

- [ ] **Step 5: Commit**

```bash
git add agent/scoring.py agent/test_scoring.py
git commit -m "feat(agent): score_pitch() + bad-vs-good benchmark test (V2)"
```

---

### Task 4: Agent publishes scorecard JSON on the data channel (V1)

**Files:**
- Modify: `agent/main.py`

**Interfaces:**
- Consumes: `score_pitch` from Task 3; a running `AgentSession`.
- Produces: a data-channel message on topic `scorecard` with `score_pitch()` JSON, sent when the user says "score me".

- [ ] **Step 1: Add transcript capture + scoring trigger to `agent/main.py`**

Replace the body of `entrypoint` with this version (keeps Task 1 behavior, adds capture + publish):

```python
import asyncio
import json

from scoring import score_pitch

# ... keep imports from Task 1 ...

async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(voice="marin"),
    )

    transcript: list[str] = []
    scored = {"done": False}

    @session.on("conversation_item_added")
    def _on_item(ev):
        role = getattr(ev.item, "role", "?")
        text = getattr(ev.item, "text_content", None) or ""
        if not text:
            return
        transcript.append(f"{role}: {text}")
        if role == "user" and "score me" in text.lower() and not scored["done"]:
            scored["done"] = True
            asyncio.create_task(_publish_card())

    async def _publish_card():
        full = "\n".join(transcript)
        card = await asyncio.to_thread(score_pitch, full)
        await ctx.room.local_participant.publish_data(
            json.dumps(card).encode("utf-8"), reliable=True, topic="scorecard"
        )
        logger.info("published scorecard: %s", card)

    await session.start(room=ctx.room, agent=JudgeAgent())
    await session.generate_reply(
        instructions="In ONE short sentence, say you are JudgeMode and tell them to start their pitch."
    )
```

- [ ] **Step 2: Verify the event name is correct**

Run `python main.py dev`, connect from the browser, say a sentence. In the worker logs confirm `conversation_item_added` fired (add a temporary `logger.info("item: %s", text)` inside `_on_item` if unsure). If no event fires, the LiveKit version uses a different name — check `python -c "from livekit.agents import AgentSession; print([m for m in dir(AgentSession)])"` and the docs, then swap the event string. Remove the temporary log when confirmed.

- [ ] **Step 3: Smoke-test publish**

With worker + frontend running: pitch, then say "score me".
Expected: worker logs `published scorecard: {...}` with real numbers.

- [ ] **Step 4: Commit**

```bash
git add agent/main.py
git commit -m "feat(agent): publish scorecard JSON on data channel when user says 'score me' (V1)"
```

---

### Task 5: Frontend scorecard panel (V1 complete)

**Files:**
- Modify: `web/app/page.tsx`

**Interfaces:**
- Consumes: data-channel topic `scorecard` JSON from Task 4 (keys per Global Constraints).
- Produces: a rendered scorecard panel in the page.

- [ ] **Step 1: Add a `Scorecard` component and wire `useDataChannel` in `web/app/page.tsx`**

Add imports and component, and render `<Scorecard />` inside `LiveKitRoom`:

```tsx
import { useDataChannel } from "@livekit/components-react";

type Card = {
  idea: number; execution: number; demo_clarity: number;
  technical_depth: number; why_voice: number;
  benchmark_present: boolean; best_next_fix: string;
};

function Scorecard() {
  const [card, setCard] = useState<Card | null>(null);
  useDataChannel("scorecard", (msg) => {
    try { setCard(JSON.parse(new TextDecoder().decode(msg.payload))); } catch {}
  });
  if (!card) return null;
  const row = (label: string, v: number) => (
    <div style={{ display: "flex", justifyContent: "space-between", width: 280 }}>
      <span>{label}</span><b>{v}/10</b>
    </div>
  );
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Scorecard</h2>
      {row("Idea", card.idea)}
      {row("Execution", card.execution)}
      {row("Demo clarity", card.demo_clarity)}
      {row("Technical depth", card.technical_depth)}
      {row("Why voice", card.why_voice)}
      <div style={{ width: 280, display: "flex", justifyContent: "space-between" }}>
        <span>Benchmark</span><b>{card.benchmark_present ? "present" : "missing"}</b>
      </div>
      <p style={{ maxWidth: 360 }}><b>Best next fix:</b> {card.best_next_fix}</p>
    </div>
  );
}
```

Then add `<Scorecard />` next to `<Stage />` inside the `<LiveKitRoom>` return.

- [ ] **Step 2: Smoke-test the full V1 loop**

With worker + frontend running: pitch, get interrupted, say "score me".
Expected: judge speaks the card AND the Scorecard panel renders the same numbers.

- [ ] **Step 3: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat(web): render live scorecard from data channel (V1 complete)"
```

---

## Done = demo-ready

- After **Task 2**: V0 voice-only demo works (this is the safe floor — never lose this).
- After **Task 3**: V2 benchmark (bad < good) is provable offline.
- After **Task 5**: V1 live UI scorecard.

Stretch (Telli "judge calls your phone") is intentionally **not** in this plan — only attempt it if V0 lands with time to spare.
