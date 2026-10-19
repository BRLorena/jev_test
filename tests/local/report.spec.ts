import { test, expect } from "@playwright/test";

// FLAKY: /api/report responds with a random delay between 0 and FLAKY_MAX_DELAY_MS
// (default 2000 ms) and this test only waits 1 s. It fails about half the time.
test("the report loads in under 1 second", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load report" }).click();
  await expect(page.locator("#report")).toHaveText("Orders: 42", { timeout: 1000 });
});
