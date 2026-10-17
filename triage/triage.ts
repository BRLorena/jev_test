/**
 * Triagem das falhas da última execução do Playwright.
 *
 *   1. lê test-results/results.json
 *   2. classifica cada falha com o Jev (ou `unclassified` sem chave)
 *   3. escreve triage-output/triage-report.md + triage-results.json (+ GITHUB_STEP_SUMMARY)
 *   4. exit code 1 só se houver falhas com veredicto em TRIAGE_FAIL_ON (default: bug)
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { readFailedTests } from "./report-parser.ts";
import { createJevClassifier } from "./jev-classifier.ts";
import { renderMarkdown, type TriageItem } from "./markdown.ts";

if (!existsSync(config.reportPath)) {
  console.error(`Relatório não encontrado: ${config.reportPath}. Corre primeiro "npm test".`);
  process.exit(2);
}

const failures = await readFailedTests(config.reportPath);
console.log(`Falhas encontradas: ${failures.length}`);

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
      items[i] = { test: failures[i], result: await classify(failures[i]) };
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
await writeFile(join(config.outputDir, "triage-report.md"), markdown);
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
