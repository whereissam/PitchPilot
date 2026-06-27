import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  BarVisualizer,
  useVoiceAssistant,
  useDataChannel,
  useRoomContext,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Scoreboard, type Card } from "./Scoreboard";
import { FeedbackPanel } from "./FeedbackPanel";
import type { TranscriptLine, Feedback } from "../lib/pitches";

type Conn = { token: string; url: string };

// The full scorecard payload the agent publishes (Scoreboard only reads the Card subset).
type FullCard = Card & { verdict: string; total: number };

type SaveState = "idle" | "writing" | "saving" | "ok" | "ok_nocrit" | "fail";

// How long to wait for the (best-effort) feedback topic before saving without it.
const FEEDBACK_GRACE_MS = 5000;

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
  const [card, setCard] = useState<FullCard | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saved, setSaved] = useState<SaveState>("idle");
  // Demo-health signal: the agent's STT produced at least one transcript line,
  // i.e. it actually heard the founder. Drives the HEARD pill.
  const [heard, setHeard] = useState(false);

  // Best-effort artifacts: a missing transcript, audio, or feedback must never block the save.
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const feedbackRef = useRef<Feedback | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const savedOnceRef = useRef(false);

  // Record the mic for replay. Own getUserMedia stream — robust against LiveKit
  // track-publish timing; audio is best-effort, so any failure here is swallowed.
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        const rec = new MediaRecorder(s);
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.start();
        recorderRef.current = rec;
      })
      .catch(() => {
        /* no audio replay — text history still works */
      });
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useDataChannel("transcript", (msg) => {
    try {
      const lines = JSON.parse(new TextDecoder().decode(msg.payload)) as TranscriptLine[];
      transcriptRef.current = lines;
      if (lines.length) setHeard(true); // first transcript = the agent heard the founder
    } catch {
      /* keep whatever we had — transcript is optional */
    }
  });

  useDataChannel("feedback", (msg) => {
    try {
      const fb = JSON.parse(new TextDecoder().decode(msg.payload)) as Feedback;
      feedbackRef.current = fb;
      setFeedback(fb); // render the panel live as soon as it lands
    } catch {
      /* malformed feedback — it's best-effort, ignore */
    }
  });

  useDataChannel("scorecard", (msg) => {
    try {
      const full = JSON.parse(new TextDecoder().decode(msg.payload)) as FullCard;
      setCard(full); // render the verdict immediately — never wait on feedback
      void handleVerdict(full);
    } catch {
      /* malformed payload — voice still delivers the verdict */
    }
  });

  // Feedback is a 2nd LLM call, so it lands a beat after the scorecard. Wait briefly for it,
  // then save with whatever arrived (or null). The scorecard never waits on feedback.
  function waitForFeedback(ms: number): Promise<Feedback | null> {
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        if (feedbackRef.current || performance.now() - start >= ms) resolve(feedbackRef.current);
        else setTimeout(tick, 150);
      };
      tick();
    });
  }

  async function handleVerdict(scorecard: FullCard) {
    if (savedOnceRef.current) return; // verdict fires once; guard against double-publish
    savedOnceRef.current = true;
    setSaved("writing");
    const fb = await waitForFeedback(FEEDBACK_GRACE_MS);
    await savePitch(scorecard, fb);
  }

  async function savePitch(scorecard: FullCard, fb: Feedback | null) {
    setSaved("saving");

    let audioBlob: Blob | null = null;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      audioBlob = await new Promise<Blob | null>((resolve) => {
        rec.onstop = () =>
          resolve(
            chunksRef.current.length
              ? new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
              : null,
          );
        rec.stop();
      });
    }

    try {
      const fd = new FormData();
      fd.append(
        "meta",
        JSON.stringify({ scorecard, transcript: transcriptRef.current, feedback: fb }),
      );
      if (audioBlob) fd.append("audio", audioBlob, "pitch.webm");
      const res = await fetch("/api/pitches", { method: "POST", body: fd });
      setSaved(res.ok ? (fb ? "ok" : "ok_nocrit") : "fail");
    } catch {
      setSaved("fail");
    }
  }

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
        <div className="flex items-center gap-3">
          <Link
            to="/history"
            className="font-body text-xs font-bold tracking-[0.18em] text-ink/55 underline-offset-4 hover:text-acid hover:underline"
          >
            HISTORY
          </Link>
          <StatusPill />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {card ? (
          <>
            <Scoreboard card={card} />
            {feedback && <FeedbackPanel feedback={feedback} />}
          </>
        ) : (
          <LiveStage />
        )}
      </main>

      <div className="flex items-center justify-between gap-3 border-t-2 border-ink px-6 py-2 md:px-10">
        <DemoHealth heard={heard} scored={!!card} save={saved} />
        <span className="hidden font-body text-[0.6rem] font-bold tracking-[0.22em] text-ink/30 sm:block">
          DEMO HEALTH
        </span>
      </div>

      <footer className="flex items-center justify-between border-t-2 border-ink px-6 py-4 md:px-10">
        <span className="font-body text-xs tracking-[0.18em] text-ink/45">
          {card ? "VERDICT DELIVERED" : "LIVE — ROOM: JUDGEMODE"}
        </span>
        <div className="flex items-center gap-4">
          {card && <SavedMarker state={saved} />}
          <button
            onClick={() => room.disconnect()}
            className="border-2 border-ink bg-bone px-4 py-2 font-display text-lg tracking-wide transition-colors hover:bg-ink hover:text-bone"
          >
            END SESSION
          </button>
        </div>
      </footer>
    </div>
  );
}

// A live operator panel for rehearsal: each pill maps to a checkbox in
// docs/demo-rehearsal.md, so when a run fails you can see *where* at a glance.
type PillStatus = "ok" | "pending" | "off" | "fail";

function HealthPill({ label, status, detail }: { label: string; status: PillStatus; detail: string }) {
  const dot =
    status === "ok"
      ? "bg-acid"
      : status === "fail"
        ? "bg-acid blink"
        : status === "pending"
          ? "bg-ink/40 blink"
          : "bg-ink/20";
  const box = status === "fail" ? "border-acid text-acid" : "border-ink/25 text-ink/60";
  return (
    <span
      title={detail}
      className={`flex items-center gap-1.5 border ${box} px-2 py-1 leading-none`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 ${dot}`} />
      <span className="font-body text-[0.6rem] font-bold tracking-[0.18em]">{label}</span>
    </span>
  );
}

function DemoHealth({ heard, scored, save }: { heard: boolean; scored: boolean; save: SaveState }) {
  const conn = useConnectionState();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const { agent } = useVoiceAssistant();
  const connected = conn === "connected";

  const room: PillStatus = connected
    ? "ok"
    : conn === "connecting" || conn === "reconnecting"
      ? "pending"
      : "off";
  // Connected but no mic publishing is a real demo-killer — flag it loud, not idle.
  const mic: PillStatus = isMicrophoneEnabled ? "ok" : connected ? "fail" : "off";
  const agentStatus: PillStatus = agent ? "ok" : connected ? "pending" : "off";
  const heardStatus: PillStatus = heard ? "ok" : agent ? "pending" : "off";
  const scoreStatus: PillStatus = scored ? "ok" : "pending";
  const saveStatus: PillStatus =
    save === "ok" || save === "ok_nocrit"
      ? "ok"
      : save === "fail"
        ? "fail"
        : save === "saving" || save === "writing"
          ? "pending"
          : "off";

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="demo health">
      <HealthPill label="ROOM" status={room} detail={`Room: ${conn}`} />
      <HealthPill label="MIC" status={mic} detail={isMicrophoneEnabled ? "Mic: live" : "Mic: off"} />
      <HealthPill
        label="AGENT"
        status={agentStatus}
        detail={agent ? "Agent: in room" : "Agent: not joined"}
      />
      <HealthPill
        label="HEARD"
        status={heardStatus}
        detail={heard ? "Agent heard the founder" : "No transcript yet"}
      />
      <HealthPill
        label="SCORE"
        status={scoreStatus}
        detail={scored ? "Scorecard received" : "No scorecard yet"}
      />
      <HealthPill label="SAVE" status={saveStatus} detail={`Save: ${save}`} />
    </div>
  );
}

function SavedMarker({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const tone = state === "fail" ? "text-acid" : "text-ink/55";
  const isSaved = state === "ok" || state === "ok_nocrit";
  const text =
    state === "writing"
      ? "WRITING CRITIQUE…"
      : state === "saving"
        ? "SAVING…"
        : state === "ok"
          ? "SAVED ✓ · VIEW HISTORY"
          : state === "ok_nocrit"
            ? "SAVED · NO CRITIQUE"
            : "NOT SAVED";
  return (
    <span className={`font-body text-xs font-bold tracking-[0.18em] ${tone}`}>
      {isSaved ? (
        <Link to="/history" className="hover:text-acid">
          {text}
        </Link>
      ) : (
        text
      )}
    </span>
  );
}

export default function JudgeApp() {
  const [conn, setConn] = useState<Conn | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!conn) {
    return (
      <main className="flex min-h-screen flex-col justify-between px-6 py-12 md:px-16 md:py-20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="PitchPilot" className="h-11 w-11 md:h-12 md:w-12" />
            <span className="font-body text-xs font-bold tracking-[0.28em] text-acid">
              REALTIME VOICE JUDGE
            </span>
          </div>
          <Link
            to="/history"
            className="font-body text-xs font-bold tracking-[0.18em] text-ink/55 underline-offset-4 hover:text-acid hover:underline"
          >
            HISTORY →
          </Link>
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
