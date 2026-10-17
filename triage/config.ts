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

/** Suite a triar: "local" (app/) ou "saucedemo". Cada uma escreve em reports/<suite>/. */
const suite = process.env.SUITE ?? "local";
const reports = `reports/${suite}`;

export const config = {
  suite,
  reportPath: process.env.PLAYWRIGHT_JSON_REPORT ?? `${reports}/results.json`,
  outputDir: process.env.TRIAGE_OUTPUT_DIR ?? `${reports}/triage`,
  /** Resultados Allure a enriquecer com a análise do Jev. */
  allureResultsDir: process.env.ALLURE_RESULTS_DIR ?? `${reports}/allure-results`,

  /** Sem chave → fallback `unclassified`, sem chamadas à API. */
  apiKey: process.env.TYPESAFE_API_KEY?.trim() || undefined,

  /** Abaixo deste `confidence` (0–1) a falha fica `needs_review`. */
  confidenceThreshold: Number(process.env.TRIAGE_CONFIDENCE_THRESHOLD ?? 0.6),

  /** Com `bug` e P(defeito no código do teste) acima disto, a falha fica `needs_review`. */
  testDefectThreshold: Number(process.env.TRIAGE_TEST_DEFECT_THRESHOLD ?? 0.7),
  /** A partir daqui, a P(lentidão) aparece como sinal nos relatórios. */
  slownessThreshold: Number(process.env.TRIAGE_SLOWNESS_THRESHOLD ?? 0.7),

  /** Veredictos que fazem o job falhar (ex.: "bug" ou "bug,needs_review"). */
  failOn: list(process.env.TRIAGE_FAIL_ON, "bug") as Verdict[],

  /** Histórico de execuções anteriores (no CI é descarregado do GitHub Pages antes da triagem). */
  historyPath: process.env.TRIAGE_HISTORY_PATH ?? `.history/${suite}/triage.json`,
  /** Quantas execuções guardar por teste. */
  historySize: Number(process.env.TRIAGE_HISTORY_SIZE ?? 20),
  /** Identificador desta execução no histórico (localmente: hora de início do relatório). */
  runId: process.env.GITHUB_RUN_ID,

  /** Pedidos ao Jev em paralelo. */
  concurrency: Number(process.env.TRIAGE_CONCURRENCY ?? 4),
};
