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

- [x] `agent/scoring.py`: `OpenAI()` re-instantiated per call → now a lazy module singleton
      (`_get_client()`); import no longer needs a key.
- [x] `agent/scoring.py`: silent `except` → now `logging.warning(..., exc_info=True)` so the
      failure detail surfaces before the not-scored fallback.
- [x] `agent/scoring.py`: `bool(data.get("benchmark_present"))` "false"-string risk — already
      resolved: the PR1 rewrite to Pydantic structured outputs removed all hand-rolled JSON
      parsing. (Stale note.)

## Pitch history & progress (built — needs live verification)

Spec: [`superpowers/specs/2026-06-27-pitch-history-design.md`](superpowers/specs/2026-06-27-pitch-history-design.md).
Turns PitchPilot from an ephemeral judge into a **practice loop**: save every finished pitch
(scorecard required; transcript + audio best-effort), `/history` trend + list, `/history/$id`
detail with replay.

Built across all three surfaces:

- [x] **App** — storage core (`web/src/lib/pitches.ts`, 12/12 unit tests), API routes
      (`POST/GET /api/pitches`, `/$id`, `/$id/audio`), save-on-verdict + HISTORY link in
      `JudgeApp`, `/history` + `/history/$id` pages, extracted `Scoreboard` component.
- [x] **Agent** — `agent/main.py` publishes the `transcript` topic (best-effort).
- [x] **Pitch deck** — new slide 07 "the loop doesn't end at the buzzer"; renumbered to `/08`.
- [x] **Landing site** — `PracticeLoop.astro` score-trend section (`#progress`) + Progress nav link.
- [x] API + storage verified end-to-end against a dev server (POST with/without audio, list
      ordering, detail, audio streaming, 404s, traversal guard, no-card 400). Typecheck +
      both builds (web, landing) clean.

Left to do:

- [ ] **Live voice smoke test (human-only):** run `agent: python main.py dev` + web, pitch,
      say "score me". Confirm a `.json` (and `.webm`) lands in `web/data/pitches/`, then open
      `/history`, see the score trend, open the detail page, and replay the audio.
- [ ] If audio capture misbehaves in the live run, remember it's best-effort — text history
      (scorecard + transcript) must still save. Ship text-only if audio fights back.

## Richer written feedback (built — needs live verification)

Spec: [`superpowers/specs/2026-06-27-richer-feedback-design.md`](superpowers/specs/2026-06-27-richer-feedback-design.md).
One extra LLM call after `score_pitch()` produces a typed `Feedback` (action_title, what_landed?,
critique, lowest_metric{name,score,reason}, weakest_line{quote,why_weak,rewrite}) — feedback
*explains* the scorecard, it is not a second judge. Lowest metric chosen in code; reason by the
model. Best-effort alongside transcript/audio.

- [x] **Agent** — `agent/feedback.py` (`lowest_metric` + `write_feedback`, 4 unit tests),
      `SCORER_MODEL` shared constant, `main.py` publishes the `feedback` topic concurrently with
      the spoken verdict (so it lands within the save window).
- [x] **Web** — `FeedbackPanel.tsx` (short layout, quote-null fallback), `JudgeApp` collects the
      topic + `WRITING CRITIQUE…` pending + 5s grace-window save, persists `feedback` + lifted
      top-level `actionTitle`, history detail renders the panel, history list previews `actionTitle`.
- [x] Deck reconciled to `gpt-4o` (was a stale `gpt-4o-mini`).
- [x] Verified end-to-end against a dev server (POST with/without feedback, actionTitle lift,
      detail round-trip, page renders). 14/14 web unit tests; typecheck + build clean.

Left to do:

- [ ] **Live voice smoke test (human-only):** pitch, say "score me". Confirm the `FeedbackPanel`
      appears a beat after the scoreboard, the footer shows `SAVED ✓` (or `SAVED · NO CRITIQUE`
      on timeout), then open `/history/:id` and confirm the same feedback is saved.
- [ ] If `write_feedback` is too slow to land inside the 5s window, either widen
      `FEEDBACK_GRACE_MS` or drop `SCORER_MODEL`/the feedback call to `gpt-4o-mini`. Feedback is
      best-effort — a `feedback: null` save is still valid.

## Demo stability harness (built — needs the 5-run rehearsal)

Rehearsal doc: [`demo-rehearsal.md`](demo-rehearsal.md). One question only: does the demo
path survive? Split into an automated preflight (plumbing) + a manual 5-run voice rehearsal
(behavior). No Langfuse/Phoenix yet — make these two gates green first.

- [x] **Preflight** — `scripts/stability_check.py`: one command, exits 0/1. Loads `agent/.env` +
      `web/.env` (no dep), runs scoring/feedback fixtures on `agent/.venv`. Checks LiveKit env,
      OpenAI key (warn), web server, `/api/token`, `score_pitch`, `write_feedback`, data dir
      writable. ✅ 7/7 green against a dev server.
- [x] **Rehearsal doc** — `docs/demo-rehearsal.md`: 5-run pass criteria + score rubric
      (5/5 freeze · 4/5 polish-only · 3/5 fix-core).
- [x] **In-UI demo-health pills** — `JudgeApp.tsx` strip: ROOM / MIC / AGENT / HEARD / SCORE /
      SAVE, derived from live LiveKit state; each maps to a rehearsal checkbox. tsc + 14/14 tests
      clean. MIC flags `fail` when connected but not publishing.

Left to do:

- [ ] **Run the 5x voice rehearsal (human-only):** `python scripts/stability_check.py` must pass,
      then run the same pitch 5 times per `docs/demo-rehearsal.md` and record the score. Confirm
      the health pills populate during a live session (only verifiable in a real room).

## Showmanship / personality features (proposed — not built)

Goal: lean into PitchPilot's personality — it's not a reviewer, it's a **cruel judge that
barges in**. These are stage-effect features that make judges laugh + remember it. Demo > product.
Most are prompt variants or UI wrappers over data we already publish (scorecard, `weakest_line`,
barge-in events, history). Keep the brutal copy **sharp, funny, not cruel**.

### Tier 1 — recommended now (low cost, high stage payoff)

- [x] **1. Brutal Mode toggle** — BUILT (needs live voice test). `[ FAIR ] [ BRUTAL ]` switch on the
      start screen, an INTENSITY axis orthogonal to persona (composes with all four). Brutal is more
      savage + funny but still constructive, with a hard no-cruelty floor and the SAME honest
      scorecard ("Stop. You're reading your package.json." / "Cool stack. Who asked for it?").
      Wiring: `_BRUTAL_OVERLAY` layers last (most salient) in `agent/prompts.py`
      (`instructions_for(persona, brutal)` / `intro_for(persona, brutal)`); metadata is now JSON
      `{persona, brutal}` — `api.token.ts` reads `&brutal=1`, agent parses via `_parse_meta()`
      (tolerates legacy bare slug + junk). UI: FAIR/BRUTAL toggle + live-header BRUTAL badge in
      `JudgeApp.tsx`. tsc + build + 14/14 tests + prompt/parser asserts clean. Demo line: "Let's
      turn on Brutal Mode." Live test: toggle Brutal, confirm sharper cut-ins, no personal attacks.
- [x] **2. Pitch Killcam** — BUILT. `web/src/components/Killcam.tsx`: a dark, cinematic frame (the
      dead line struck through in acid, the rewrite glowing) shown between the Scoreboard and the
      FeedbackPanel, live and on `/history/$id`. Pure UI over the `weakest_line` (quote + rewrite)
      already on the `feedback` topic — zero backend change. Handles the null-quote case as "the
      pattern that cost you". To avoid duplication, the small WEAKEST LINE section was removed from
      `FeedbackPanel` (Killcam owns that spotlight now). tsc + build + 14/14 tests clean.
- [x] **3. Objection! / Red Flag cut-in** — BUILT (needs live voice test). Every mid-pitch judge
      interruption flashes a full-screen `OBJECTION` + the actual judge line + `RED FLAG #n`, with a
      running 🚩 tally in the header. Signal: the agent publishes each live judge utterance on a new
      `cutin` topic, but only mid-pitch — it skips the greeting (no founder speech yet) and the
      verdict reading (`scored` already set), so only real barge-ins flash. `ObjectionOverlay` +
      `objection` keyframe (punch-in / hold / fade, 1.8s auto-dismiss, pointer-events-none).
      No SFX yet (visual-only, per the UI-fallback note). tsc + build + 14/14 tests clean.
      Live test: pitch badly, confirm each cut-in flashes once and the 🚩 count climbs.

### Tier 2 — fun, more work (do only if Tier 1 lands)

- [x] **4. Judge persona picker** — BUILT (needs live voice test). 4 personas the founder picks
      before connecting: **PitchPilot** (balanced, default), **YC Partner** (pain/wedge/why-now —
      "Too vague. Who is desperate for this?"), **Hackathon Judge** (demo/depth/rubric — "Where's
      the live moment?"), **Angry Engineer** (feasibility/latency/architecture — "That sounds like
      a prompt, not a system."). Wiring: shared rulebook + per-persona lens in `agent/prompts.py`
      (`instructions_for`/`intro_for`); slug flows start-screen picker → `?persona=` →
      `api.token.ts` stamps participant **metadata** → agent reads it via `wait_for_participant()`
      and builds that prompt + intro. Picker UI + live-header badge in `JudgeApp.tsx`. tsc + build +
      14/14 tests clean. Still composes cleanly with a future Brutal toggle (orthogonal axis).
      Live test: pick each judge, confirm the greeting + interruptions match the persona.
- [ ] **5. Red Flag counter + Pitch Damage meter** — running tally of barge-ins (`RED FLAG #1`) and a
      `Pitch Damage: ███████░░░ 70%` meter that rises on jargon-dumping, falls on correction. Makes
      the demo feel like a game.
- [ ] **6. Pitch HP / Boss-fight UI** — frame the pitch as a boss fight: `PITCH HP: 100 / JUDGE
      PATIENCE: 100`, deltas on the fly (`-20 Judge Patience: stack before pain` / `+15 Clarity`),
      `VERDICT: survived Q&A`. Reinforces "pitch is a realtime performance, not an essay." (Likely
      supersedes #5 — pick one HP/meter treatment, don't ship both.)
- [ ] **7. Score reveal animation** — after "score me", reveal line-by-line over 1–2s
      (`Problem clarity: detected / Why voice: weak / … TOTAL: 74/100`) instead of instant. Game-show
      rhythm. Pure frontend over the scorecard we already get.
- [ ] **8. "Try Again" rewrite challenge** — post-scorecard button `TRY AGAIN WITH THIS OPENING`
      shows a stronger opening to read; second run's score trends up. Completes the practice-loop
      story (bad pitch → 65 → rewrite → 82 → history trend). Leans on the existing history feature.
- [ ] **9. Hall of Shame / Hall of Fame** — split the `/history` page: lowest-score pitch + its worst
      line vs. highest-score pitch + its best opening. Makes history more than a list. Uses saved
      scorecards we already store.

### Tier 3 — lower priority (dilutes the core)

- [ ] **10. Audience judge mode** — local fake poll (`Would you fund this pitch? [ YES ] [ NO ]
      [ NEEDS DEMO ]`). Fun for a live room but pulls focus off PitchPilot's core; only if time.

### Best-version demo flow (target)

"Most pitch tools are polite. Judges aren't." → turn on Brutal Mode → say "We use LiveKit, OpenAI
realtime, TanStack…" → `OBJECTION: Implementation before problem` flashes, judge: "Stop. You're
reading your package.json." → correct it → "Better. Now why voice?" → "Score me." → `TOTAL 78/100` +
`KILLCAM` (weakest line + rewrite) → history trend `Run 1: 38 → Run 2: 78`.

## Stretch (only if V0 lands with time to spare)

- [ ] Telli "judge calls your phone" via SIP — bonus-prize bait. Do NOT start until V0 is demo-ready.

## Done = demo-ready

- After Task 2 + the voice smoke test: V0 voice-only demo works (the safe floor).
- After Task 3 + real benchmark run: the eval story is provable offline.
- After Task 5: live on-screen scorecard.
