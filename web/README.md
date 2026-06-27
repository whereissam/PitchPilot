# PitchPilot — Frontend (`web/`)

TanStack Start (React + TypeScript), run with **Bun**. This is the browser side of
[PitchPilot](../README.md): it mints a LiveKit token from a server route and connects the
user's microphone to the `judgemode` room, where the Python judge agent joins automatically.

## Setup

```bash
bun install
```

Create `web/.env` (git-ignored) with your LiveKit Cloud values — the **same** ones the agent uses.
No OpenAI key is needed here; the browser never sees these secrets (they are read server-side and
are not `VITE_`-prefixed):

```
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

## Run

```bash
bun run dev      # dev server (defaults to http://localhost:3000)
bun run build    # production build (also the type-check gate)
```

The Python agent worker (`../agent`, `python main.py dev`) must be running so LiveKit
auto-dispatches the judge into the room.

## Layout

- `src/routes/api.token.ts` — server route `GET /api/token`; mints a LiveKit join token
  (room `judgemode`) using `livekit-server-sdk`. Returns `{ token, url }`, or `500` if env is missing.
- `src/components/JudgeApp.tsx` — the LiveKit UI (mic publish, audio playback, control bar, and
  the live scorecard panel). Browser-only.
- `src/routes/index.tsx` — home route; lazy-loads `JudgeApp` **client-only** so the browser-only
  LiveKit code never enters the SSR bundle.

> Note: this app was scaffolded with the TanStack CLI, which always enables Tailwind. PitchPilot
> currently uses inline styles; Tailwind is present but unused.
