/**
 * ★ Onde o Jev entra.
 *
 * Para cada teste falhado fazemos UM pedido ao System One (modelo Jev) com:
 *   - `state`: os factos da falha (o que o Jev "lê");
 *   - uma pergunta `choice` (o que o Jev "decide"): bug | flaky | environment;
 *   - duas perguntas `noul` (sim/não) que podem ser verdade em simultâneo com a categoria:
 *     o defeito está no código do teste? a falha deve-se a lentidão?
 *
 * As três perguntas vão no MESMO pedido: correm em paralelo sobre o mesmo state e não veem
 * as respostas umas das outras (fan-out). A latência quase não muda; só sobem alguns tokens.
 *
 * O Jev não gera texto: a `choice` devolve a opção escolhida, a probabilidade de cada opção
 * e um `confidence`; cada `noul` devolve só a probabilidade de "sim" (sem `confidence`:
 * perto de 0.5 significa "não sei"). A decisão final fica no nosso código.
 *
 * Docs: https://docs.typesafe.ai/primitives/choice, .../primitives/noul, .../confidence
 */
import { choice, noul, TypeSafeClient, type JsonValue } from "@typesafe-ai/sdk";
import { type Category, type Verdict } from "./config.ts";
import type { FailedTest } from "./report-parser.ts";
import type { HistoryEntry } from "./history.ts";

// 1) A pergunta. Os critérios usam objetos (what / not_for / signals) porque as três
//    categorias confundem-se facilmente; o Jev lê os nomes e os valores dos campos.
//    O id "category" é só para o nosso código: o modelo nunca o vê.
const triageQuestions = {
  category: choice(
    {
      question:
        "What is the most likely root cause of this failed end-to-end test (`failure`)?",
      focus:
        "Use the error message, stack excerpt, the attempts in this run (`failure.attempts`) and the results of the same test in previous runs (`failure.history`).",
    },
    {
      bug: {
        what: "The application under test behaves incorrectly: a deterministic defect in product code.",
        signals: [
          "an assertion receives a wrong but stable value (e.g. a wrong total)",
          "fails the same way on every attempt",
          "in `failure.history` it fails on every run since a given point, with the same error",
        ],
        not_for: "Timeouts that vary between attempts, or a dependency returning 5xx/being unreachable.",
      },
      flaky: {
        what: "Non-deterministic failure caused by timing, race conditions or test ordering; the product is not necessarily wrong.",
        signals: [
          "in `failure.history` it alternates between passing and failing without a consistent pattern",
          "the test passed on a retry",
          "timeouts waiting for an element or response that eventually arrives",
          "different errors or durations across attempts",
        ],
        not_for: "Consistent wrong values, or explicit service-unavailable errors.",
      },
      environment: {
        what: "Infrastructure or a dependency outside the code under test is unavailable or misconfigured.",
        signals: [
          "HTTP 502/503/504, connection refused, DNS errors, net::ERR_* network errors",
          "missing credentials, configuration or test data",
        ],
        not_for: "Wrong values computed by the application itself.",
      },
    },
  ),

  // Noul 1: separa "bug na app" de "bug no teste". Precisa de ver o código (`failure.test_source`).
  test_code_defect: noul(
    "Is the root cause of this failure a mistake in the test code itself (`failure.test_source`), rather than in the application under test?",
    {
      true: "The test is wrong: it uses a selector or test id that does not exist on the page (compare with `failure.page_test_ids` and `failure.page_snapshot`), expects a value the application was never meant to show, or uses invalid test data.",
      false: "The test performs reasonable user actions and expects reasonable behavior; the application or its environment misbehaves.",
    },
  ),

  // Noul 2: lentidão constante não é flaky nem comportamento errado: é performance.
  slowness: noul(
    "Did this test fail because the application was too slow, even though it may eventually behave correctly?",
    {
      true: "A duration budget was exceeded, or the test timed out while the application was still loading or processing.",
      false: "The application showed wrong values, errors or missing elements, independently of how long it took.",
    },
  ),
};

export interface Classification {
  verdict: Verdict;
  /** Opção que o Jev escolheu (mesmo quando o veredicto é needs_review). */
  suggested?: Category;
  confidence?: number;
  probabilities?: Record<Category, number>;
  /** P(o defeito está no código do teste), da noul `test_code_defect`. */
  testCodeDefect?: number;
  /** P(a falha deve-se a lentidão), da noul `slowness`. */
  slowness?: number;
  model?: string;
  /** O state exatamente como foi enviado ao Jev (anexado ao Allure). */
  state?: JsonValue;
  error?: string;
}

// 2) O state: factos estruturados com nomes claros. Só factos observados,
//    sem a nossa opinião (não passamos o rótulo "flaky" do Playwright, só o que aconteceu).
//    O histórico é o sinal mais forte de flakiness: numa única execução, um timeout
//    parece-se com um bug; ao longo de várias execuções, "passa às vezes" fica evidente.
function buildState(t: FailedTest, history: HistoryEntry[]) {
  const recent = history.slice(-10);
  const historyState: JsonValue =
    history.length === 0
      ? { previous_runs: 0, note: "No previous runs recorded for this test." }
      : {
          previous_runs: history.length,
          passed: history.filter((h) => h.status === "passed").length,
          failed: history.filter((h) => h.status === "failed").length,
          recent_runs_oldest_first: recent.map((h) => ({
            status: h.status,
            duration_ms: h.durationMs,
            error_first_line: h.error ?? null,
          })),
        };
  const failedAttempts = t.attempts.filter((a) => a.status !== "passed").length;
  return {
    failure: {
      test_title: t.title,
      test_file: t.file,
      browser: t.project,
      total_attempts: t.attempts.length,
      failed_attempts: failedAttempts,
      passed_on_retry: t.attempts.some((a) => a.status === "passed"),
      attempts: t.attempts.map((a) => ({
        attempt: a.retry + 1,
        status: a.status,
        duration_ms: a.durationMs,
        error_first_line: a.error ?? null,
      })),
      error_message: t.errorMessage,
      stack_excerpt: t.stackExcerpt,
      // Necessário para a noul `test_code_defect`: sem ver o código, o Jev não pode julgar o teste.
      test_source: t.sourceExcerpt || null,
      // O que a página tinha quando o teste falhou: permite ver se um seletor do teste existe.
      page_test_ids: t.pageTestIds ?? null,
      page_snapshot: t.pageSnapshot ?? null,
      history: historyState,
    },
  };
}

export function createJevClassifier(
  apiKey: string,
  policy: { confidenceThreshold: number; testDefectThreshold: number },
) {
  // O SDK também leria TYPESAFE_API_KEY sozinho; passamos explícito para ficar claro.
  // Modelo: TYPESAFE_DEFAULT_MODEL, senão "jev-latest" (default do SDK).
  const client = new TypeSafeClient({ apiKey, timeout: 20_000 });

  /** `history`: execuções ANTERIORES deste teste (sem a atual). */
  return async function classify(t: FailedTest, history: HistoryEntry[]): Promise<Classification> {
    try {
      // 3) A chamada. Um pedido por falha, com as três perguntas. As respostas vêm tipadas
      //    a partir de `triageQuestions` (category → ChoiceResponse, as nouls → NoulResponse).
      const state = buildState(t, history);
      const response = await client.systemOne({
        state,
        questions: triageQuestions,
      });
      const answer = response.answers.category;
      const testCodeDefect = response.answers.test_code_defect.noul;
      const slowness = response.answers.slowness.noul;

      // 4) A política é nossa:
      //    - confiança baixa na categoria → um humano decide;
      //    - "bug", mas provavelmente no código do teste → não bloquear como se fosse da app.
      //    A lentidão é só informativa (aparece nos relatórios), não muda o veredicto.
      let verdict: Verdict = answer.confidence < policy.confidenceThreshold ? "needs_review" : answer.choice;
      if (verdict === "bug" && testCodeDefect >= policy.testDefectThreshold) verdict = "needs_review";

      return {
        verdict,
        suggested: answer.choice,
        confidence: answer.confidence,
        probabilities: { ...answer.probabilities },
        testCodeDefect,
        slowness,
        model: response.model,
        state,
      };
    } catch (err) {
      // Falha da API (rede, 429 após retries, chave inválida...): não bloqueia o pipeline.
      return { verdict: "unclassified", error: err instanceof Error ? err.message : String(err) };
    }
  };
}
