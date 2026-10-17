// Acrescenta a análise do Jev aos resultados Allure (allure-results/*-result.json).
// Formato: https://allurereport.org/docs/how-it-works-test-result-file/
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { TriageItem } from "./markdown.ts";

interface Label { name: string; value: string }
interface AllureResult {
  uuid: string;
  fullName?: string;
  status?: string;
  description?: string;
  labels?: Label[];
  attachments?: { name: string; source: string; type: string }[];
}

const JEV_LABELS = new Set(["jev_verdict", "jev_confidence", "jev_test_code_defect", "jev_slowness"]);
const JEV_MARK = "<!-- jev -->";

/** Devolve quantos resultados foram enriquecidos. */
export async function enrichAllureResults(
  dir: string,
  items: TriageItem[],
  thresholds: { testDefectThreshold: number; slownessThreshold: number },
): Promise<number> {
  if (!existsSync(dir)) return 0;
  const byKey = new Map(items.map((i) => [i.test.key, i]));
  let count = 0;

  for (const file of await readdir(dir)) {
    if (!file.endsWith("-result.json")) continue;
    const path = join(dir, file);
    const result = JSON.parse(await readFile(path, "utf8")) as AllureResult;
    if (result.status !== "failed" && result.status !== "broken") continue;

    // O allure-playwright usa fullName = "<ficheiro> › <título>" e parentSuite = projeto,
    // o que corresponde à chave que o report-parser gera: "<ficheiro> › <título> › <projeto>".
    const project = result.labels?.find((l) => l.name === "parentSuite")?.value;
    const item = byKey.get(`${result.fullName} › ${project}`);
    if (!item) continue;
    const { verdict, suggested, confidence, probabilities, testCodeDefect, slowness, model, state, error } =
      item.result;

    // Labels: usados pelas categorias em allurerc.mjs e visíveis/filtráveis no relatório.
    // Remover os antigos torna o passo idempotente (pode correr várias vezes).
    result.labels = (result.labels ?? []).filter(
      (l) => !JEV_LABELS.has(l.name) && !(l.name === "tag" && l.value.startsWith("jev:")),
    );
    result.labels.push({ name: "jev_verdict", value: verdict }, { name: "tag", value: `jev:${verdict}` });
    if (confidence !== undefined) result.labels.push({ name: "jev_confidence", value: confidence.toFixed(2) });
    // Respostas das perguntas noul: valor bruto como label, e uma tag quando passam o limiar.
    if (testCodeDefect !== undefined) {
      result.labels.push({ name: "jev_test_code_defect", value: testCodeDefect.toFixed(2) });
      if (testCodeDefect >= thresholds.testDefectThreshold) result.labels.push({ name: "tag", value: "jev:test-code-defect" });
    }
    if (slowness !== undefined) {
      result.labels.push({ name: "jev_slowness", value: slowness.toFixed(2) });
      if (slowness >= thresholds.slownessThreshold) result.labels.push({ name: "tag", value: "jev:slow" });
    }

    // Descrição: resumo legível no topo do teste.
    const pct = (n?: number) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);
    const summary = [
      JEV_MARK,
      `**Triagem Jev:** \`${verdict}\`` + (suggested ? ` (sugestão: ${suggested}, confiança ${pct(confidence)})` : ""),
      probabilities
        ? `bug ${pct(probabilities.bug)} · flaky ${pct(probabilities.flaky)} · environment ${pct(probabilities.environment)}` +
          `\n\nDefeito no código do teste? ${pct(testCodeDefect)} · Lentidão? ${pct(slowness)}`
        : error
          ? `Erro ao chamar o Jev: ${error}`
          : "Sem TYPESAFE_API_KEY: não classificado.",
      JEV_MARK,
    ].join("\n\n");
    const previous = (result.description ?? "").split(JEV_MARK).filter((_, i) => i % 2 === 0).join("").trim();
    result.description = previous ? `${summary}\n\n${previous}` : summary;

    // Anexo: exatamente o que o Jev recebeu (state) e devolveu. Útil para aprender e depurar.
    const source = `${randomUUID()}-attachment.json`;
    await writeFile(
      join(dir, source),
      JSON.stringify(
        { verdict, suggested, confidence, probabilities, testCodeDefect, slowness, model, error, state },
        null,
        2,
      ),
    );
    result.attachments = (result.attachments ?? []).filter((a) => a.name !== "Jev triage");
    result.attachments.push({ name: "Jev triage", source, type: "application/json" });

    await writeFile(path, JSON.stringify(result));
    count++;
  }
  return count;
}
