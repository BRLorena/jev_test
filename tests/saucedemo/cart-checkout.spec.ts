import { test, expect, loginToInventory } from "./support.ts";

test("checkout completo com total correto", async ({ page }) => {
  await loginToInventory(page, "standard_user");
  await page.getByTestId("add-to-cart-sauce-labs-bike-light").click();
  await page.getByTestId("add-to-cart-sauce-labs-bolt-t-shirt").click();
  await page.getByTestId("shopping-cart-link").click();
  await page.getByTestId("checkout").click();
  await page.getByTestId("firstName").fill("Ana");
  await page.getByTestId("lastName").fill("Silva");
  await page.getByTestId("postalCode").fill("1000");
  await page.getByTestId("continue").click();

  await expect(page.getByTestId("subtotal-label")).toHaveText("Item total: $25.98");
  await expect(page.getByTestId("total-label")).toHaveText("Total: $28.06");
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("complete-header")).toHaveText("Thank you for your order!");
});

// BUG (error_user): o botão "Remove" não remove o produto.
test("remover do carrinho atualiza o contador", async ({ page }) => {
  await loginToInventory(page, "error_user");
  await page.getByTestId("add-to-cart-sauce-labs-backpack").click();
  await page.getByTestId("add-to-cart-sauce-labs-bike-light").click();
  await expect(page.getByTestId("shopping-cart-badge")).toHaveText("2");

  await page.getByTestId("remove-sauce-labs-backpack").click();
  await expect(page.getByTestId("shopping-cart-badge")).toHaveText("1");
});

// BUG (problem_user): o que se escreve no "Last Name" vai para o "First Name".
// O teste preenche o apelido, mas a app responde "Last Name is required": parece um teste
// mal escrito, mas o defeito é da app. Bom caso para a pergunta noul `test_code_defect`.
test("o checkout aceita nome e apelido", async ({ page }) => {
  await loginToInventory(page, "problem_user");
  await page.getByTestId("add-to-cart-sauce-labs-backpack").click();
  await page.getByTestId("shopping-cart-link").click();
  await page.getByTestId("checkout").click();
  await page.getByTestId("firstName").fill("Ana");
  await page.getByTestId("lastName").fill("Silva");
  await page.getByTestId("postalCode").fill("1000");
  await page.getByTestId("continue").click();

  const error = page.getByTestId("error");
  const errorText = (await error.isVisible()) ? await error.textContent() : null;
  expect(errorText, "a app mostrou um erro depois de preencher nome, apelido e código postal").toBeNull();
  await expect(page).toHaveURL(/checkout-step-two/);
});

// LENTIDÃO (performance_glitch_user): o fluxo funciona, mas demora demasiado.
test("checkout completo dentro de 3 s", async ({ page }) => {
  const start = Date.now();
  await loginToInventory(page, "performance_glitch_user");
  await page.getByTestId("add-to-cart-sauce-labs-backpack").click();
  await page.getByTestId("shopping-cart-link").click();
  await page.getByTestId("checkout").click();
  await page.getByTestId("firstName").fill("Ana");
  await page.getByTestId("lastName").fill("Silva");
  await page.getByTestId("postalCode").fill("1000");
  await page.getByTestId("continue").click();
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("complete-header")).toHaveText("Thank you for your order!");

  const elapsed = Date.now() - start;
  expect(elapsed, `checkout demorou ${elapsed} ms (orçamento: 3000 ms)`).toBeLessThan(3000);
});

// DEFEITO DO TESTE (de propósito): o data-test real é "add-to-cart-sauce-labs-backpack".
// A app está correta; quem está errado é o seletor.
test("adicionar o backpack ao carrinho", async ({ page }) => {
  await loginToInventory(page, "standard_user");
  await page.getByTestId("add-to-cart-backpack").click();
  await expect(page.getByTestId("shopping-cart-badge")).toHaveText("1");
});
