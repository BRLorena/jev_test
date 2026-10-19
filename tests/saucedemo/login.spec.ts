import { test, expect, login, loginToInventory } from "./support.ts";

test("valid login leads to the inventory", async ({ page }) => {
  await loginToInventory(page, "standard_user");
  await expect(page).toHaveURL(/inventory\.html/);
  await expect(page.getByTestId("inventory-item")).toHaveCount(6);
});

test("locked-out user sees the error message", async ({ page }) => {
  await login(page, "locked_out_user");
  await expect(page.getByTestId("error")).toHaveText("Epic sadface: Sorry, this user has been locked out.");
});

test("wrong password shows an error", async ({ page }) => {
  await login(page, "standard_user", "wrong_password");
  await expect(page.getByTestId("error")).toContainText("Username and password do not match");
});

// ENVIRONMENT: with SAUCE_ENV_DOWN=1 every request to the site is aborted, as if the network
// or the site were down. Without the variable, the test passes.
test("the inventory loads", async ({ page }) => {
  if (process.env.SAUCE_ENV_DOWN === "1") {
    await page.route("**/*", (route) => route.abort("internetdisconnected"));
  }
  await loginToInventory(page, "standard_user");
});
