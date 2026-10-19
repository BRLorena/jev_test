// Builds the triage Markdown report.
import type { Verdict } from "./config.ts";
import type { Classification } from "./jev-classifier.ts";
import type { FailedTest } from "./report-parser.ts";
import { historyStrip, type HistoryEntry } from "./history.ts";

export interface TriageItem {
  test: FailedTest;
  /** Previous runs of this test (most recent last). */
  history: HistoryEntry[];
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
  opts: { suite: string; usedJev: boolean; threshold: number; failOn: Verdict[]; blocking: TriageItem[] },
): string {
  const lines: string[] = [`## 🧪 Playwright failure triage (Jev) · suite \`${opts.suite}\``, ""];

  if (!opts.usedJev) {
    lines.push(
      "> ℹ️ `TYPESAFE_API_KEY` not set: triage ran in **fallback** mode and did not call the API. Every failure is `unclassified`.",
      "",
    );
  }

  if (items.length === 0) {
    lines.push("✅ No tests failed.");
    return lines.join("\n") + "\n";
  }

  const counts = new Map<Verdict, number>();
  for (const i of items) counts.set(i.result.verdict, (counts.get(i.result.verdict) ?? 0) + 1);
  lines.push(
    `**${items.length}** failure(s): ` +
      [...counts].map(([v, n]) => `${ICON[v]} ${v}: ${n}`).join(" · "),
    "",
    `Confidence threshold: **${opts.threshold}** · The job fails on: \`${opts.failOn.join(", ")}\``,
    "",
    "| Verdict | Test | Jev suggestion | Confidence | bug | flaky | environment | Test defect? | Slowness? | History |",
    "|---|---|---|---|---|---|---|---|---|---|",
  );

  for (const { test, result, history } of items) {
    const p = result.probabilities;
    lines.push(
      `| ${ICON[result.verdict]} \`${result.verdict}\` | ${cell(test.title)}<br><sub>${cell(test.file)}</sub> | ${result.suggested ?? "–"} | ${pct(result.confidence)} | ${pct(p?.bug)} | ${pct(p?.flaky)} | ${pct(p?.environment)} | ${pct(result.testCodeDefect)} | ${pct(result.slowness)} | ${historyStrip(history)} |`,
    );
  }

  lines.push("", "<details><summary>Error details</summary>", "");
  for (const { test, result } of items) {
    lines.push(`#### ${cell(test.title)}`, "", "```", test.errorMessage.split("\n").slice(0, 8).join("\n"), "```");
    if (result.error) lines.push(`_Error calling Jev:_ \`${cell(result.error)}\``);
    if (result.model) lines.push(`<sub>model: ${result.model}</sub>`);
    lines.push("");
  }
  lines.push("</details>", "");

  if (opts.blocking.length > 0) {
    lines.push(`❌ **${opts.blocking.length}** failure(s) block the job (${opts.failOn.join(", ")}).`);
  } else {
    lines.push("✅ No blocking failures: the rest are reported as warnings.");
  }
  return lines.join("\n") + "\n";
}
