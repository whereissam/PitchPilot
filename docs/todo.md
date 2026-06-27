# PitchPilot — TODO

Live status of the build. Priority order: **barge-in > scoring > UI > Telli.**
Plan: [`superpowers/plans/2026-06-27-judgemode.md`](superpowers/plans/2026-06-27-judgemode.md)

## Build tasks

- [x] **Task 1 — Agent worker (V0 core)** — LiveKit Agents worker, judge persona, spoken scorecard.
      `agent/main.py`, `agent/prompts.py`. ✅ reviewed.
- [x] **Task 2 — Frontend (V0 complete)** — TanStack Start app, `/api/token` server route, mic connect.
      `web/src/routes/api.token.ts`, `web/src/components/JudgeApp.tsx`, `web/src/routes/index.tsx`. ✅ reviewed.
- [x] **Task 3 — `score_pitch()` + benchmark test (V2)** — `agent/scoring.py`, `agent/test_scoring.py`. ✅ reviewed.
- [x] **Task 4 — Agent publishes scorecard JSON on data channel (V1)** — capture transcript, on
      "score me" run `score_pitch()` and `publish_data(topic="scorecard")`. Modifies `agent/main.py`.
- [x] **Task 5 — Frontend scorecard panel (V1 complete)** — `Scorecard` component + `useDataChannel`
      in `web/src/components/JudgeApp.tsx`.

## Human-only steps (cannot be automated)

- [x] Put real keys in `agent/.env` (LIVEKIT_* + OPENAI_API_KEY) and `web/.env` (LIVEKIT_* only).
- [ ] **V0 voice smoke test:** run `agent: python main.py dev` + `web: bun run dev`, open the app,
      pitch badly, confirm the judge **barges in**, say "score me", confirm it speaks a scorecard.
- [ ] If the judge is too polite to interrupt, apply the eager turn-detection tuning
      (plan Task 2, Step 7) and re-test.
- [x] **Run the benchmark for real:** `cd agent && OPENAI_API_KEY=… python -m pytest test_scoring.py -v`
      (skips without the key). Confirm the good pitch outscores the bad one.
- [ ] Rehearse the 90-second demo script (in the design spec).

## Open quality notes (from task reviews → triage at final review)

- `agent/scoring.py`: `OpenAI()` re-instantiated per call (could be module singleton).
- `agent/scoring.py`: `except Exception: continue` swallows failure detail — add a `logging.warning`.
- `agent/scoring.py`: `bool(data.get("benchmark_present"))` would treat the string `"false"` as True
  (low risk under JSON mode).

## Stretch (only if V0 lands with time to spare)

- [ ] Telli "judge calls your phone" via SIP — bonus-prize bait. Do NOT start until V0 is demo-ready.

## Done = demo-ready

- After Task 2 + the voice smoke test: V0 voice-only demo works (the safe floor).
- After Task 3 + real benchmark run: the eval story is provable offline.
- After Task 5: live on-screen scorecard.
