// Triage configuration, all read from environment variables.

export const CATEGORIES = ["bug", "flaky", "environment"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Final status of each failure in the report. */
export type Verdict = Category | "needs_review" | "unclassified";

function list(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Suite to triage: "local" (app/) or "saucedemo". Each one writes to reports/<suite>/. */
const suite = process.env.SUITE ?? "local";
const reports = `reports/${suite}`;

export const config = {
  suite,
  reportPath: process.env.PLAYWRIGHT_JSON_REPORT ?? `${reports}/results.json`,
  outputDir: process.env.TRIAGE_OUTPUT_DIR ?? `${reports}/triage`,
  /** Allure results to enrich with Jev's analysis. */
  allureResultsDir: process.env.ALLURE_RESULTS_DIR ?? `${reports}/allure-results`,

  /** No key → `unclassified` fallback, no API calls. */
  apiKey: process.env.TYPESAFE_API_KEY?.trim() || undefined,

  /** Below this `confidence` (0–1) the failure becomes `needs_review`. */
  confidenceThreshold: Number(process.env.TRIAGE_CONFIDENCE_THRESHOLD ?? 0.6),

  /** With `bug` and P(test code defect) above this, the failure becomes `needs_review`. */
  testDefectThreshold: Number(process.env.TRIAGE_TEST_DEFECT_THRESHOLD ?? 0.7),
  /** From this value on, P(slowness) shows up as a signal in the reports. */
  slownessThreshold: Number(process.env.TRIAGE_SLOWNESS_THRESHOLD ?? 0.7),

  /** Verdicts that fail the job (e.g. "bug" or "bug,needs_review"). */
  failOn: list(process.env.TRIAGE_FAIL_ON, "bug") as Verdict[],

  /** History of previous runs (in CI it is downloaded from GitHub Pages before triage). */
  historyPath: process.env.TRIAGE_HISTORY_PATH ?? `.history/${suite}/triage.json`,
  /** How many runs to keep per test. */
  historySize: Number(process.env.TRIAGE_HISTORY_SIZE ?? 20),
  /** This run's id in the history (locally: the report's start time). */
  runId: process.env.GITHUB_RUN_ID,

  /** Parallel requests to Jev. */
  concurrency: Number(process.env.TRIAGE_CONCURRENCY ?? 4),
};
