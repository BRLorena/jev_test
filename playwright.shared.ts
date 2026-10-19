// Config shared by both suites (local and saucedemo).
// Each suite writes everything to reports/<suite>/, so triage, Allure and Pages
// handle both the same way.
import { devices, type PlaywrightTestConfig } from "@playwright/test";

// Loads the local .env, if present (Node >= 21.7, no dotenv).
try {
  process.loadEnvFile();
} catch {}

export function suiteConfig(suite: string): PlaywrightTestConfig {
  const dir = `reports/${suite}`;
  return {
    testDir: `./tests/${suite}`,
    outputDir: `${dir}/test-results`,
    fullyParallel: true,
    // No retries: each test runs once and Jev classifies that single attempt.
    retries: 0,
    reporter: [
      ["list"],
      ["html", { open: "never", outputFolder: `${dir}/playwright-report` }],
      // Triage reads this file.
      ["json", { outputFile: `${dir}/results.json` }],
      // Allure 3 results (one JSON per test); triage adds Jev's analysis to them.
      // The `suite_name` label tells Allure which environment each result belongs to (see allurerc.mjs).
      // We don't use `suite`: Allure already uses that name for the hierarchy (file name).
      ["allure-playwright", { resultsDir: `${dir}/allure-results`, globalLabels: [{ name: "suite_name", value: suite }] }],
    ],
    use: { trace: "retain-on-failure" },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  };
}
