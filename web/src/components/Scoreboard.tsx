// The verdict scoreboard — shown live after "score me" and reused on the history detail page.
export type Card = {
  idea: number;
  execution: number;
  demo_clarity: number;
  technical_depth: number;
  why_voice: number;
  benchmark_present: boolean;
  best_next_fix: string;
};

const METRICS: [string, keyof Card][] = [
  ["IDEA", "idea"],
  ["EXECUTION", "execution"],
  ["DEMO CLARITY", "demo_clarity"],
  ["TECH DEPTH", "technical_depth"],
  ["WHY VOICE", "why_voice"],
];

export function Scoreboard({ card }: { card: Card }) {
  return (
    <div className="slam bg-ink text-bone">
      <div className="border-b-2 border-bone/25 px-6 py-4 md:px-10">
        <p className="font-display text-[clamp(2.4rem,8vw,5.5rem)] leading-[0.9] tracking-tight">
          THE VERDICT
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3">
        {METRICS.map(([label, key], i) => {
          const v = card[key] as number;
          return (
            <div
              key={key}
              className="slam border-b-2 border-r-2 border-bone/15 px-6 py-5 md:px-8 md:py-7"
              style={{ animationDelay: `${120 + i * 70}ms` }}
            >
              <p className="font-body text-xs font-medium tracking-[0.18em] text-bone/55">{label}</p>
              <p
                className={`font-display text-[clamp(3rem,9vw,6rem)] leading-none ${
                  v >= 8 ? "text-acid" : "text-bone"
                }`}
              >
                {String(v).padStart(2, "0")}
                <span className="font-body text-base align-top text-bone/40"> /10</span>
              </p>
            </div>
          );
        })}

        <div
          className="slam border-b-2 border-bone/15 px-6 py-5 md:px-8 md:py-7"
          style={{ animationDelay: `${120 + METRICS.length * 70}ms` }}
        >
          <p className="font-body text-xs font-medium tracking-[0.18em] text-bone/55">BENCHMARK</p>
          <p
            className={`font-display text-[clamp(1.8rem,5vw,3rem)] leading-none ${
              card.benchmark_present ? "text-acid" : "text-bone/45"
            }`}
          >
            {card.benchmark_present ? "PRESENT" : "MISSING"}
          </p>
        </div>
      </div>

      <div
        className="slam bg-acid px-6 py-6 text-ink md:px-10"
        style={{ animationDelay: `${260 + METRICS.length * 70}ms` }}
      >
        <p className="font-body text-xs font-bold tracking-[0.22em]">BEST NEXT FIX</p>
        <p className="mt-1 max-w-3xl font-display text-[clamp(1.4rem,3.4vw,2.4rem)] leading-[1.05]">
          {card.best_next_fix}
        </p>
      </div>
    </div>
  );
}
