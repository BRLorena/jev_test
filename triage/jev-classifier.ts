/**
 * ★ Onde o Jev entra.
 *
 * Para cada teste falhado fazemos UM pedido ao System One (modelo Jev) com:
 *   - `state`: os factos da falha (o que o Jev "lê");
 *   - uma pergunta `choice` (o que o Jev "decide"): bug | flaky | environment.
 *
 * O Jev não gera texto: devolve a opção escolhida, a probabilidade de cada opção
 * e um `confidence` (0–1) calculado a partir dessas probabilidades.
 * A decisão final (needs_review, falhar o job, ...) fica no nosso código.
 *
 * Docs: https://docs.typesafe.ai/primitives/choice  e  https://docs.typesafe.ai/confidence
 */
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { type Category, type Verdict } from "./config.ts";
import type { FailedTest } from "./report-parser.ts";

// 1) A pergunta. Os critérios usam objetos (what / not_for / signals) porque as três
//    categorias confundem-se facilmente; o Jev lê os nomes e os valores dos campos.
//    O id "category" é só para o nosso código: o modelo nunca o vê.
const triageQuestions = {
  category: choice(
    {
      question:
        "What is the most likely root cause of this failed end-to-end test (`failure`)?",
      focus:
        "Use the error message, stack excerpt and the outcome of every attempt (`failure.attempts`), including whether a retry passed.",
    },
    {
      bug: {
        what: "The application under test behaves incorrectly: a deterministic defect in product code.",
        signals: [
          "an assertion receives a wrong but stable value (e.g. a wrong total)",
          "fails the same way on every attempt",
        ],
        not_for: "Timeouts that vary between attempts, or a dependency returning 5xx/being unreachable.",
      },
      flaky: {
        what: "Non-deterministic failure caused by timing, race conditions or test ordering; the product is not necessarily wrong.",
        signals: [
          "the test passed on a retry",
          "timeouts waiting for an element or response that eventually arrives",
          "different errors or durations across attempts",
        ],
        not_for: "Consistent wrong values, or explicit service-unavailable errors.",
      },
      environment: {
        what: "Infrastructure or a dependency outside the code under test is unavailable or misconfigured.",
        signals: [
          "HTTP 502/503/504, connection refused, DNS errors",
          "missing credentials, configuration or test data",
        ],
        not_for: "Wrong values computed by the application itself.",
      },
    },
  ),
};

export interface Classification {
  verdict: Verdict;
  /** Opção que o Jev escolheu (mesmo quando o veredicto é needs_review). */
  suggested?: Category;
  confidence?: number;
  probabilities?: Record<Category, number>;
  model?: string;
  error?: string;
}

// 2) O state: factos estruturados com nomes claros. Só factos observados,
//    sem a nossa opinião (não passamos o rótulo "flaky" do Playwright, só o que aconteceu).
function buildState(t: FailedTest) {
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
    },
  };
}

export function createJevClassifier(apiKey: string, confidenceThreshold: number) {
  // O SDK também leria TYPESAFE_API_KEY sozinho; passamos explícito para ficar claro.
  // Modelo: TYPESAFE_DEFAULT_MODEL, senão "jev-latest" (default do SDK).
  const client = new TypeSafeClient({ apiKey, timeout: 20_000 });

  return async function classify(t: FailedTest): Promise<Classification> {
    try {
      // 3) A chamada. Uma pergunta, uma falha. As respostas vêm tipadas a partir de `triageQuestions`.
      const response = await client.systemOne({
        state: buildState(t),
        questions: triageQuestions,
      });
      const answer = response.answers.category;

      // 4) A política é nossa: confiança baixa → um humano decide.
      const verdict: Verdict =
        answer.confidence < confidenceThreshold ? "needs_review" : answer.choice;

      return {
        verdict,
        suggested: answer.choice,
        confidence: answer.confidence,
        probabilities: { ...answer.probabilities },
        model: response.model,
      };
    } catch (err) {
      // Falha da API (rede, 429 após retries, chave inválida...): não bloqueia o pipeline.
      return { verdict: "unclassified", error: err instanceof Error ? err.message : String(err) };
    }
  };
}
