import { test, expect } from "@playwright/test";

// FLAKY: /api/report responde com um atraso aleatório entre 0 e FLAKY_MAX_DELAY_MS
// (default 2000 ms) e este teste só espera 1 s. Falha ~1/2 das vezes e costuma passar no retry.
test("o relatório carrega em menos de 1 segundo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Carregar relatório" }).click();
  await expect(page.locator("#report")).toHaveText("Encomendas: 42", { timeout: 1000 });
});
