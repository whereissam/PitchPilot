// Pitch history storage — flat JSON (+ optional audio) files under data/pitches/.
// The scorecard is the only required artifact; transcript and audio are best-effort,
// so a save must never fail because either was missing. See the design spec:
// docs/superpowers/specs/2026-06-27-pitch-history-design.md
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type Scorecard = {
  idea: number;
  execution: number;
  demo_clarity: number;
  technical_depth: number;
  why_voice: number;
  benchmark_present: boolean;
  best_next_fix: string;
  verdict: string;
  total: number;
};

export type TranscriptLine = { role: "founder" | "judge"; text: string };

export type WeakestLine = { quote: string | null; why_weak: string; rewrite: string };

export type Feedback = {
  action_title: string;
  what_landed: string | null;
  critique: string;
  lowest_metric: { name: string; score: number; reason: string };
  weakest_line: WeakestLine;
};

export type PitchRecord = {
  version: 1;
  id: string;
  createdAt: string;
  total: number;
  verdict: string;
  // Lifted from feedback so the list never parses the feedback object. Null when no feedback.
  actionTitle: string | null;
  scorecard: Scorecard;
  transcript: TranscriptLine[];
  audioExt: string | null;
  feedback: Feedback | null;
};

/** Lightweight shape the list/trend views read — never touches the scorecard/feedback schema. */
export type PitchListItem = Pick<
  PitchRecord,
  "id" | "createdAt" | "total" | "verdict" | "actionTitle"
>;

// Filesystem-safe, lexicographically sortable id derived from an ISO timestamp.
const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

export function makeId(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

/** Default base dir: <cwd>/data/pitches (gitignored). */
export function pitchesDir(): string {
  return join(process.cwd(), "data", "pitches");
}

export function buildRecord(input: {
  scorecard: Scorecard;
  transcript?: TranscriptLine[];
  audioExt?: string | null;
  feedback?: Feedback | null;
  date: Date;
}): PitchRecord {
  const { scorecard, transcript = [], audioExt = null, feedback = null, date } = input;
  if (!scorecard || typeof scorecard.total !== "number") {
    throw new Error("buildRecord: a scorecard with a numeric total is required");
  }
  return {
    version: 1,
    id: makeId(date),
    createdAt: date.toISOString(),
    total: scorecard.total,
    verdict: scorecard.verdict,
    actionTitle: feedback?.action_title ?? null,
    scorecard,
    transcript,
    audioExt,
    feedback,
  };
}

export function audioPath(baseDir: string, record: Pick<PitchRecord, "id" | "audioExt">): string | null {
  return record.audioExt ? join(baseDir, `${record.id}.${record.audioExt}`) : null;
}

function recordPath(baseDir: string, id: string): string {
  return join(baseDir, `${id}.json`);
}

export async function writeRecord(
  baseDir: string,
  record: PitchRecord,
  audioBytes?: Uint8Array,
): Promise<void> {
  await mkdir(baseDir, { recursive: true });
  await writeFile(recordPath(baseDir, record.id), JSON.stringify(record, null, 2), "utf-8");
  const p = audioPath(baseDir, record);
  if (p && audioBytes) {
    await writeFile(p, audioBytes);
  }
}

export async function readRecord(baseDir: string, id: string): Promise<PitchRecord | null> {
  if (!isValidId(id)) return null;
  try {
    return JSON.parse(await readFile(recordPath(baseDir, id), "utf-8")) as PitchRecord;
  } catch {
    return null;
  }
}

export async function listRecords(baseDir: string): Promise<PitchListItem[]> {
  let files: string[];
  try {
    files = await readdir(baseDir);
  } catch {
    return []; // dir doesn't exist yet — no pitches saved
  }
  const items: PitchListItem[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const r = JSON.parse(await readFile(join(baseDir, f), "utf-8")) as PitchRecord;
      items.push({
        id: r.id,
        createdAt: r.createdAt,
        total: r.total,
        verdict: r.verdict,
        actionTitle: r.actionTitle ?? null,
      });
    } catch {
      console.warn(`[pitches] skipping unreadable record: ${f}`);
    }
  }
  // newest first — ids sort lexicographically by time
  items.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return items;
}

/** Chronological (oldest -> newest) points for the score-over-time trend. */
export function toTrend(items: PitchListItem[]): PitchListItem[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
