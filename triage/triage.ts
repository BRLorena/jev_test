/**
 * Triagem das falhas da última execução do Playwright.
 *
 *   1. lê test-results/results.json e o histórico de execuções anteriores
 *   2. classifica cada falha com o Jev (ou `unclassified` sem chave), incluindo o histórico no state
 *   3. escreve triage-output/triage-report.md, index.html (GitHub Pages) e triage-results.json (+ GITHUB_STEP_SUMMARY)
 *      e atualiza o histórico (também copiado para triage-output/history.json, publicado no Pages)
 *   4. exit code 1 só se houver falhas com veredicto em TRIAGE_FAIL_ON (default: bug)
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

if (!existsSync(config.reportPath)) {
  console.error(`Relatório não encontrado: ${config.reportPath}. Corre primeiro "npm test".`);
  process.exit(2);
}

const { failures, runs } = await readReport(config.reportPath);
const history = await loadHistory(config.historyPath);
console.log(`Falhas encontradas: ${failures.length} · testes com histórico: ${Object.keys(history.tests).length}`);

// Com chave → Jev. Sem chave → fallback, nenhuma chamada de rede.
const classify = config.apiKey
  ? createJevClassifier(config.apiKey, config.confidenceThreshold)
  : async () => ({ verdict: "unclassified" as const });
if (!config.apiKey) console.log("TYPESAFE_API_KEY não definida → modo fallback (unclassified).");

// Pedidos em paralelo, no máximo `concurrency` de cada vez.
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
  usedJev: Boolean(config.apiKey),
  threshold: config.confidenceThreshold,
  failOn: config.failOn,
  blocking,
});

await mkdir(config.outputDir, { recursive: true });

// O histórico só é atualizado depois de classificar: o Jev vê apenas execuções anteriores.
const updated = appendRun(history, runs, config.runId, config.historySize);
await saveHistory(config.historyPath, updated);
await saveHistory(join(config.outputDir, "history.json"), updated);

await writeFile(join(config.outputDir, "triage-report.md"), markdown);
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;
await writeFile(
  join(config.outputDir, "index.html"),
  renderHtml(items, {
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
  const line = `[${result.verdict}] ${test.title}` + (result.confidence !== undefined ? ` (confiança ${result.confidence.toFixed(2)})` : "");
  console.log(line);
  // Anotações do GitHub Actions: erro para bloqueantes, aviso para o resto.
  if (process.env.GITHUB_ACTIONS) {
    const level = blocking.includes(item) ? "error" : "warning";
    console.log(`::${level} title=Triagem: ${result.verdict}::${test.title}`);
  }
}

console.log(`\nRelatório: ${join(config.outputDir, "triage-report.md")}`);
if (blocking.length > 0) {
  console.error(`${blocking.length} falha(s) bloqueante(s) (${config.failOn.join(", ")}).`);
  process.exit(1);
}
