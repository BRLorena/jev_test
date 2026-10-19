/**
 * ★ Where Jev comes in.
 *
 * For each failed test we make ONE request to System One (the Jev model) with:
 *   - `state`: the facts about the failure (what Jev "reads");
 *   - a `choice` question (what Jev "decides"): bug | flaky | environment;
 *   - two `noul` (yes/no) questions that can be true at the same time as the category:
 *     is the defect in the test code? is the failure caused by slowness?
 *
 * All three questions go in the SAME request: they run in parallel over the same state and
 * don't see each other's answers (fan-out). Latency barely changes; only a few extra tokens.
 *
 * Jev doesn't generate text: the `choice` returns the chosen option, the probability of each
 * option and a `confidence`; each `noul` returns only the probability of "yes" (no `confidence`:
 * close to 0.5 means "I don't know"). The final decision lives in our code.
 *
 * Docs: https://docs.typesafe.ai/primitives/choice, .../primitives/noul, .../confidence
 */
import { choice, noul, TypeSafeClient, type JsonValue } from "@typesafe-ai/sdk";
import { type Category, type Verdict } from "./config.ts";
import type { FailedTest } from "./report-parser.ts";
import type { HistoryEntry } from "./history.ts";

// 1) The question. The criteria use objects (what / not_for / signals) because the three
//    categories are easy to confuse; Jev reads both the field names and their values.
//    The id "category" is only for our code: the model never sees it.
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

  // Noul 1: separates "bug in the app" from "bug in the test". It needs to see the code (`failure.test_source`).
  test_code_defect: noul(
    "Is the root cause of this failure a mistake in the test code itself (`failure.test_source`), rather than in the application under test?",
    {
      true: "The test is wrong: it uses a selector or test id that does not exist on the page (compare with `failure.page_test_ids` and `failure.page_snapshot`), expects a value the application was never meant to show, or uses invalid test data.",
      false: "The test performs reasonable user actions and expects reasonable behavior; the application or its environment misbehaves.",
    },
  ),

  // Noul 2: consistent slowness is neither flaky nor wrong behavior: it's performance.
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
  /** The option Jev chose (even when the verdict is needs_review). */
  suggested?: Category;
  confidence?: number;
  probabilities?: Record<Category, number>;
  /** P(the defect is in the test code), from the `test_code_defect` noul. */
  testCodeDefect?: number;
  /** P(the failure is caused by slowness), from the `slowness` noul. */
  slowness?: number;
  model?: string;
  /** The state exactly as sent to Jev (attached to Allure). */
  state?: JsonValue;
  error?: string;
}

// 2) The state: structured facts with clear names. Only observed facts, without our
//    opinion (we don't pass Playwright's "flaky" label, only what happened).
//    History is the strongest flakiness signal: in a single run a timeout looks like
//    a bug; across several runs, "passes sometimes" becomes obvious.
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
      // Needed for the `test_code_defect` noul: without seeing the code, Jev can't judge the test.
      test_source: t.sourceExcerpt || null,
      // What the page contained when the test failed: shows whether a test selector exists.
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
  // The SDK would also read TYPESAFE_API_KEY by itself; we pass it explicitly for clarity.
  // Model: TYPESAFE_DEFAULT_MODEL, otherwise "jev-latest" (the SDK default).
  const client = new TypeSafeClient({ apiKey, timeout: 20_000 });

  /** `history`: PREVIOUS runs of this test (excluding the current one). */
  return async function classify(t: FailedTest, history: HistoryEntry[]): Promise<Classification> {
    try {
      // 3) The call. One request per failure, with all three questions. Answers are typed
      //    from `triageQuestions` (category → ChoiceResponse, the nouls → NoulResponse).
      const state = buildState(t, history);
      const response = await client.systemOne({
        state,
        questions: triageQuestions,
      });
      const answer = response.answers.category;
      const testCodeDefect = response.answers.test_code_defect.noul;
      const slowness = response.answers.slowness.noul;

      // 4) The policy is ours:
      //    - low confidence in the category → a human decides;
      //    - "bug", but probably in the test code → don't block as if it were the app's fault.
      //    Slowness is informational only (shown in the reports); it doesn't change the verdict.
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
      // API failure (network, 429 after retries, invalid key...): doesn't block the pipeline.
      return { verdict: "unclassified", error: err instanceof Error ? err.message : String(err) };
    }
  };
}
