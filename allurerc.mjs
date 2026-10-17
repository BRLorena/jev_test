// Configuração do Allure 3. Docs: https://allurereport.org/docs/v3/configure/
//
// Um único relatório para as duas suites: `npm run allure` junta reports/*/allure-results.
// Cada suite é um "environment" do Allure 3 (seletor no topo do relatório), identificado
// pelo label `suite_name` que o allure-playwright acrescenta (playwright.shared.ts).
import { defineConfig } from "allure";

const SUITES = { local: "App local", saucedemo: "Saucedemo" };

// Uma categoria por veredicto do Jev. A triagem escreve o label `jev_verdict`
// em cada resultado falhado (triage/allure.ts); o Allure agrupa por esse label.
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
  // Histórico do Allure (trends, deteção de flaky). No CI é descarregado do GitHub Pages.
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
      jevCategory("❔ Unclassified (sem Jev)", "unclassified"),
    ],
  },
});
