// Per-test run history, so Jev can tell "always fails" from "sometimes fails".
// Simple JSON format: { version, tests: { <key>: [oldest entry, ..., newest] } }
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { TestRun } from "./report-parser.ts";

export interface HistoryEntry {
  run: string;
  date: string;
  status: TestRun["status"];
  durationMs: number;
  error?: string;
}

export interface History {
  version: 1;
  tests: Record<string, HistoryEntry[]>;
}

/** Missing or invalid file → empty history (first run). */
export async function loadHistory(path: string): Promise<History> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as History;
    if (data?.version === 1 && data.tests) return data;
  } catch {}
  return { version: 1, tests: {} };
}

/** Appends this run's results and keeps only the last `size` per test. */
export function appendRun(history: History, runs: TestRun[], runId: string, size: number): History {
  const date = new Date().toISOString();
  const tests = { ...history.tests };
  for (const r of runs) {
    const entries = (tests[r.key] ?? []).filter((e) => e.run !== runId);
    entries.push({ run: runId, date, status: r.status, durationMs: r.durationMs, error: r.error });
    tests[r.key] = entries.slice(-size);
  }
  return { version: 1, tests };
}

export async function saveHistory(path: string, history: History) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(history, null, 2));
}

/** Short sequence for the reports, e.g. "✅✅❌✅". */
export function historyStrip(entries: HistoryEntry[], max = 10): string {
  const icon = { passed: "✅", failed: "❌", flaky: "🎲", skipped: "⏭️" } as const;
  return entries.slice(-max).map((e) => icon[e.status]).join("") || "–";
}
