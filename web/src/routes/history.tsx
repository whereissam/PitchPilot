import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { PitchListItem } from "../lib/pitches";

export const Route = createFileRoute("/history")({ component: History });

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function History() {
  const [items, setItems] = useState<PitchListItem[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/pitches")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setItems)
      .catch(() => setErr(true));
  }, []);

  // list comes newest-first; the trend reads oldest -> newest
  const chrono = items ? [...items].reverse() : [];
  const max = chrono.reduce((m, i) => Math.max(m, i.total), 0) || 100;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b-2 border-ink px-6 py-4 md:px-10">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-8 w-8 md:h-9 md:w-9" />
          <span className="font-display text-2xl leading-none tracking-tight md:text-3xl">
            PITCHPILOT
          </span>
        </Link>
        <Link
          to="/"
          className="border-2 border-ink bg-bone px-4 py-2 font-display text-lg tracking-wide transition-colors hover:bg-ink hover:text-bone"
        >
          ← PITCH AGAIN
        </Link>
      </header>

      <main className="flex flex-1 flex-col px-6 py-10 md:px-10 md:py-14">
        <p className="font-body text-xs font-bold tracking-[0.28em] text-acid">PROOF YOU IMPROVED</p>
        <h1 className="mt-2 font-display text-[clamp(2.8rem,10vw,7rem)] leading-[0.9] tracking-tight">
          SCORE TREND
        </h1>

        {err && (
          <p className="mt-8 border-l-4 border-acid bg-acid/10 px-4 py-2 font-body text-sm">
            Could not load history. Is the dev server running?
          </p>
        )}

        {items && items.length === 0 && (
          <p className="mt-10 max-w-xl font-body text-lg text-ink/60">
            No pitches saved yet. Go pitch, say{" "}
            <span className="font-bold text-ink">“score me”</span>, and your verdict lands here —
            run after run, so you can watch the number climb.
          </p>
        )}

        {chrono.length > 0 && (
          <>
            {/* trend — oldest to newest, the value PitchPilot is really selling */}
            <div className="mt-10 border-2 border-ink">
              {chrono.map((it, i) => (
                <Link
                  key={it.id}
                  to="/history/$id"
                  params={{ id: it.id }}
                  className="slam grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b-2 border-ink/15 px-5 py-4 transition-colors last:border-b-0 hover:bg-ink hover:text-bone md:px-7"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="font-body text-xs font-bold tracking-[0.18em] text-ink/45">
                    RUN {pad2(i + 1)}
                  </span>
                  <span className="relative block h-3 bg-ink/10">
                    <span
                      className="absolute inset-y-0 left-0 bg-acid"
                      style={{ width: `${(it.total / max) * 100}%` }}
                    />
                  </span>
                  <span className="font-display text-3xl leading-none tracking-tight md:text-4xl">
                    {it.total}
                    <span className="font-body text-sm align-top text-ink/40"> /100</span>
                  </span>
                </Link>
              ))}
            </div>

            {/* full list, newest first */}
            <p className="mt-12 font-body text-xs font-bold tracking-[0.28em] text-ink/45">
              ALL RUNS · NEWEST FIRST
            </p>
            <ul className="mt-4">
              {items!.map((it) => (
                <li key={it.id} className="border-b border-ink/15">
                  <Link
                    to="/history/$id"
                    params={{ id: it.id }}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-3 transition-colors hover:text-acid"
                  >
                    <span className="font-body text-sm text-ink/60">
                      {new Date(it.createdAt).toLocaleString()}
                    </span>
                    <span className="font-body text-sm text-ink/80">
                      {it.actionTitle ?? it.verdict}
                    </span>
                    <span className="font-display text-2xl leading-none tracking-tight">
                      {it.total}
                      <span className="font-body text-xs align-top text-ink/40"> /100</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
