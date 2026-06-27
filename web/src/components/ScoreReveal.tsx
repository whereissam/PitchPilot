// Score reveal — a ~2s game-show pre-roll before the full Scoreboard. Each metric line rises in
// staggered, then the TOTAL slams. Live-only (history shows the Scoreboard directly, no replay).
import type { Card } from "./Scoreboard";

const LINES: [string, keyof Card][] = [
  ["PROBLEM / IDEA", "idea"],
  ["EXECUTION", "execution"],
  ["DEMO CLARITY", "demo_clarity"],
  ["TECH DEPTH", "technical_depth"],
  ["WHY VOICE", "why_voice"],
];

function tag(v: number): { label: string; tone: string } {
  if (v >= 8) return { label: "STRONG", tone: "text-acid" };
  if (v >= 5) return { label: "DETECTED", tone: "text-bone" };
  return { label: "WEAK", tone: "text-bone/45" };
}

const STEP = 180; // ms between lines
const START = 150;

export function ScoreReveal({ card }: { card: Card }) {
  return (
    <div className="flex flex-1 flex-col justify-center bg-ink px-6 py-10 text-bone md:px-10">
      <p className="blink font-display text-[clamp(2rem,7vw,4.5rem)] leading-none tracking-tight text-acid">
        JUDGING…
      </p>

      <div className="mt-8 flex flex-col gap-3 md:gap-4">
        {LINES.map(([label, key], i) => {
          const t = tag(card[key] as number);
          return (
            <div
              key={key}
              className="rise flex items-baseline justify-between gap-4 border-b border-bone/15 pb-2"
              style={{ animationDelay: `${START + i * STEP}ms` }}
            >
              <span className="font-body text-sm tracking-[0.18em] text-bone/60 md:text-base">
                {label}
              </span>
              <span className={`font-display text-2xl tracking-wide md:text-3xl ${t.tone}`}>
                {t.label}
              </span>
            </div>
          );
        })}

        <div
          className="rise flex items-baseline justify-between gap-4 border-b border-bone/15 pb-2"
          style={{ animationDelay: `${START + LINES.length * STEP}ms` }}
        >
          <span className="font-body text-sm tracking-[0.18em] text-bone/60 md:text-base">
            BENCHMARK
          </span>
          <span
            className={`font-display text-2xl tracking-wide md:text-3xl ${
              card.benchmark_present ? "text-acid" : "text-bone/45"
            }`}
          >
            {card.benchmark_present ? "PRESENT" : "MISSING"}
          </span>
        </div>
      </div>

      <div className="slam mt-10" style={{ animationDelay: `${START + (LINES.length + 1) * STEP + 150}ms` }}>
        <span className="font-body text-xs font-bold tracking-[0.28em] text-bone/55">TOTAL</span>
        <p className="font-display text-[clamp(4rem,18vw,11rem)] leading-none tracking-tight text-acid">
          {card.total}
          <span className="align-top font-body text-2xl text-bone/40"> /100</span>
        </p>
      </div>
    </div>
  );
}
