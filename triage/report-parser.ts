// Extrai as falhas do relatório JSON do Playwright (reporter "json").
import { readFile } from "node:fs/promises";

/** Uma tentativa (execução original ou retry) de um teste. */
export interface Attempt {
  retry: number;
  status: string;
  durationMs: number;
  error?: string;
}

/** Resultado final de um teste nesta execução (passados incluídos), usado no histórico. */
export interface TestRun {
  key: string;
  status: "passed" | "failed" | "flaky" | "skipped";
  durationMs: number;
  error?: string;
}

/** Tudo o que sabemos de um teste que falhou pelo menos uma vez. */
export interface FailedTest {
  id: string;
  /** Identificador estável entre execuções (ficheiro + título), chave do histórico. */
  key: string;
  title: string;
  file: string;
  project: string;
  /** "unexpected" = falhou sempre; "flaky" = falhou e depois passou num retry. */
  outcome: "unexpected" | "flaky";
  retries: number;
  attempts: Attempt[];
  errorMessage: string;
  stackExcerpt: string;
}

// Subconjunto do formato do reporter JSON que usamos.
interface JsonError { message?: string; stack?: string }
interface JsonResult { retry: number; status: string; duration: number; errors?: JsonError[]; error?: JsonError }
interface JsonTest { projectName: string; status: string; results: JsonResult[] }
interface JsonSpec { title: string; file: string; line: number; tests: JsonTest[] }
interface JsonSuite { title: string; file?: string; specs?: JsonSpec[]; suites?: JsonSuite[] }
interface JsonReport { suites: JsonSuite[]; stats?: { startTime?: string } }

const ANSI = /\u001b\[[0-9;]*m/g;
const clean = (s = "") => s.replace(ANSI, "").trim();

/** Primeiras linhas da mensagem e só as frames "at ..." do nosso código (sem node_modules). */
function summarizeStack(stack: string, maxFrames = 4): string {
  const frames = clean(stack)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at ") && !l.includes("node_modules"));
  return frames.slice(0, maxFrames).join("\n");
}

function firstError(r: JsonResult): JsonError | undefined {
  return r.error ?? r.errors?.[0];
}

const FINAL_STATUS: Record<string, TestRun["status"]> = {
  expected: "passed",
  unexpected: "failed",
  flaky: "flaky",
  skipped: "skipped",
};

function collect(suite: JsonSuite, titlePath: string[], out: FailedTest[], runs: TestRun[]) {
  const path = suite.title && !suite.title.endsWith(".ts") ? [...titlePath, suite.title] : titlePath;

  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const title = [...path, spec.title].join(" › ");
      const key = `${spec.file} › ${title} › ${t.projectName}`;
      const lastResult = t.results.at(-1);
      const lastError = lastResult ? firstError(lastResult) : undefined;
      runs.push({
        key,
        status: FINAL_STATUS[t.status] ?? "failed",
        durationMs: t.results.reduce((sum, r) => sum + r.duration, 0),
        error: lastError ? clean(lastError.message).split("\n")[0] : undefined,
      });

      if (t.status !== "unexpected" && t.status !== "flaky") continue;

      const failed = t.results.filter((r) => r.status !== "passed" && r.status !== "skipped");
      const last = failed.at(-1);
      const err = last ? firstError(last) : undefined;

      out.push({
        id: `${spec.file}:${spec.line} › ${t.projectName}`,
        key,
        title,
        file: `${spec.file}:${spec.line}`,
        project: t.projectName,
        outcome: t.status,
        retries: t.results.length - 1,
        attempts: t.results.map((r) => ({
          retry: r.retry,
          status: r.status,
          durationMs: r.duration,
          error: firstError(r) ? clean(firstError(r)!.message).split("\n")[0] : undefined,
        })),
        errorMessage: clean(err?.message).slice(0, 1500),
        stackExcerpt: summarizeStack(err?.stack ?? ""),
      });
    }
  }
  for (const child of suite.suites ?? []) collect(child, path, out, runs);
}

/** `failures`: testes a classificar. `runs`: todos os testes, para o histórico. */
export async function readReport(
  reportPath: string,
): Promise<{ failures: FailedTest[]; runs: TestRun[]; startTime?: string }> {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as JsonReport;
  const failures: FailedTest[] = [];
  const runs: TestRun[] = [];
  for (const suite of report.suites) collect(suite, [], failures, runs);
  return { failures, runs, startTime: report.stats?.startTime };
}
