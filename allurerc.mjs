// Configuração do Allure 3. Docs: https://allurereport.org/docs/v3/configure/
import { defineConfig } from "allure";

// Uma categoria por veredicto do Jev. A triagem escreve o label `jev_verdict`
// em cada resultado falhado (triage/allure.ts); o Allure agrupa por esse label.
const jevCategory = (name, verdict) => ({
  name,
  id: `jev-${verdict}`,
  matchers: { statuses: ["failed", "broken"], labels: { jev_verdict: `^${verdict}$` } },
  expand: true,
});

// Uma configuração para as duas suites: SUITE=local (default) ou SUITE=saucedemo.
const suite = process.env.SUITE ?? "local";

export default defineConfig({
  name: `Playwright + Jev · ${suite}`,
  output: `./reports/${suite}/allure-report`,
  // Histórico do Allure (trends, deteção de flaky). No CI é descarregado do GitHub Pages.
  historyPath: `./.history/${suite}/allure.jsonl`,
  historyLimit: 20,
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
