import { createFileRoute } from "@tanstack/react-router";
import { AccessToken } from "livekit-server-sdk";

// Keep in sync with PERSONAS in agent/prompts.py. The slug rides the participant metadata to
// the agent, which builds the matching judge prompt. Unknown/missing -> the default judge.
const PERSONAS = new Set(["pitchpilot", "yc", "hackathon", "engineer"]);
const DEFAULT_PERSONA = "pitchpilot";

export const Route = createFileRoute("/api/token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
          return Response.json({ error: "Missing LiveKit env vars" }, { status: 500 });
        }
        const params = new URL(request.url).searchParams;
        const requested = params.get("persona") ?? "";
        const persona = PERSONAS.has(requested) ? requested : DEFAULT_PERSONA;
        const brutal = params.get("brutal") === "1";
        const room = "judgemode";
        const identity = "pitcher-" + Math.random().toString(36).slice(2, 8);
        // metadata carries {persona, brutal} as JSON — the agent reads it via wait_for_participant().
        const metadata = JSON.stringify({ persona, brutal });
        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, metadata });
        at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
        const token = await at.toJwt();
        return Response.json({ token, url: LIVEKIT_URL });
      },
    },
  },
});
