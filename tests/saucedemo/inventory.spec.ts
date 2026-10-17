import { test, expect, loginToInventory, toNumber } from "./support.ts";

// BUG (problem_user): todas as imagens dos produtos são a mesma.
test("os produtos têm imagens diferentes", async ({ page }) => {
  await loginToInventory(page, "problem_user");
  const sources = await page.locator(".inventory_item img").evaluateAll((imgs) =>
    imgs.map((img) => img.getAttribute("src")),
  );
  expect(new Set(sources).size, `imagens distintas: ${[...new Set(sources)].join(", ")}`).toBe(6);
});

// BUG (problem_user): clicar no Backpack abre outro produto.
test("clicar num produto abre esse produto", async ({ page }) => {
  await loginToInventory(page, "problem_user");
  await page.getByText("Sauce Labs Backpack", { exact: true }).click();
  await expect(page.getByTestId("back-to-products")).toBeVisible();
  await expect(page.getByTestId("inventory-item-name")).toHaveText("Sauce Labs Backpack");
});

// BUG (error_user): ordenar abre um alerta e a lista não muda.
test("ordenar por preço (low to high)", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await loginToInventory(page, "error_user");
  await page.getByTestId("product-sort-container").selectOption("lohi");

  const prices = (await page.getByTestId("inventory-item-price").allTextContents()).map(toNumber);
  const sorted = [...prices].sort((a, b) => a - b);
  expect(prices, `alertas do browser: ${dialogs.join(" | ") || "nenhum"}`).toEqual(sorted);
});

// BUG (visual_user): o preço na lista não é o preço real do produto.
test("o preço da lista é igual ao do detalhe", async ({ page }) => {
  await loginToInventory(page, "visual_user");
  const item = page.getByTestId("inventory-item").filter({ hasText: "Sauce Labs Backpack" });
  const listPrice = await item.getByTestId("inventory-item-price").textContent();

  await page.getByText("Sauce Labs Backpack", { exact: true }).click();
  await expect(page.getByTestId("back-to-products")).toBeVisible();
  await expect(page.getByTestId("inventory-item-price")).toHaveText(listPrice!);
});
