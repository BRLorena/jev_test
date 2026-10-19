import { test, expect } from "@playwright/test";

// ENVIRONMENT: with FAKE_ENV_DOWN=1 the stock service returns 503 and this test always
// fails, without any defect in the shop's code.
test("product stock is displayed", async ({ page }) => {
  const inventory = page.waitForResponse("**/api/inventory");
  await page.goto("/");
  const response = await inventory;
  expect(response.status(), `GET /api/inventory returned ${response.status()}`).toBe(200);
  await expect(page.locator("#inventory li")).toHaveCount(3);
});
