import { test as base, expect, type Page } from "@playwright/test";

/**
 * `test` com uma fixture automática: quando um teste falha, anexa a lista de `data-test`
 * presentes na página. A triagem envia-a ao Jev, que assim consegue ver se um seletor
 * do teste não existe na página (defeito do teste) ou se a página está mesmo errada.
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

/** Utilizadores de demonstração do saucedemo; cada um tem defeitos diferentes de propósito. */
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
