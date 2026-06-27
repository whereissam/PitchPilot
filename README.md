# PitchPilot

A realtime voice judge that interrupts weak hackathon pitches before the real judges do.

You pitch out loud. PitchPilot listens, and the moment it hears a weak spot (no clear problem, a thin "why voice", no demo, no benchmark, too much jargon) it cuts in. Say "score me" and it hands back a scorecard against the hackathon rubric.

Built for the LiveKit + Telli hackathon. The rubric is Idea 50%, Execution 50%.

## Architecture

```
┌─────────────┐   WebRTC    ┌──────────────┐   joins    ┌────────────────────────┐
│  Browser    │ ──────────► │ LiveKit Room │ ◄───────── │  Python Agent          │
│ (TanStack   │             │ (LiveKit     │            │  PitchPilot persona    │
│  Start)     │ ◄── data ── │  Cloud)      │            │  openai.realtime       │
│  Scorecard  │             └──────────────┘            │  (gpt-realtime)        │
└─────────────┘                                          └────────────────────────┘
```

The agent in `agent/` is a Python [LiveKit Agents](https://docs.livekit.io/agents/) worker. It runs the OpenAI realtime model with a tough-judge persona. The realtime model only hosts and interrupts — it never invents scores. On the scoring cue it computes the card with `score_pitch()`, publishes it as JSON over the data channel, then reads back that exact card out loud, so the voice and the on-screen scorecard can never disagree (one source of truth).

The frontend in `web/` is a TanStack Start app (React and TypeScript, run with Bun). It mints a LiveKit token from a server route, connects your mic to the room, and draws the scorecard.

`agent/scoring.py` holds one plain function, `score_pitch(transcript)`, returning a typed `Scorecard` (Pydantic + OpenAI structured outputs, `gpt-4o`). `total` is the official rubric score — Idea 50% plus Execution 50% — computed in code, never by the model. Only the founder's turns are scored, so the judge's own interruptions can't be counted as pitch content. It also doubles as the benchmark: a bad pitch has to score below a good one, and `agent/test_scoring.py` checks that.

The worker sets no `agent_name`, so LiveKit Cloud sends it into every new room. Both sides meet in a room called `judgemode`.

## What you need

A LiveKit Cloud project, which gives you `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. An OpenAI API key for `OPENAI_API_KEY`. Python 3.12 or newer, and Bun 1.3 or newer.

## Running it

PitchPilot runs as two processes.

Start the agent worker:

```bash
cd agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in LIVEKIT_* and OPENAI_API_KEY
python main.py dev
```

Wait for `registered worker` in the logs. That line means the LiveKit credentials work.

Then start the frontend:

```bash
cd web
bun install
# create web/.env with the SAME LiveKit values (no OpenAI key needed here):
#   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
#   LIVEKIT_API_KEY=...
#   LIVEKIT_API_SECRET=...
bun run dev
```

Open the printed URL, usually http://localhost:3000. Click Start pitching and allow the mic. The agent has to be running too, or no judge joins the room.

## Benchmark

This runs without a microphone and proves a bad pitch scores below a good one:

```bash
cd agent && source .venv/bin/activate
OPENAI_API_KEY=sk-... python -m pytest test_scoring.py -v
```

You should see two passing tests. Without the key they skip.

## Docs

- Design notes: [`docs/superpowers/specs/2026-06-27-judgemode-design.md`](docs/superpowers/specs/2026-06-27-judgemode-design.md)
- Build plan: [`docs/superpowers/plans/2026-06-27-judgemode.md`](docs/superpowers/plans/2026-06-27-judgemode.md)
- How to run and what breaks: [`docs/usage.md`](docs/usage.md)
- What is done and what is left: [`docs/todo.md`](docs/todo.md)
