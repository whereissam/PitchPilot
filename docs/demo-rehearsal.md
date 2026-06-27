# PitchPilot demo rehearsal

Two gates before you trust the demo:

1. **Automated preflight** — system plumbing. `python scripts/stability_check.py`
2. **Manual 5-run rehearsal** — voice behavior (below). Can't be cheaply automated.

Only the second one tells you whether the *voice* path is stable.

## Stable = a score

```
Very stable : 5 / 5 runs pass   -> freeze the core, only safe polish
Stable      : 4 / 5 runs pass   -> hackathon-stable, only safe polish
Not stable  : 3 / 5 or worse    -> fix the core only, ship nothing new
```

## 5-run voice rehearsal

Run the **same** script 5 times. A run passes only if every box is checked.

Per-run pass criteria:

- [ ] App opens
- [ ] Mic connects
- [ ] Agent joins the room
- [ ] Agent hears the founder
- [ ] Agent interrupts an implementation-led pitch ("we wired up the API…")
- [ ] Founder says "score me"
- [ ] Scorecard appears
- [ ] No restart needed

Result:

```
Run 1:  pass / fail   notes:
Run 2:  pass / fail   notes:
Run 3:  pass / fail   notes:
Run 4:  pass / fail   notes:
Run 5:  pass / fail   notes:
```

Decision:

```
5/5 = stable, freeze core
4/5 = hackathon-stable, only safe polish
3/5 or worse = unstable, fix core only
```

## When a run fails

Write down *where* it broke (which checkbox), not just "it broke". The failure
point tells you which subsystem to fix: room connect, mic publish, agent audio,
interruption logic, scoring round-trip, or save. That mapping is exactly what the
optional in-UI demo-health pills surface live during a real pitch.

Do **not** reach for Langfuse / Phoenix yet. First make the two gates green.
