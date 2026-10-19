import { test, expect, loginToInventory, toNumber } from "./support.ts";

// BUG (problem_user): every product image is the same.
test("products have different images", async ({ page }) => {
  await loginToInventory(page, "problem_user");
  const sources = await page.locator(".inventory_item img").evaluateAll((imgs) =>
    imgs.map((img) => img.getAttribute("src")),
  );
  expect(new Set(sources).size, `distinct images: ${[...new Set(sources)].join(", ")}`).toBe(6);
});

// BUG (problem_user): clicking the Backpack opens a different product.
test("clicking a product opens that product", async ({ page }) => {
  await loginToInventory(page, "problem_user");
  await page.getByText("Sauce Labs Backpack", { exact: true }).click();
  await expect(page.getByTestId("back-to-products")).toBeVisible();
  await expect(page.getByTestId("inventory-item-name")).toHaveText("Sauce Labs Backpack");
});

// BUG (error_user): sorting opens an alert and the list does not change.
test("sort by price (low to high)", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await loginToInventory(page, "error_user");
  await page.getByTestId("product-sort-container").selectOption("lohi");

  const prices = (await page.getByTestId("inventory-item-price").allTextContents()).map(toNumber);
  const sorted = [...prices].sort((a, b) => a - b);
  expect(prices, `browser alerts: ${dialogs.join(" | ") || "none"}`).toEqual(sorted);
});

// BUG (visual_user): the list price is not the product's real price.
test("list price matches the detail page price", async ({ page }) => {
  await loginToInventory(page, "visual_user");
  const item = page.getByTestId("inventory-item").filter({ hasText: "Sauce Labs Backpack" });
  const listPrice = await item.getByTestId("inventory-item-price").textContent();

  await page.getByText("Sauce Labs Backpack", { exact: true }).click();
  await expect(page.getByTestId("back-to-products")).toBeVisible();
  await expect(page.getByTestId("inventory-item-price")).toHaveText(listPrice!);
});
