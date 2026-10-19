// Allure 3 configuration. Docs: https://allurereport.org/docs/v3/configure/
//
// A single report for both suites: `npm run allure` merges reports/*/allure-results.
// Each suite is an Allure 3 "environment" (selector at the top of the report), identified
// by the `suite_name` label that allure-playwright adds (playwright.shared.ts).
import { defineConfig } from "allure";

const SUITES = { local: "App local", saucedemo: "Saucedemo" };

// One category per Jev verdict. Triage writes the `jev_verdict` label
// on every failed result (triage/allure.ts); Allure groups by that label.
const jevCategory = (name, verdict) => ({
  name,
  id: `jev-${verdict}`,
  matchers: { statuses: ["failed", "broken"], labels: { jev_verdict: `^${verdict}$` } },
  groupEnvironments: true,
  expand: true,
});

export default defineConfig({
  name: "Playwright + Jev",
  output: "./reports/allure-report",
  // Allure history (trends, flaky detection). In CI it is downloaded from GitHub Pages.
  historyPath: "./.history/allure.jsonl",
  historyLimit: 20,
  environments: Object.fromEntries(
    Object.entries(SUITES).map(([id, name]) => [
      id,
      { name, matcher: ({ labels }) => labels.some((l) => l.name === "suite_name" && l.value === id) },
    ]),
  ),
  categories: {
    rules: [
      jevCategory("🐞 Bug (Jev)", "bug"),
      jevCategory("🎲 Flaky (Jev)", "flaky"),
      jevCategory("🔌 Environment (Jev)", "environment"),
      jevCategory("👀 Needs review (Jev)", "needs_review"),
      jevCategory("❔ Unclassified (no Jev)", "unclassified"),
    ],
  },
});
