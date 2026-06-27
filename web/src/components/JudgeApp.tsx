import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import "@livekit/components-styles";

type Conn = { token: string; url: string };

function Stage() {
  const { state } = useVoiceAssistant();
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>JudgeMode</h1>
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
        <h1>JudgeMode</h1>
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
      <RoomAudioRenderer />
      <VoiceAssistantControlBar />
    </LiveKitRoom>
  );
}
