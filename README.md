<p align="center">
  <img src="web/public/brand.png" alt="PitchPilot" width="260" />
</p>

<h3 align="center">The judge that interrupts your pitch — before the real judges do.</h3>

<p align="center">
  Realtime voice. It barges in the second your pitch goes weak.<br />
  Say <b>“score me”</b> and it hands back a scorecard against the rubric.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/LiveKit-Agents-1F2BE0?style=flat-square" alt="LiveKit Agents" />
  <img src="https://img.shields.io/badge/OpenAI-gpt--realtime-FF5A1F?style=flat-square" alt="OpenAI realtime" />
  <img src="https://img.shields.io/badge/TanStack_Start-Bun-1F2BE0?style=flat-square" alt="TanStack Start + Bun" />
  <img src="https://img.shields.io/badge/Python-3.12+-FF5A1F?style=flat-square" alt="Python 3.12+" />
</p>

<p align="center">
  <a href="docs/pitch-deck.html"><b>📊 Pitch deck</b></a> &nbsp;·&nbsp;
  <a href="#try-it"><b>▶︎ Run it</b></a>
</p>

---

## Bad demos don't fail at the end. They fail in the first 20 seconds.

Most teams don't lose because the idea is impossible. They lose because the pitch sounds bad
early — and nobody tells them until the Q&A goes quiet.

PitchPilot is the practice judge that *does* tell you, out loud, mid-sentence:

> **You:** “We use LiveKit, OpenAI, TanStack, realtime transcription—”
> **PitchPilot:** ⏸ *“Pause. That's implementation, not a pitch.”*
> **You:** “Teams lose because their demo sounds bad.”
> **PitchPilot:** ⏸ *“Better. Now — why voice?”*

It listens for the five ways pitches die — **no clear problem · weak “why voice” ·
no demo moment · no benchmark · jargon dumping** — and cuts in on the first one costing you points.

## Say “score me”

When you're done, you get a verdict against the rubric — spoken aloud **and** on screen,
always the same numbers:

```
SCORECARD · judgemode
─────────────────────────────────
Idea          50%   ███████░░░  7/10
Execution     50%   ███████░░░  7/10
─────────────────────────────────
why voice              6   ·  demo clarity   7
technical depth        8   ·  benchmark   present
─────────────────────────────────
best next fix   Open with the user and their pain
                before you say “platform.”
Verdict         Clear demo, weak benchmark.        TOTAL 65/100
```

The voice never invents a score. It reads back exactly the card the scoring function produced —
one source of truth, so the audio and the UI can never disagree.

## We can prove it judges well

PitchPilot ships an offline benchmark — no microphone needed. It scores two fixture pitches and
asserts the revised one wins, every run:

| Fixture | Total |
| --- | --- |
| Implementation dump | **20 / 100** |
| Clear, voice-native pitch | **65 / 100** |

The eval isn't about AI quality — it measures whether a pitch got *clearer* against the rubric.
So a team can check whether a revision actually improved before they ever walk on stage.

## How it works

```
┌─────────────┐   WebRTC    ┌──────────────┐   joins    ┌────────────────────────┐
│  Browser    │ ──────────► │ LiveKit Room │ ◄───────── │  Python Agent          │
│ (TanStack   │             │ (LiveKit     │            │  PitchPilot persona    │
│  Start)     │ ◄── data ── │  Cloud)      │            │  openai.realtime       │
│  Scorecard  │             └──────────────┘            │  (gpt-realtime)        │
└─────────────┘                                          └────────────────────────┘
```

One LiveKit room: your browser, the realtime judge agent, and the scorecard travelling back over
the data channel. The judge can interrupt while you're **still speaking** — that's the whole point.

> **The model decides. The code owns the consequences.** The realtime model hosts and interrupts;
> a typed `score_pitch()` (Pydantic + OpenAI structured outputs, `gpt-4o`) is the only thing that
> produces a number, and `total` is computed in code, never by the model.

<a id="try-it"></a>

## Try it

<details>
<summary><b>Run it locally</b> — two processes, ~2 minutes</summary>

<br />

You'll need a [LiveKit Cloud](https://livekit.io/) project (`LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`), an `OPENAI_API_KEY`, **Python 3.12+** and **Bun 1.3+**.

**1. The judge (agent worker)**

```bash
cd agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in LIVEKIT_* and OPENAI_API_KEY
python main.py dev          # wait for "registered worker"
```

**2. The stage (frontend)**

```bash
cd web
bun install
# create web/.env with the SAME LiveKit values (no OpenAI key needed here):
#   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
#   LIVEKIT_API_KEY=...
#   LIVEKIT_API_SECRET=...
bun run dev
```

Open the printed URL (usually http://localhost:3000), click **Start pitching**, and allow the mic.
The agent must be running too, or no judge joins the room.

**Run the benchmark** (no mic):

```bash
cd agent && source .venv/bin/activate
OPENAI_API_KEY=sk-... python -m pytest test_scoring.py -v
```

</details>

## More

- 📊 [Pitch deck](docs/pitch-deck.html)
- 📝 [Design notes](docs/superpowers/specs/2026-06-27-judgemode-design.md) · [Build plan](docs/superpowers/plans/2026-06-27-judgemode.md)
- 🔧 [How to run & what breaks](docs/usage.md) · [Done / left to do](docs/todo.md)

<p align="center"><sub>Practice the pitch. Get interrupted. Fix it before it counts.</sub></p>
