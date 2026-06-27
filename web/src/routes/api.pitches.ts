import { createFileRoute } from "@tanstack/react-router";
import {
  buildRecord,
  listRecords,
  writeRecord,
  pitchesDir,
  type Scorecard,
  type TranscriptLine,
} from "../lib/pitches";

// audio/webm -> "webm"; falls back to webm. Sanitized so it can never escape a path.
function extFromMime(mime: string | undefined): string {
  const sub = (mime ?? "").split("/")[1] ?? "webm";
  const clean = sub.split(";")[0].replace(/[^a-z0-9]/gi, "");
  return clean || "webm";
}

export const Route = createFileRoute("/api/pitches")({
  server: {
    handlers: {
      // List — lightweight items, newest first. Reads only top-level fields.
      GET: async () => {
        return Response.json(await listRecords(pitchesDir()));
      },

      // Save one finished pitch. Scorecard required; transcript + audio best-effort.
      POST: async ({ request }) => {
        let scorecard: Scorecard | undefined;
        let transcript: TranscriptLine[] = [];
        let audioBytes: Uint8Array | undefined;
        let audioExt: string | null = null;

        try {
          const form = await request.formData();
          const meta = form.get("meta");
          if (typeof meta === "string") {
            const parsed = JSON.parse(meta);
            scorecard = parsed.scorecard;
            if (Array.isArray(parsed.transcript)) transcript = parsed.transcript;
          }
          const audio = form.get("audio");
          if (audio && typeof audio !== "string" && audio.size > 0) {
            audioBytes = new Uint8Array(await audio.arrayBuffer());
            audioExt = extFromMime(audio.type);
          }
        } catch {
          return Response.json({ error: "Malformed request body" }, { status: 400 });
        }

        if (!scorecard || typeof scorecard.total !== "number") {
          return Response.json({ error: "A scorecard is required" }, { status: 400 });
        }

        const record = buildRecord({ scorecard, transcript, audioExt, date: new Date() });
        await writeRecord(pitchesDir(), record, audioBytes);
        return Response.json({ id: record.id, createdAt: record.createdAt }, { status: 201 });
      },
    },
  },
});
