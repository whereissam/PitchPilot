# PitchPilot

**A realtime voice judge that interrupts weak hackathon pitches before the real judges do.**

PitchPilot listens to your pitch over voice, **barges in** the moment it hears a weakness
(no clear problem, weak "why voice", no demo, no benchmark, jargon-dumping), and on the cue
**"score me"** delivers a scorecard based on the hackathon rubric.

Built for the **LiveKit + Telli** hackathon. Rubric: Idea 50% / Execution 50%.

---

## Architecture

```
┌─────────────┐   WebRTC    ┌──────────────┐   joins    ┌────────────────────────┐
│  Browser    │ ──────────► │ LiveKit Room │ ◄───────── │  Python Agent          │
│ (TanStack   │             │ (LiveKit     │            │  PitchPilot persona    │
│  Start)     │ ◄── data ── │  Cloud)      │            │  openai.realtime       │
│  Scorecard  │  (V1)       └──────────────┘            │  (gpt-realtime)        │
└─────────────┘                                          └────────────────────────┘
```

- **`agent/`** — Python [LiveKit Agents](https://docs.livekit.io/agents/) worker running the
  OpenAI realtime model with a "tough judge" persona. Speaks the scorecard aloud (V0) and
  publishes it as JSON over the data channel (V1).
- **`web/`** — TanStack Start (React + TS, run with Bun) frontend. Mints a LiveKit token from a
  server route and connects the browser mic to the room. Renders the live scorecard (V1).
- **`agent/scoring.py`** — a pure `score_pitch(transcript)` function (gpt-4o-mini → strict JSON).
  The offline benchmark: a bad pitch scores below a good one (`agent/test_scoring.py`).

The worker has **no `agent_name`**, so LiveKit Cloud auto-dispatches it into every new room.
Both sides share the room named `judgemode`.

---

## Prerequisites

- **LiveKit Cloud** project → `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- **OpenAI** API key → `OPENAI_API_KEY`
- **Python 3.12+** and **Bun 1.3+**

---

## Run it (two processes)

### 1. Agent worker

```bash
cd agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in LIVEKIT_* and OPENAI_API_KEY
python main.py dev
```

### 2. Frontend

```bash
cd web
bun install
# create web/.env with the SAME LiveKit values (no OPENAI key needed here):
#   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
#   LIVEKIT_API_KEY=...
#   LIVEKIT_API_SECRET=...
bun run dev
```

Open the printed URL (defaults to http://localhost:3000), click **Start pitching**, allow the
mic, and pitch. Pause after a weak sentence — the judge cuts in. Say **"score me"** to get scored.

---

## Benchmark (offline, no voice)

```bash
cd agent && source .venv/bin/activate
OPENAI_API_KEY=sk-... python -m pytest test_scoring.py -v
```

Scores two fixture transcripts (a bad pitch and a good one) and asserts the good one wins.
This is PitchPilot's eval artifact — teams can check whether a pitch revision actually improved.

---

## Docs

- Design spec: [`docs/superpowers/specs/2026-06-27-judgemode-design.md`](docs/superpowers/specs/2026-06-27-judgemode-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-06-27-judgemode.md`](docs/superpowers/plans/2026-06-27-judgemode.md)
- Progress / next steps: [`docs/todo.md`](docs/todo.md)
