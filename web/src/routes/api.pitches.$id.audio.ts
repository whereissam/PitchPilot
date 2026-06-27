import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import { readRecord, audioPath, pitchesDir } from "../lib/pitches";

export const Route = createFileRoute("/api/pitches/$id/audio")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const record = await readRecord(pitchesDir(), params.id);
        const p = record && audioPath(pitchesDir(), record);
        if (!p) {
          return Response.json({ error: "No audio for this pitch" }, { status: 404 });
        }
        try {
          const bytes = await readFile(p);
          return new Response(bytes, {
            headers: { "content-type": `audio/${record!.audioExt}` },
          });
        } catch {
          return Response.json({ error: "Audio file missing" }, { status: 404 });
        }
      },
    },
  },
});
