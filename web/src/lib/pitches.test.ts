import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeId,
  isValidId,
  buildRecord,
  writeRecord,
  readRecord,
  listRecords,
  audioPath,
  toTrend,
  type Scorecard,
} from "./pitches";

const card: Scorecard = {
  idea: 7,
  execution: 8,
  demo_clarity: 7,
  technical_depth: 8,
  why_voice: 6,
  benchmark_present: true,
  best_next_fix: "Open with the user and their pain.",
  verdict: "Verdict: demo-ready.",
  total: 75,
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pitches-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("makeId / isValidId", () => {
  it("makes a filesystem-safe, sortable id from a Date", () => {
    const id = makeId(new Date("2026-06-27T16:40:12.704Z"));
    expect(id).toBe("2026-06-27T16-40-12-704Z");
    expect(isValidId(id)).toBe(true);
  });

  it("rejects traversal and junk ids", () => {
    expect(isValidId("../etc/passwd")).toBe(false);
    expect(isValidId("nope")).toBe(false);
    expect(isValidId("2026-06-27T16-40-12-704Z/../x")).toBe(false);
    expect(isValidId("")).toBe(false);
  });
});

describe("buildRecord", () => {
  const date = new Date("2026-06-27T16:40:12.704Z");

  it("lifts total/verdict to top level and applies defaults", () => {
    const rec = buildRecord({ scorecard: card, date });
    expect(rec.version).toBe(1);
    expect(rec.id).toBe("2026-06-27T16-40-12-704Z");
    expect(rec.createdAt).toBe("2026-06-27T16:40:12.704Z");
    expect(rec.total).toBe(75);
    expect(rec.verdict).toBe("Verdict: demo-ready.");
    expect(rec.transcript).toEqual([]);
    expect(rec.audioExt).toBeNull();
  });

  it("keeps transcript and audioExt when provided", () => {
    const rec = buildRecord({
      scorecard: card,
      transcript: [{ role: "founder", text: "hi" }],
      audioExt: "webm",
      date,
    });
    expect(rec.transcript).toHaveLength(1);
    expect(rec.audioExt).toBe("webm");
  });

  it("throws without a scorecard", () => {
    // @ts-expect-error intentionally missing scorecard
    expect(() => buildRecord({ date })).toThrow();
  });
});

describe("write / read round-trip", () => {
  it("round-trips a scorecard-only record (no transcript, no audio)", async () => {
    const rec = buildRecord({ scorecard: card, date: new Date() });
    await writeRecord(dir, rec);
    const back = await readRecord(dir, rec.id);
    expect(back).toEqual(rec);
    expect(audioPath(dir, rec)).toBeNull();
  });

  it("writes the audio file only when audio bytes are supplied", async () => {
    const rec = buildRecord({ scorecard: card, audioExt: "webm", date: new Date() });
    await writeRecord(dir, rec, new Uint8Array([1, 2, 3]));
    const p = audioPath(dir, rec);
    expect(p).not.toBeNull();
    expect(existsSync(p!)).toBe(true);
  });

  it("returns null for a missing id", async () => {
    expect(await readRecord(dir, "2099-01-01T00-00-00-000Z")).toBeNull();
  });
});

describe("listRecords", () => {
  it("returns lightweight items newest-first and skips corrupt files", async () => {
    const older = buildRecord({ scorecard: { ...card, total: 40 }, date: new Date("2026-06-27T10:00:00.000Z") });
    const newer = buildRecord({ scorecard: { ...card, total: 80 }, date: new Date("2026-06-27T12:00:00.000Z") });
    await writeRecord(dir, older);
    await writeRecord(dir, newer);
    writeFileSync(join(dir, "garbage.json"), "{ not json");

    const list = await listRecords(dir);
    expect(list.map((i) => i.id)).toEqual([newer.id, older.id]);
    expect(list[0]).toEqual({ id: newer.id, createdAt: newer.createdAt, total: 80, verdict: newer.verdict });
    // @ts-expect-error list items are lightweight — no scorecard
    expect(list[0].scorecard).toBeUndefined();
  });

  it("returns [] for an empty / missing dir", async () => {
    expect(await listRecords(join(dir, "nope"))).toEqual([]);
  });
});

describe("toTrend", () => {
  it("orders points oldest -> newest", () => {
    const items = [
      { id: "c", createdAt: "2026-06-27T12:00:00.000Z", total: 80, verdict: "v" },
      { id: "a", createdAt: "2026-06-27T10:00:00.000Z", total: 40, verdict: "v" },
      { id: "b", createdAt: "2026-06-27T11:00:00.000Z", total: 61, verdict: "v" },
    ];
    expect(toTrend(items).map((p) => p.total)).toEqual([40, 61, 80]);
  });

  it("handles the empty case", () => {
    expect(toTrend([])).toEqual([]);
  });
});
