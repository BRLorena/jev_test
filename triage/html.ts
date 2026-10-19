// Builds the triage HTML page published to GitHub Pages (index.html).
import type { Verdict } from "./config.ts";
import type { TriageItem } from "./markdown.ts";
import { historyStrip } from "./history.ts";

const LABEL: Record<Verdict, string> = {
  bug: "🐞 bug",
  flaky: "🎲 flaky",
  environment: "🔌 environment",
  needs_review: "👀 needs_review",
  unclassified: "❔ unclassified",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (n?: number) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);

function bar(p?: number) {
  if (p === undefined) return `<td class="num">–</td>`;
  return `<td class="num"><span class="bar" style="--w:${Math.round(p * 100)}%"></span>${pct(p)}</td>`;
}

export function renderHtml(
  items: TriageItem[],
  opts: {
    suite: string;
    usedJev: boolean;
    threshold: number;
    failOn: Verdict[];
    blocking: TriageItem[];
    runUrl?: string;
    /** Links to the other suites published on Pages. */
    nav: { label: string; href: string }[];
    /** There is a single Allure report for both suites, published at /allure/. */
    allureHref: string;
  },
): string {
  const rows = items
    .map(({ test, result, history }) => {
      const p = result.probabilities;
      return `<tr>
  <td><span class="tag ${result.verdict}">${LABEL[result.verdict]}</span></td>
  <td>${esc(test.title)}<br><small>${esc(test.file)}</small></td>
  <td>${result.suggested ?? "–"}</td>
  <td class="num">${pct(result.confidence)}</td>
  ${bar(p?.bug)}${bar(p?.flaky)}${bar(p?.environment)}${bar(result.testCodeDefect)}${bar(result.slowness)}
  <td title="previous runs, most recent on the right">${historyStrip(history)}</td>
</tr>`;
    })
    .join("\n");

  const details = items
    .map(
      ({ test, result }) => `<details><summary>${esc(test.title)}</summary>
<pre>${esc(test.errorMessage.split("\n").slice(0, 12).join("\n"))}</pre>
${result.error ? `<p class="err">Error calling Jev: ${esc(result.error)}</p>` : ""}
${result.model ? `<small>model: ${esc(result.model)}</small>` : ""}
</details>`,
    )
    .join("\n");

  const status =
    opts.blocking.length > 0
      ? `<p class="status fail">❌ ${opts.blocking.length} failure(s) block the job (${opts.failOn.join(", ")}).</p>`
      : `<p class="status ok">✅ No blocking failures.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jev Triage · ${esc(opts.suite)}</title>
<style>
  :root { --bg:#fff; --fg:#1b1f24; --muted:#59636e; --line:#d1d9e0; --card:#f6f8fa; --accent:#0969da;
          --bug:#cf222e; --flaky:#9a6700; --env:#8250df; --review:#0969da; --none:#59636e; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d1117; --fg:#e6edf3; --muted:#9198a1; --line:#3d444d; --card:#151b23; --accent:#4493f8;
            --bug:#ff7b72; --flaky:#d29922; --env:#ab7df8; --review:#4493f8; --none:#9198a1; }
  }
  body { background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, sans-serif; margin:0; padding:24px 16px; }
  main { max-width:1100px; margin:0 auto; }
  a { color:var(--accent); }
  small { color:var(--muted); }
  .note { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:8px 12px; }
  .wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; margin:16px 0; }
  th, td { border-bottom:1px solid var(--line); padding:8px; text-align:left; vertical-align:top; }
  th { font-size:13px; color:var(--muted); }
  .num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .bar { display:inline-block; width:40px; height:6px; margin-right:6px; vertical-align:middle; border-radius:3px;
         background:linear-gradient(90deg, var(--accent) var(--w), var(--line) var(--w)); }
  .tag { font-weight:600; white-space:nowrap; }
  .bug { color:var(--bug); } .flaky { color:var(--flaky); } .environment { color:var(--env); }
  .needs_review { color:var(--review); } .unclassified { color:var(--none); }
  .status.fail { color:var(--bug); font-weight:600; } .status.ok { font-weight:600; }
  pre { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:12px; overflow-x:auto; font-size:13px; }
  details { margin:8px 0; } summary { cursor:pointer; }
  .err { color:var(--bug); }
  .suites { font-size:13px; color:var(--muted); }
</style>
</head>
<body>
<main>
<nav class="suites">Suites: ${[{ label: opts.suite, href: "" }, ...opts.nav]
    .map((n) => (n.href ? `<a href="${esc(n.href)}">${esc(n.label)}</a>` : `<b>${esc(n.label)}</b>`))
    .join(" · ")}</nav>
<h1>🧪 Playwright failure triage (Jev) · ${esc(opts.suite)}</h1>
<p>
  <a href="${esc(opts.allureHref)}">Allure report (all suites) →</a>
  · <a href="playwright-report/index.html">Playwright HTML report →</a>
  ${opts.runUrl ? ` · <a href="${esc(opts.runUrl)}">GitHub Actions run</a>` : ""}
  · <small>generated at ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC</small>
</p>
${opts.usedJev ? "" : `<p class="note">ℹ️ No <code>TYPESAFE_API_KEY</code>: fallback mode, every failure is <code>unclassified</code>.</p>`}
${
  items.length === 0
    ? "<p>✅ No tests failed.</p>"
    : `<p>${items.length} failure(s) · confidence threshold <b>${opts.threshold}</b> · the job fails on <code>${opts.failOn.join(", ")}</code></p>
<p><small><b>Test defect?</b> and <b>Slowness?</b> are <code>noul</code> questions: the probability of "yes". A <code>bug</code> with a high test defect score becomes <code>needs_review</code>.</small></p>
<div class="wrap"><table>
<thead><tr><th>Verdict</th><th>Test</th><th>Jev suggestion</th><th class="num">Confidence</th>
<th class="num">bug</th><th class="num">flaky</th><th class="num">environment</th><th class="num">Test defect?</th><th class="num">Slowness?</th><th>History</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
${status}
<h2>Error details</h2>
${details}`
}
</main>
</body>
</html>
`;
}
