// Extracts the failures from the Playwright JSON report ("json" reporter).
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

/** One attempt (original run or retry) of a test. */
export interface Attempt {
  retry: number;
  status: string;
  durationMs: number;
  error?: string;
}

/** Final result of a test in this run (passed ones included), used for history. */
export interface TestRun {
  key: string;
  status: "passed" | "failed" | "flaky" | "skipped";
  durationMs: number;
  error?: string;
}

/** Everything we know about a test that failed at least once. */
export interface FailedTest {
  id: string;
  /** Stable id across runs (file + title), used as the history key. */
  key: string;
  title: string;
  file: string;
  project: string;
  /** "unexpected" = always failed; "flaky" = failed and then passed on a retry. */
  outcome: "unexpected" | "flaky";
  retries: number;
  attempts: Attempt[];
  errorMessage: string;
  stackExcerpt: string;
  /** Test code (without comments), with the failing line marked with ">>". */
  sourceExcerpt: string;
  /** The page's accessibility tree at the time of failure (Playwright's error-context attachment). */
  pageSnapshot?: string;
  /** `data-test` attributes on the page when it failed (page-test-ids attachment, if the suite collects it). */
  pageTestIds?: string[];
}

// The subset of the JSON reporter format that we use.
interface JsonError { message?: string; stack?: string; location?: { file: string; line: number } }
interface JsonAttachment { name: string; contentType?: string; path?: string; body?: string }
interface JsonResult {
  retry: number;
  status: string;
  duration: number;
  errors?: JsonError[];
  error?: JsonError;
  attachments?: JsonAttachment[];
}
interface JsonTest { projectName: string; status: string; results: JsonResult[] }
interface JsonSpec { title: string; file: string; line: number; tests: JsonTest[] }
interface JsonSuite { title: string; file?: string; specs?: JsonSpec[]; suites?: JsonSuite[] }
interface JsonReport { suites: JsonSuite[]; stats?: { startTime?: string }; config?: { rootDir?: string } }

const ANSI = /\u001b\[[0-9;]*m/g;
const clean = (s = "") => s.replace(ANSI, "").trim();

/** Only the "at ..." frames from our own code (no node_modules). */
function summarizeStack(stack: string, maxFrames = 4): string {
  const frames = clean(stack)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at ") && !l.includes("node_modules"));
  return frames.slice(0, maxFrames).join("\n");
}

/**
 * Test body from the `test(...)` line up to the `});` that closes it (at most `maxLines`).
 * Comments are removed on purpose: in our tests they say "BUG" or "TEST DEFECT", and
 * sending them to Jev would give it the answer. Jev must judge from the code alone.
 */
async function testSource(file: string, startLine: number, failLine?: number, maxLines = 40): Promise<string> {
  let lines: string[];
  try {
    lines = (await readFile(file, "utf8")).split("\n");
  } catch {
    return "";
  }
  const out: string[] = [];
  for (let i = startLine - 1; i < lines.length && out.length < maxLines; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line)) continue;
    out.push(`${i + 1 === failLine ? ">>" : "  "} ${line.replace(/\s+\/\/.*$/, "")}`);
    if (i > startLine - 1 && /^\}\);?\s*$/.test(line)) break;
  }
  return out.join("\n");
}

/** The "# Page snapshot" section of error-context.md, without refs, capped at `max` characters. */
async function pageSnapshot(r: JsonResult, max = 3000): Promise<string | undefined> {
  const path = r.attachments?.find((a) => a.name === "error-context")?.path;
  if (!path) return undefined;
  try {
    const md = await readFile(path, "utf8");
    const yaml = md.split("# Page snapshot")[1]?.replace(/```(yaml)?/g, "").trim();
    return yaml?.replace(/ \[(ref|cursor)=[^\]]+\]/g, "").slice(0, max);
  } catch {
    return undefined;
  }
}

async function pageTestIds(r: JsonResult): Promise<string[] | undefined> {
  const a = r.attachments?.find((x) => x.name === "page-test-ids");
  if (!a) return undefined;
  try {
    const raw = a.body ? Buffer.from(a.body, "base64").toString("utf8") : await readFile(a.path!, "utf8");
    return JSON.parse(raw) as string[];
  } catch {
    return undefined;
  }
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

async function collect(
  suite: JsonSuite,
  titlePath: string[],
  out: FailedTest[],
  runs: TestRun[],
  rootDir: string,
) {
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
        sourceExcerpt: await testSource(
          isAbsolute(spec.file) ? spec.file : join(rootDir, spec.file),
          spec.line,
          err?.location?.line,
        ),
        pageSnapshot: last ? await pageSnapshot(last) : undefined,
        pageTestIds: last ? await pageTestIds(last) : undefined,
      });
    }
  }
  for (const child of suite.suites ?? []) await collect(child, path, out, runs, rootDir);
}

/** `failures`: tests to classify. `runs`: every test, for the history. */
export async function readReport(
  reportPath: string,
): Promise<{ failures: FailedTest[]; runs: TestRun[]; startTime?: string }> {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as JsonReport;
  const failures: FailedTest[] = [];
  const runs: TestRun[] = [];
  const rootDir = report.config?.rootDir ?? process.cwd();
  for (const suite of report.suites) await collect(suite, [], failures, runs, rootDir);
  return { failures, runs, startTime: report.stats?.startTime };
}
