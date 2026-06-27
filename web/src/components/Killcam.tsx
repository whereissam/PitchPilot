// Pitch Killcam — the showmanship spotlight on the line that killed the score.
// Pure UI over the weakest_line the agent already publishes on the `feedback` topic. A dark,
// cinematic frame (distinct from the bone panels): the dead line struck through in acid, the
// rewrite glowing. Shown between the Scoreboard and the FeedbackPanel, live and in history.
import type { WeakestLine } from "../lib/pitches";

export function Killcam({ weakestLine }: { weakestLine: WeakestLine }) {
  const quote = weakestLine.quote?.trim();
  const hasQuote = quote != null && quote !== "";

  return (
    <section className="slam border-t-2 border-ink bg-ink px-6 py-8 text-bone md:px-10 md:py-12">
      <div className="flex items-center gap-3">
        <span className="bg-acid px-2 py-1 font-display text-xl leading-none tracking-wide text-ink">
          KILLCAM
        </span>
        <span className="font-body text-xs font-bold tracking-[0.28em] text-bone/55">
          {hasQuote ? "THE LINE THAT KILLED YOUR SCORE" : "THE PATTERN THAT COST YOU"}
        </span>
      </div>

      <div className="mt-6 max-w-4xl">
        {hasQuote ? (
          <>
            <p className="font-display text-[clamp(1.6rem,5vw,3.4rem)] leading-[1.02] tracking-tight text-bone/35 line-through decoration-acid decoration-[3px]">
              “{quote}”
            </p>
            <p className="mt-3 font-body text-sm text-bone/45">{weakestLine.why_weak}</p>
          </>
        ) : (
          <p className="font-body text-lg leading-snug text-bone/70">{weakestLine.why_weak}</p>
        )}
      </div>

      <div className="mt-8 h-px w-full bg-bone/15" />

      <div className="mt-6 max-w-4xl">
        <span className="font-body text-xs font-bold tracking-[0.28em] text-acid">
          {hasQuote ? "REWRITE" : "SAY THIS INSTEAD"}
        </span>
        <p className="mt-2 font-display text-[clamp(1.4rem,4vw,2.6rem)] leading-[1.05] tracking-tight text-acid">
          “{weakestLine.rewrite}”
        </p>
      </div>
    </section>
  );
}
