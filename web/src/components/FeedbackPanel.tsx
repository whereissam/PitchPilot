// Richer written feedback — an explanation of the scorecard, not a second judge.
// Short and scannable on purpose. Shown live after the verdict and on the history detail page.
import type { Feedback } from "../lib/pitches";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t-2 border-ink/15 px-6 py-5 md:px-10">
      <p className="font-body text-xs font-bold tracking-[0.28em] text-acid">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function FeedbackPanel({ feedback }: { feedback: Feedback }) {
  // weakest_line is intentionally not rendered here — the Killcam component owns that spotlight.
  const { action_title, what_landed, critique, lowest_metric } = feedback;

  return (
    <section className="slam border-t-2 border-ink bg-bone">
      <div className="px-6 py-5 md:px-10">
        <p className="font-body text-xs font-bold tracking-[0.28em] text-ink/45">THE FIX</p>
        <h3 className="mt-1 font-display text-[clamp(1.8rem,4.5vw,3rem)] leading-[0.95] tracking-tight">
          {action_title}
        </h3>
      </div>

      {what_landed && (
        <Section label="WHAT LANDED">
          <p className="font-body text-base leading-snug text-ink/80">{what_landed}</p>
        </Section>
      )}

      <Section label="LOWEST METRIC">
        <span className="inline-block bg-ink px-2 py-1 font-display text-xl tracking-wide text-bone">
          {lowest_metric.name.toUpperCase()} {lowest_metric.score}/10
        </span>
        <p className="mt-2 font-body text-base leading-snug text-ink/80">{lowest_metric.reason}</p>
      </Section>

      <Section label="CRITIQUE">
        <p className="max-w-3xl font-body text-base leading-relaxed text-ink/85">{critique}</p>
      </Section>
    </section>
  );
}
