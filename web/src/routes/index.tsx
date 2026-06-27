import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const JudgeApp = lazy(() => import("../components/JudgeApp"));

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <main style={{ padding: 48, fontFamily: "system-ui" }}>
        <h1>PitchPilot</h1>
        <p>Loading…</p>
      </main>
    );
  }
  return (
    <Suspense fallback={<p style={{ padding: 48 }}>Loading…</p>}>
      <JudgeApp />
    </Suspense>
  );
}
