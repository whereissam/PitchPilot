// Tiny synthesized SFX — no audio assets to bundle. The gavel is two quick wooden knocks built
// from oscillators. Browsers gate audio behind a user gesture, so call primeAudio() from the
// START click; playGavel() then works on later (gesture-less) barge-in events. All best-effort.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Resume the audio context inside a user gesture so later sounds are allowed to play.
export function primeAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function playGavel(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const t0 = c.currentTime;
  for (const [dt, freq] of [
    [0, 190],
    [0.085, 155],
  ] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t0 + dt);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + dt + 0.08);
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.45, t0 + dt + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.12);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0 + dt);
    o.stop(t0 + dt + 0.14);
  }
}
