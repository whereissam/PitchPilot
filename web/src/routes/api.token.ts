import { createFileRoute } from "@tanstack/react-router";
import { AccessToken } from "livekit-server-sdk";

export const Route = createFileRoute("/api/token")({
  server: {
    handlers: {
      GET: async () => {
        const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
          return Response.json({ error: "Missing LiveKit env vars" }, { status: 500 });
        }
        const room = "judgemode";
        const identity = "pitcher-" + Math.random().toString(36).slice(2, 8);
        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity });
        at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
        const token = await at.toJwt();
        return Response.json({ token, url: LIVEKIT_URL });
      },
    },
  },
});
