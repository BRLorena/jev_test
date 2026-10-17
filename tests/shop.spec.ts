import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("a home mostra o título da loja", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Mini Shop" })).toBeVisible();
});

test("lista os três produtos", async ({ page }) => {
  await expect(page.locator("#products li")).toHaveCount(3);
});

test("adicionar produtos atualiza o total do carrinho", async ({ page }) => {
  await page.getByRole("button", { name: "Adicionar Teclado" }).click();
  await page.getByRole("button", { name: "Adicionar Rato" }).click();
  await expect(page.locator("#total")).toHaveText("60.00");
});

test("remover um produto do carrinho", async ({ page }) => {
  await page.getByRole("button", { name: "Adicionar Monitor" }).click();
  await page.getByRole("button", { name: "Remover Monitor" }).click();
  await expect(page.locator("#cart li")).toHaveCount(0);
  await expect(page.locator("#total")).toHaveText("0.00");
});

test("o formulário de contacto confirma o envio", async ({ page }) => {
  await page.getByPlaceholder("email").fill("qa@example.com");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("status")).toHaveText("Obrigado, qa@example.com!");
});

// BUG REAL: a app aplica o desconto duas vezes (index.html, renderCart).
// 80 € com 10% de desconto deve dar 72.00, mas a app mostra 64.80.
test("desconto de 10% é aplicado ao total", async ({ page }) => {
  await page.getByRole("button", { name: "Adicionar Teclado" }).click();
  await page.getByRole("button", { name: "Adicionar Rato" }).click();
  await page.getByRole("button", { name: "Adicionar Rato" }).click();
  await page.getByLabel("Aplicar desconto de 10%").check();
  await expect(page.locator("#total")).toHaveText("72.00");
});
