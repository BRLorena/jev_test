// Configuração da triagem, toda lida de variáveis de ambiente.

export const CATEGORIES = ["bug", "flaky", "environment"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Estado final de cada falha no relatório. */
export type Verdict = Category | "needs_review" | "unclassified";

function list(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  reportPath: process.env.PLAYWRIGHT_JSON_REPORT ?? "test-results/results.json",
  outputDir: process.env.TRIAGE_OUTPUT_DIR ?? "triage-output",

  /** Sem chave → fallback `unclassified`, sem chamadas à API. */
  apiKey: process.env.TYPESAFE_API_KEY?.trim() || undefined,

  /** Abaixo deste `confidence` (0–1) a falha fica `needs_review`. */
  confidenceThreshold: Number(process.env.TRIAGE_CONFIDENCE_THRESHOLD ?? 0.6),

  /** Veredictos que fazem o job falhar (ex.: "bug" ou "bug,needs_review"). */
  failOn: list(process.env.TRIAGE_FAIL_ON, "bug") as Verdict[],

  /** Pedidos ao Jev em paralelo. */
  concurrency: Number(process.env.TRIAGE_CONCURRENCY ?? 4),
};
