# PitchPilot — Usage

How to run PitchPilot and drive the demo.

## Prerequisites

- **LiveKit Cloud** project → `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- **OpenAI** API key → `OPENAI_API_KEY`
- **Python 3.12+**, **Bun 1.3+**

## One-time setup

### Agent (`agent/`)
```bash
cd agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in LIVEKIT_* and OPENAI_API_KEY
```

### Frontend (`web/`)
```bash
cd web
bun install
cp .env.example .env        # fill in the SAME LIVEKIT_* values (no OpenAI key here)
```

> The frontend needs its **own** `web/.env`. The agent's `agent/.env` is not shared.

## Run (two terminals)

**Terminal 1 — agent worker:**
```bash
cd agent && source .venv/bin/activate
python main.py dev
```
Wait for `registered worker` in the logs (confirms LiveKit creds are valid).

**Terminal 2 — frontend:**
```bash
cd web && bun run dev
```
Open the printed URL (defaults to **http://localhost:3000**).

> Restart `bun run dev` after editing `web/.env` — env vars are read at startup.

## Drive the demo

1. Click **Start pitching** and allow microphone access.
2. The judge greets you. Start your pitch.
3. Pitch **badly on purpose** ("we use LiveKit, OpenAI, data channels…") and pause —
   the judge **barges in** with a blunt one-liner.
4. Correct course (state the user problem, then "why voice").
5. Say **"score me"** — the judge speaks a scorecard, and the on-screen panel renders it.

Full 90-second script: see [`superpowers/specs/2026-06-27-judgemode-design.md`](superpowers/specs/2026-06-27-judgemode-design.md).

## Benchmark (offline, no mic)

Proves a bad pitch scores below a good one:
```bash
cd agent && source .venv/bin/activate
set -a; . ./.env; set +a            # load OPENAI_API_KEY
python -m pytest test_scoring.py -v
```
Expected: `2 passed`. (Without `OPENAI_API_KEY` the tests skip.)

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| **"Token error — check web/.env and restart bun run dev"** | `web/.env` missing or empty, or you edited it without restarting. Create `web/.env` with the three `LIVEKIT_*` values and restart `bun run dev`. Verify: `curl -s -w '%{http_code}' http://localhost:3000/api/token` should be `200`. |
| `/api/token` returns `500 {"error":"Missing LiveKit env vars"}` | Same as above — the server route can't see `LIVEKIT_*` in `process.env`. |
| Agent never joins / no greeting | Agent worker not running, or its `agent/.env` creds are wrong. Look for `registered worker` in Terminal 1. The worker auto-dispatches into room `judgemode`. |
| Judge won't interrupt (too polite) | Apply the eager turn-detection tuning in the plan (Task 2, Step 7) and restart the worker. |
| Spoken score ≠ on-screen score | Expected: the voice card is the realtime model's own judgment; the panel comes from a separate `gpt-4o-mini` call. Don't invite a side-by-side comparison on stage. |
| Scoring fails live | Falls back to a card reading "scoring unavailable — check OPENAI_API_KEY"; check the worker logs for `scorecard publish failed`. |
