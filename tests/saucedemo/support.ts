import { test as base, expect, type Page } from "@playwright/test";

/**
 * `test` with an automatic fixture: when a test fails, it attaches the list of `data-test`
 * attributes on the page. Triage sends it to Jev, which can then tell whether a test selector
 * does not exist on the page (test defect) or whether the page really is wrong.
 */
export const test = base.extend<{ captureTestIds: void }>({
  captureTestIds: [
    async ({ page }, use, testInfo) => {
      await use();
      if (testInfo.status === testInfo.expectedStatus) return;
      const ids = await page
        .locator("[data-test]")
        .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("data-test")))])
        .catch(() => []);
      await testInfo.attach("page-test-ids", { body: JSON.stringify(ids), contentType: "application/json" });
    },
    { auto: true },
  ],
});

export { expect };

export const PASSWORD = "secret_sauce";

/** Saucedemo demo users; each one has different deliberate defects. */
export type SauceUser =
  | "standard_user"
  | "locked_out_user"
  | "problem_user"
  | "performance_glitch_user"
  | "error_user"
  | "visual_user";

export async function login(page: Page, user: SauceUser, password = PASSWORD) {
  await page.goto("/");
  await page.getByTestId("username").fill(user);
  await page.getByTestId("password").fill(password);
  await page.getByTestId("login-button").click();
}

export async function loginToInventory(page: Page, user: SauceUser) {
  await login(page, user);
  await expect(page.getByTestId("title")).toHaveText("Products");
}

/** "$29.99" → 29.99 */
export const toNumber = (price: string) => Number(price.replace("$", ""));
