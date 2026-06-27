import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  useDataChannel,
} from "@livekit/components-react";
import "@livekit/components-styles";

type Conn = { token: string; url: string };

type Card = {
  idea: number; execution: number; demo_clarity: number;
  technical_depth: number; why_voice: number;
  benchmark_present: boolean; best_next_fix: string;
};

function Scorecard() {
  const [card, setCard] = useState<Card | null>(null);
  useDataChannel("scorecard", (msg) => {
    try { setCard(JSON.parse(new TextDecoder().decode(msg.payload))); } catch {}
  });
  if (!card) return null;
  const row = (label: string, v: number) => (
    <div style={{ display: "flex", justifyContent: "space-between", width: 280 }}>
      <span>{label}</span><b>{v}/10</b>
    </div>
  );
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Scorecard</h2>
      {row("Idea", card.idea)}
      {row("Execution", card.execution)}
      {row("Demo clarity", card.demo_clarity)}
      {row("Technical depth", card.technical_depth)}
      {row("Why voice", card.why_voice)}
      <div style={{ width: 280, display: "flex", justifyContent: "space-between" }}>
        <span>Benchmark</span><b>{card.benchmark_present ? "present" : "missing"}</b>
      </div>
      <p style={{ maxWidth: 360 }}><b>Best next fix:</b> {card.best_next_fix}</p>
    </div>
  );
}

function Stage() {
  const { state } = useVoiceAssistant();
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>PitchPilot</h1>
      <p>Judge is: <b>{state}</b></p>
      <p>Pitch your project. Say <b>"score me"</b> when you're done.</p>
    </div>
  );
}

export default function JudgeApp() {
  const [conn, setConn] = useState<Conn | null>(null);

  if (!conn) {
    return (
      <main style={{ padding: 48, fontFamily: "system-ui" }}>
        <h1>PitchPilot</h1>
        <p>A realtime voice judge that interrupts weak pitches before the real judges do.</p>
        <button
          style={{ fontSize: 18, padding: "12px 20px" }}
          onClick={async () => {
            const res = await fetch("/api/token");
            if (!res.ok) { alert("Token error — check web/.env and restart bun run dev"); return; }
            setConn(await res.json());
          }}
        >
          Start pitching
        </button>
      </main>
    );
  }

  return (
    <LiveKitRoom token={conn.token} serverUrl={conn.url} connect audio data-lk-theme="default">
      <Stage />
      <Scorecard />
      <RoomAudioRenderer />
      <VoiceAssistantControlBar />
    </LiveKitRoom>
  );
}
