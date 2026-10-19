import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the home page shows the shop title", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Mini Shop" })).toBeVisible();
});

test("lists the three products", async ({ page }) => {
  await expect(page.locator("#products li")).toHaveCount(3);
});

test("adding products updates the cart total", async ({ page }) => {
  await page.getByRole("button", { name: "Add Keyboard" }).click();
  await page.getByRole("button", { name: "Add Mouse" }).click();
  await expect(page.locator("#total")).toHaveText("60.00");
});

test("remove a product from the cart", async ({ page }) => {
  await page.getByRole("button", { name: "Add Monitor" }).click();
  await page.getByRole("button", { name: "Remove Monitor" }).click();
  await expect(page.locator("#cart li")).toHaveCount(0);
  await expect(page.locator("#total")).toHaveText("0.00");
});

test("the contact form confirms submission", async ({ page }) => {
  await page.getByPlaceholder("email").fill("qa@example.com");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toHaveText("Thank you, qa@example.com!");
});

// REAL BUG: the app applies the discount twice (index.html, renderCart).
// 80 € with a 10% discount should be 72.00, but the app shows 64.80.
test("10% discount is applied to the total", async ({ page }) => {
  await page.getByRole("button", { name: "Add Keyboard" }).click();
  await page.getByRole("button", { name: "Add Mouse" }).click();
  await page.getByRole("button", { name: "Add Mouse" }).click();
  await page.getByLabel("Apply 10% discount").check();
  await expect(page.locator("#total")).toHaveText("72.00");
});
