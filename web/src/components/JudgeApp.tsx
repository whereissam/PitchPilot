import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  BarVisualizer,
  useVoiceAssistant,
  useDataChannel,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";

type Conn = { token: string; url: string };

type Card = {
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

// realtime agent state -> the giant scoreboard word
function liveWord(state: string): { word: string; sub: string; hot: boolean } {
  switch (state) {
    case "connecting":
    case "initializing":
      return { word: "WARMING UP", sub: "patching you through to the judge", hot: false };
    case "listening":
      return { word: "LISTENING", sub: "make your case", hot: false };
    case "thinking":
      return { word: "JUDGING", sub: "forming an opinion", hot: true };
    case "speaking":
      return { word: "ON THE RECORD", sub: "the judge is speaking", hot: true };
    default:
      return { word: "READY", sub: "start whenever you are", hot: false };
  }
}

function StatusPill() {
  const { state } = useVoiceAssistant();
  const active = state === "listening" || state === "thinking" || state === "speaking";
  const label =
    state === "thinking" ? "JUDGING" : state === "speaking" ? "VERDICT" : state.toUpperCase();
  return (
    <div className="flex items-center gap-2 border-2 border-ink px-3 py-1.5">
      <span className={`h-2.5 w-2.5 ${active ? "bg-acid blink" : "bg-ink/40"}`} />
      <span className="font-display text-lg leading-none tracking-wide">{label}</span>
    </div>
  );
}

function Scoreboard({ card }: { card: Card }) {
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

function LiveStage() {
  const { state, audioTrack } = useVoiceAssistant();
  const { word, sub, hot } = liveWord(state);
  return (
    <div className="flex flex-1 flex-col justify-between px-6 py-10 md:px-10 md:py-14">
      <div>
        <p
          key={word}
          className={`rise font-display text-[clamp(3.5rem,16vw,12rem)] leading-none tracking-tight ${
            hot ? "text-acid" : "text-ink"
          }`}
        >
          {word}
        </p>
        <p className="mt-3 font-body text-base tracking-wide text-ink/55 md:text-lg">{sub}</p>
      </div>

      <div className="pp-viz h-24 max-w-md">
        <BarVisualizer state={state} trackRef={audioTrack} barCount={9} />
      </div>

      <p className="font-body text-sm tracking-wide text-ink/60 md:text-base">
        Pitch your project. Say{" "}
        <span className="bg-ink px-1.5 py-0.5 font-bold text-bone">“SCORE ME”</span> for your verdict.
      </p>
    </div>
  );
}

function Stage() {
  const room = useRoomContext();
  const [card, setCard] = useState<Card | null>(null);

  useDataChannel("scorecard", (msg) => {
    try {
      setCard(JSON.parse(new TextDecoder().decode(msg.payload)) as Card);
    } catch {
      /* malformed payload — ignore, V0 voice still delivers the verdict */
    }
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b-2 border-ink px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-8 w-8 md:h-9 md:w-9" />
          <span className="font-display text-2xl leading-none tracking-tight md:text-3xl">
            PITCHPILOT
          </span>
          <span className="font-body text-[0.7rem] font-bold tracking-[0.28em] text-acid">
            VOICE JUDGE
          </span>
        </div>
        <StatusPill />
      </header>

      <main className="flex flex-1 flex-col">
        {card ? <Scoreboard card={card} /> : <LiveStage />}
      </main>

      <footer className="flex items-center justify-between border-t-2 border-ink px-6 py-4 md:px-10">
        <span className="font-body text-xs tracking-[0.18em] text-ink/45">
          {card ? "VERDICT DELIVERED" : "LIVE — ROOM: JUDGEMODE"}
        </span>
        <button
          onClick={() => room.disconnect()}
          className="border-2 border-ink bg-bone px-4 py-2 font-display text-lg tracking-wide transition-colors hover:bg-ink hover:text-bone"
        >
          END SESSION
        </button>
      </footer>
    </div>
  );
}

export default function JudgeApp() {
  const [conn, setConn] = useState<Conn | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!conn) {
    return (
      <main className="flex min-h-screen flex-col justify-between px-6 py-12 md:px-16 md:py-20">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="PitchPilot" className="h-11 w-11 md:h-12 md:w-12" />
          <span className="font-body text-xs font-bold tracking-[0.28em] text-acid">
            REALTIME VOICE JUDGE
          </span>
        </div>

        <div>
          <h1 className="font-display text-[clamp(3.5rem,15vw,12rem)] leading-none tracking-tight">
            PITCH
            <br />
            PILOT
          </h1>
          <div className="mt-6 h-2 w-40 bg-acid" />
          <p className="mt-8 max-w-2xl font-body text-lg leading-snug text-ink/70 md:text-2xl">
            A realtime voice judge that <span className="font-bold text-ink">interrupts</span> weak
            hackathon pitches — before the real judges do.
          </p>
        </div>

        <div>
          <button
            onClick={async () => {
              setErr(null);
              try {
                const res = await fetch("/api/token");
                if (!res.ok) {
                  setErr("Token error — create web/.env and restart `bun run dev`.");
                  return;
                }
                setConn((await res.json()) as Conn);
              } catch {
                setErr("Could not reach the token server. Is `bun run dev` running?");
              }
            }}
            className="group inline-flex items-center gap-4 bg-ink px-8 py-5 font-display text-3xl tracking-wide text-bone transition-colors hover:bg-acid hover:text-ink md:text-4xl"
          >
            START PITCHING
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </button>
          <p className="mt-4 font-body text-sm tracking-wide text-ink/55">
            Microphone required · say <span className="font-bold text-ink">“score me”</span> for your
            scorecard.
          </p>
          {err && (
            <p className="mt-4 max-w-md border-l-4 border-acid bg-acid/10 px-4 py-2 font-body text-sm text-ink">
              {err}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <LiveKitRoom
      token={conn.token}
      serverUrl={conn.url}
      connect
      audio
      onDisconnected={() => setConn(null)}
    >
      <RoomAudioRenderer />
      <Stage />
    </LiveKitRoom>
  );
}
