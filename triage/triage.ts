/**
 * Triage of the failures from the latest Playwright run.
 *
 *   1. reads reports/<suite>/results.json and the history of previous runs
 *   2. classifies each failure with Jev (or `unclassified` without a key), including history in the state
 *   3. writes reports/<suite>/triage/triage-report.md, index.html (GitHub Pages) and triage-results.json (+ GITHUB_STEP_SUMMARY),
 *      adds the analysis to the Allure results (labels, description and attachment)
 *      and updates the history (also copied to reports/<suite>/triage/history.json, published on Pages)
 *   4. exit code 1 only if there are failures with a verdict in TRIAGE_FAIL_ON (default: bug)
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { readReport } from "./report-parser.ts";
import { appendRun, loadHistory, saveHistory } from "./history.ts";
import { createJevClassifier } from "./jev-classifier.ts";
import { renderMarkdown, type TriageItem } from "./markdown.ts";
import { renderHtml } from "./html.ts";
import { enrichAllureResults } from "./allure.ts";

if (!existsSync(config.reportPath)) {
  console.error(`Report not found: ${config.reportPath}. Run "npm test" first.`);
  process.exit(2);
}

const { failures, runs, startTime } = await readReport(config.reportPath);
const history = await loadHistory(config.historyPath);
console.log(`Failures found: ${failures.length} · tests with history: ${Object.keys(history.tests).length}`);

// With a key → Jev. Without a key → fallback, no network calls.
const classify = config.apiKey
  ? createJevClassifier(config.apiKey, config)
  : async () => ({ verdict: "unclassified" as const });
if (!config.apiKey) console.log("TYPESAFE_API_KEY not set → fallback mode (unclassified).");

// Parallel requests, at most `concurrency` at a time.
const items: TriageItem[] = new Array(failures.length);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(config.concurrency, failures.length) }, async () => {
    while (next < failures.length) {
      const i = next++;
      const past = history.tests[failures[i].key] ?? [];
      items[i] = { test: failures[i], history: past, result: await classify(failures[i], past) };
    }
  }),
);

const blocking = items.filter((i) => config.failOn.includes(i.result.verdict));
const markdown = renderMarkdown(items, {
  suite: config.suite,
  usedJev: Boolean(config.apiKey),
  threshold: config.confidenceThreshold,
  failOn: config.failOn,
  blocking,
});

await mkdir(config.outputDir, { recursive: true });

const enriched = await enrichAllureResults(config.allureResultsDir, items, config);
if (enriched > 0) console.log(`Allure: ${enriched} result(s) enriched with Jev's analysis.`);

// History is only updated after classifying: Jev only sees previous runs.
// Running triage twice on the same report doesn't duplicate entries: the id is the same.
const runId = config.runId ?? `local-${startTime ?? new Date().toISOString()}`;
const updated = appendRun(history, runs, runId, config.historySize);
await saveHistory(config.historyPath, updated);
await saveHistory(join(config.outputDir, "history.json"), updated);

await writeFile(join(config.outputDir, "triage-report.md"), markdown);
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;
await writeFile(
  join(config.outputDir, "index.html"),
  renderHtml(items, {
    suite: config.suite,
    // On Pages, "local" is at the root and the other suites at /<suite>/.
    nav:
      config.suite === "local"
        ? [{ label: "saucedemo", href: "saucedemo/" }]
        : [{ label: "local", href: "../" }],
    allureHref: config.suite === "local" ? "allure/index.html" : "../allure/index.html",
    usedJev: Boolean(config.apiKey),
    threshold: config.confidenceThreshold,
    failOn: config.failOn,
    blocking,
    runUrl,
  }),
);
await writeFile(
  join(config.outputDir, "triage-results.json"),
  JSON.stringify(
    items.map(({ test, result }) => ({ title: test.title, file: test.file, attempts: test.attempts, ...result })),
    null,
    2,
  ),
);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);

for (const item of items) {
  const { test, result } = item;
  const extra =
    result.confidence !== undefined
      ? ` (confidence ${result.confidence.toFixed(2)} · test defect ${result.testCodeDefect?.toFixed(2)} · slowness ${result.slowness?.toFixed(2)})`
      : "";
  const line = `[${result.verdict}] ${test.title}${extra}`;
  console.log(line);
  // GitHub Actions annotations: error for blocking failures, warning for the rest.
  if (process.env.GITHUB_ACTIONS) {
    const level = blocking.includes(item) ? "error" : "warning";
    console.log(`::${level} title=Triage: ${result.verdict}::${test.title}`);
  }
}

console.log(`\nReport: ${join(config.outputDir, "triage-report.md")}`);
if (blocking.length > 0) {
  console.error(`${blocking.length} blocking failure(s) (${config.failOn.join(", ")}).`);
  process.exit(1);
}
