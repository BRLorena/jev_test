// Gera o relatório Markdown da triagem.
import type { Verdict } from "./config.ts";
import type { Classification } from "./jev-classifier.ts";
import type { FailedTest } from "./report-parser.ts";

export interface TriageItem {
  test: FailedTest;
  result: Classification;
}

const ICON: Record<Verdict, string> = {
  bug: "🐞",
  flaky: "🎲",
  environment: "🔌",
  needs_review: "👀",
  unclassified: "❔",
};

const pct = (n?: number) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderMarkdown(
  items: TriageItem[],
  opts: { usedJev: boolean; threshold: number; failOn: Verdict[]; blocking: TriageItem[] },
): string {
  const lines: string[] = ["## 🧪 Triagem de falhas Playwright (Jev)", ""];

  if (!opts.usedJev) {
    lines.push(
      "> ℹ️ `TYPESAFE_API_KEY` não definida: a triagem correu em modo **fallback** e não chamou a API. Todas as falhas ficam `unclassified`.",
      "",
    );
  }

  if (items.length === 0) {
    lines.push("✅ Nenhum teste falhou.");
    return lines.join("\n") + "\n";
  }

  const counts = new Map<Verdict, number>();
  for (const i of items) counts.set(i.result.verdict, (counts.get(i.result.verdict) ?? 0) + 1);
  lines.push(
    `**${items.length}** falha(s): ` +
      [...counts].map(([v, n]) => `${ICON[v]} ${v}: ${n}`).join(" · "),
    "",
    `Limiar de confiança: **${opts.threshold}** · O job falha com: \`${opts.failOn.join(", ")}\``,
    "",
    "| Veredicto | Teste | Sugestão do Jev | Confiança | bug | flaky | environment | Tentativas |",
    "|---|---|---|---|---|---|---|---|",
  );

  for (const { test, result } of items) {
    const p = result.probabilities;
    lines.push(
      `| ${ICON[result.verdict]} \`${result.verdict}\` | ${cell(test.title)}<br><sub>${cell(test.file)}</sub> | ${result.suggested ?? "–"} | ${pct(result.confidence)} | ${pct(p?.bug)} | ${pct(p?.flaky)} | ${pct(p?.environment)} | ${test.attempts.map((a) => a.status).join(" → ")} |`,
    );
  }

  lines.push("", "<details><summary>Detalhes dos erros</summary>", "");
  for (const { test, result } of items) {
    lines.push(`#### ${cell(test.title)}`, "", "```", test.errorMessage.split("\n").slice(0, 8).join("\n"), "```");
    if (result.error) lines.push(`_Erro ao chamar o Jev:_ \`${cell(result.error)}\``);
    if (result.model) lines.push(`<sub>modelo: ${result.model}</sub>`);
    lines.push("");
  }
  lines.push("</details>", "");

  if (opts.blocking.length > 0) {
    lines.push(`❌ **${opts.blocking.length}** falha(s) bloqueiam o job (${opts.failOn.join(", ")}).`);
  } else {
    lines.push("✅ Nenhuma falha bloqueante: as restantes ficam como aviso.");
  }
  return lines.join("\n") + "\n";
}
