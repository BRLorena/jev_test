import { test, expect, login, loginToInventory } from "./support.ts";

test("login válido leva ao inventário", async ({ page }) => {
  await loginToInventory(page, "standard_user");
  await expect(page).toHaveURL(/inventory\.html/);
  await expect(page.getByTestId("inventory-item")).toHaveCount(6);
});

test("utilizador bloqueado vê a mensagem de erro", async ({ page }) => {
  await login(page, "locked_out_user");
  await expect(page.getByTestId("error")).toHaveText("Epic sadface: Sorry, this user has been locked out.");
});

test("password errada mostra erro", async ({ page }) => {
  await login(page, "standard_user", "wrong_password");
  await expect(page.getByTestId("error")).toContainText("Username and password do not match");
});

// AMBIENTE: com SAUCE_ENV_DOWN=1 todos os pedidos ao site são cortados, como se a rede
// ou o site estivessem em baixo. Sem a variável, o teste passa.
test("o inventário carrega", async ({ page }) => {
  if (process.env.SAUCE_ENV_DOWN === "1") {
    await page.route("**/*", (route) => route.abort("internetdisconnected"));
  }
  await loginToInventory(page, "standard_user");
});
