import { test, expect } from "@playwright/test";

// AMBIENTE: com FAKE_ENV_DOWN=1 o serviço de stock devolve 503 e este teste falha
// sempre, sem que haja um defeito no código da loja.
test("o stock dos produtos é apresentado", async ({ page }) => {
  const inventory = page.waitForResponse("**/api/inventory");
  await page.goto("/");
  const response = await inventory;
  expect(response.status(), `GET /api/inventory devolveu ${response.status()}`).toBe(200);
  await expect(page.locator("#inventory li")).toHaveCount(3);
});
