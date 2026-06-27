# PitchPilot — explainer video

A 28-second programmatic explainer built with [Remotion](https://www.remotion.dev/), run with Bun. It reuses the app's look: Anton and Space Grotesk, the bone/ink/vermilion palette, and the slam-in scoreboard.

The rendered file lives at `out/pitchpilot.mp4`.

## Edit and preview

```bash
cd video
bun install
bun run studio        # opens Remotion Studio to scrub and tweak
```

## Render

```bash
bun run render        # writes out/pitchpilot.mp4
bun run still          # writes out/frame.png (single frame, fast check)
```

## Where things are

- `src/Root.tsx` sets the composition: 1280x720, 30 fps, 840 frames.
- `src/PitchPilot.tsx` holds the six scenes: title, the problem, a bad pitch getting cut off, a montage of judge cuts, the scorecard, and the end card.

To change the scorecard numbers or the cut lines, edit the `METRICS` and `CUTS` arrays in `src/PitchPilot.tsx`.
