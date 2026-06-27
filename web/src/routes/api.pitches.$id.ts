import { createFileRoute } from "@tanstack/react-router";
import { readRecord, pitchesDir } from "../lib/pitches";

export const Route = createFileRoute("/api/pitches/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const record = await readRecord(pitchesDir(), params.id);
        if (!record) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(record);
      },
    },
  },
});
