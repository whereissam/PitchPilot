import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

const { fontFamily: anton } = loadAnton();
const { fontFamily: grotesk } = loadGrotesk();

const BONE = "#ece7da";
const INK = "#16130d";
const ACID = "#ff3b1d";
const FADE = "rgba(236,231,218,0.15)";
const FADE_TX = "rgba(236,231,218,0.55)";

const FPS = 30;

const ease = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

const up = (p: number, dist = 40) => ({
  opacity: p,
  transform: `translateY(${(1 - p) * dist}px)`,
});

const Bg: React.FC<{ color: string; children: React.ReactNode }> = ({
  color,
  children,
}) => (
  <AbsoluteFill style={{ backgroundColor: color, fontFamily: grotesk }}>
    {children}
  </AbsoluteFill>
);

const Title: React.FC = () => {
  const f = useCurrentFrame();
  const bar = ease(f, 20, 40);
  return (
    <Bg color={BONE}>
      <div style={{ position: "absolute", left: 90, top: 96, ...up(ease(f, 0, 18), 18) }}>
        <span
          style={{
            fontWeight: 700,
            letterSpacing: "0.28em",
            color: ACID,
            fontSize: 22,
          }}
        >
          LIVEKIT × TELLI — REALTIME VOICE
        </span>
      </div>
      <div style={{ position: "absolute", left: 84, top: 170 }}>
        <div
          style={{
            fontFamily: anton,
            color: INK,
            fontSize: 170,
            lineHeight: 1,
            ...up(ease(f, 8, 28), 50),
          }}
        >
          PITCHPILOT
        </div>
        <div style={{ height: 16, width: bar * 420, background: ACID, marginTop: 26 }} />
        <div
          style={{
            color: INK,
            fontSize: 34,
            marginTop: 34,
            maxWidth: 980,
            ...up(ease(f, 30, 48), 26),
          }}
        >
          A realtime voice judge that <b>interrupts</b> weak hackathon pitches before the
          real judges do.
        </div>
      </div>
    </Bg>
  );
};

const Problem: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Bg color={INK}>
      <div style={{ position: "absolute", left: 90, top: 240, maxWidth: 1090 }}>
        <div
          style={{
            fontFamily: anton,
            color: BONE,
            fontSize: 66,
            lineHeight: 1.02,
            ...up(ease(f, 6, 24), 28),
          }}
        >
          MOST TEAMS DON'T LOSE BECAUSE THE IDEA IS BAD.
        </div>
        <div
          style={{
            fontFamily: anton,
            color: ACID,
            fontSize: 66,
            lineHeight: 1.02,
            marginTop: 18,
            ...up(ease(f, 34, 54), 28),
          }}
        >
          THEY LOSE BECAUSE THE DEMO SOUNDS BAD.
        </div>
      </div>
    </Bg>
  );
};

const BadPitch: React.FC = () => {
  const f = useCurrentFrame();
  const speaker =
    "“We use LiveKit, OpenAI, a realtime pipeline, data channels, a vector store…”";
  const chars = Math.floor(
    interpolate(f, [0, 55], [0, speaker.length], { extrapolateRight: "clamp" }),
  );
  const slam = spring({ frame: f - 72, fps: FPS, config: { damping: 14, stiffness: 120 } });
  return (
    <Bg color={BONE}>
      <div style={{ position: "absolute", left: 90, top: 120, maxWidth: 1050 }}>
        <span
          style={{ fontWeight: 700, letterSpacing: "0.2em", color: INK, opacity: 0.45, fontSize: 18 }}
        >
          PITCH
        </span>
        <div style={{ color: INK, opacity: 0.7, fontSize: 36, marginTop: 14, minHeight: 110 }}>
          {speaker.slice(0, chars)}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 84,
          top: 360,
          opacity: slam,
          transform: `translateY(${(1 - slam) * 40}px) scale(${0.96 + slam * 0.04})`,
        }}
      >
        <div style={{ background: INK, color: BONE, padding: "26px 36px", maxWidth: 1000 }}>
          <span style={{ fontWeight: 700, letterSpacing: "0.22em", color: ACID, fontSize: 18 }}>
            JUDGE CUTS IN
          </span>
          <div style={{ fontFamily: anton, fontSize: 70, lineHeight: 1, marginTop: 10 }}>
            PAUSE. THAT'S IMPLEMENTATION, NOT A PITCH.
          </div>
        </div>
      </div>
    </Bg>
  );
};

const CUTS = [
  "WHO IS THE USER?",
  "WHY REALTIME VOICE?",
  "THAT'S A FEATURE. WHAT'S THE PAIN?",
  "WHERE'S THE DEMO MOMENT?",
  "HOW DO YOU PROVE IT WORKS?",
];

const Cuts: React.FC = () => {
  const f = useCurrentFrame();
  const per = 28;
  const idx = Math.min(CUTS.length - 1, Math.floor(f / per));
  const local = f - idx * per;
  const p = ease(local, 0, 9);
  return (
    <Bg color={ACID}>
      <div style={{ position: "absolute", left: 90, top: 90 }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.28em", color: INK, fontSize: 20 }}>
          ONE CUT. ONE FIX.
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ fontFamily: anton, color: INK, fontSize: 96, lineHeight: 0.95, ...up(p, 36) }}>
          {CUTS[idx]}
        </div>
      </div>
    </Bg>
  );
};

const METRICS: [string, number][] = [
  ["IDEA", 8],
  ["EXECUTION", 7],
  ["DEMO CLARITY", 8],
  ["TECH DEPTH", 7],
  ["WHY VOICE", 9],
];

const Cell: React.FC<{ frame: number; delay: number; children: React.ReactNode; right?: boolean }> = ({
  frame,
  delay,
  children,
  right = true,
}) => {
  const s = spring({ frame: frame - delay, fps: FPS, config: { damping: 13, stiffness: 140 } });
  return (
    <div
      style={{
        borderBottom: `2px solid ${FADE}`,
        borderRight: right ? `2px solid ${FADE}` : undefined,
        padding: "20px 26px",
        opacity: s,
        transform: `translateY(${(1 - s) * 20}px)`,
      }}
    >
      {children}
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontWeight: 500, letterSpacing: "0.18em", color: FADE_TX, fontSize: 15 }}>
    {children}
  </div>
);

const Scorecard: React.FC = () => {
  const f = useCurrentFrame();
  const fix = ease(f, 86, 104);
  const verdict = ease(f, 116, 132);
  return (
    <Bg color={INK}>
      <div style={{ position: "absolute", left: 80, top: 50, ...up(ease(f, 0, 16), 18) }}>
        <div style={{ fontFamily: anton, color: BONE, fontSize: 82, lineHeight: 0.9 }}>
          THE VERDICT
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 168,
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
        }}
      >
        {METRICS.map(([label, v], i) => (
          <Cell key={label} frame={f} delay={18 + i * 8}>
            <Label>{label}</Label>
            <div
              style={{
                fontFamily: anton,
                fontSize: 84,
                lineHeight: 1,
                color: v >= 8 ? ACID : BONE,
              }}
            >
              {String(v).padStart(2, "0")}
              <span style={{ fontFamily: grotesk, fontSize: 18, color: "rgba(236,231,218,0.4)" }}>
                {" "}
                /10
              </span>
            </div>
          </Cell>
        ))}
        <Cell frame={f} delay={18 + 5 * 8} right={false}>
          <Label>BENCHMARK</Label>
          <div style={{ fontFamily: anton, fontSize: 46, lineHeight: 1, color: ACID }}>PRESENT</div>
        </Cell>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 92,
          background: ACID,
          color: INK,
          padding: "20px 80px",
          opacity: fix,
          transform: `translateY(${(1 - fix) * 30}px)`,
        }}
      >
        <div style={{ fontWeight: 700, letterSpacing: "0.22em", fontSize: 16 }}>BEST NEXT FIX</div>
        <div style={{ fontFamily: anton, fontSize: 40, lineHeight: 1.05, marginTop: 4 }}>
          Show the interruption in the first 20 seconds.
        </div>
      </div>
      <div style={{ position: "absolute", left: 80, bottom: 34, opacity: verdict }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.2em", color: BONE, fontSize: 22 }}>
          VERDICT: DEMO-READY.
        </span>
      </div>
    </Bg>
  );
};

const End: React.FC = () => {
  const f = useCurrentFrame();
  const bar = ease(f, 18, 36);
  return (
    <Bg color={BONE}>
      <div style={{ position: "absolute", left: 84, top: 210 }}>
        <div
          style={{ fontFamily: anton, color: INK, fontSize: 170, lineHeight: 1, ...up(ease(f, 6, 22), 36) }}
        >
          PITCHPILOT
        </div>
        <div style={{ height: 16, width: bar * 420, background: ACID, marginTop: 26 }} />
        <div style={{ color: INK, fontSize: 32, marginTop: 30, ...up(ease(f, 26, 42), 22) }}>
          Interrupts weak pitches before the real judges do.
        </div>
      </div>
      <div style={{ position: "absolute", left: 84, bottom: 60 }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.28em", color: ACID, fontSize: 20 }}>
          LIVEKIT × TELLI
        </span>
      </div>
    </Bg>
  );
};

export const PitchPilotVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BONE }}>
      <Sequence durationInFrames={110}>
        <Title />
      </Sequence>
      <Sequence from={110} durationInFrames={120}>
        <Problem />
      </Sequence>
      <Sequence from={230} durationInFrames={150}>
        <BadPitch />
      </Sequence>
      <Sequence from={380} durationInFrames={140}>
        <Cuts />
      </Sequence>
      <Sequence from={520} durationInFrames={220}>
        <Scorecard />
      </Sequence>
      <Sequence from={740} durationInFrames={100}>
        <End />
      </Sequence>
    </AbsoluteFill>
  );
};
