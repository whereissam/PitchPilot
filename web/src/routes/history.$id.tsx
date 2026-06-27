import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Scoreboard } from "../components/Scoreboard";
import type { PitchRecord } from "../lib/pitches";

export const Route = createFileRoute("/history/$id")({ component: Detail });

function Detail() {
  const { id } = Route.useParams();
  const [record, setRecord] = useState<PitchRecord | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    fetch(`/api/pitches/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rec) => {
        setRecord(rec);
        setStatus("ok");
      })
      .catch(() => setStatus("missing"));
  }, [id]);

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
          to="/history"
          className="border-2 border-ink bg-bone px-4 py-2 font-display text-lg tracking-wide transition-colors hover:bg-ink hover:text-bone"
        >
          ← ALL RUNS
        </Link>
      </header>

      {status === "loading" && <p className="px-6 py-10 font-body text-ink/60 md:px-10">Loading…</p>}
      {status === "missing" && (
        <p className="px-6 py-10 font-body text-ink/60 md:px-10">
          That pitch could not be found. <Link to="/history" className="underline">Back to history</Link>.
        </p>
      )}

      {status === "ok" && record && (
        <main className="flex flex-1 flex-col">
          <div className="border-b-2 border-ink px-6 py-4 md:px-10">
            <span className="font-body text-sm text-ink/55">
              {new Date(record.createdAt).toLocaleString()}
            </span>
          </div>

          <Scoreboard card={record.scorecard} />

          {record.audioExt && (
            <div className="border-b-2 border-ink px-6 py-6 md:px-10">
              <p className="font-body text-xs font-bold tracking-[0.28em] text-acid">REPLAY</p>
              <audio controls src={`/api/pitches/${id}/audio`} className="mt-3 w-full max-w-xl" />
            </div>
          )}

          <div className="px-6 py-8 md:px-10">
            <p className="font-body text-xs font-bold tracking-[0.28em] text-ink/45">TRANSCRIPT</p>
            {record.transcript.length === 0 ? (
              <p className="mt-3 font-body text-ink/50">No transcript was captured for this run.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {record.transcript.map((line, i) => (
                  <div key={i} className="grid grid-cols-[88px_1fr] gap-3">
                    <span
                      className={`font-body text-xs font-bold uppercase tracking-[0.14em] ${
                        line.role === "judge" ? "text-acid" : "text-ink/45"
                      }`}
                    >
                      {line.role}
                    </span>
                    <span
                      className={`font-body text-base leading-snug ${
                        line.role === "judge" ? "border-l-2 border-acid pl-3 italic" : ""
                      }`}
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
