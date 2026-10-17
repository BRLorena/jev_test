// Histórico de execuções por teste, para o Jev distinguir "falha sempre" de "falha às vezes".
// Formato simples, em JSON: { version, tests: { <key>: [entrada mais antiga, ..., mais recente] } }
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

/** Ficheiro em falta ou inválido → histórico vazio (primeira execução). */
export async function loadHistory(path: string): Promise<History> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as History;
    if (data?.version === 1 && data.tests) return data;
  } catch {}
  return { version: 1, tests: {} };
}

/** Acrescenta os resultados desta execução e guarda apenas as últimas `size` por teste. */
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

/** Sequência curta para os relatórios, ex.: "✅✅❌✅". */
export function historyStrip(entries: HistoryEntry[], max = 10): string {
  const icon = { passed: "✅", failed: "❌", flaky: "🎲", skipped: "⏭️" } as const;
  return entries.slice(-max).map((e) => icon[e.status]).join("") || "–";
}
