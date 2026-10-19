import { test, expect, loginToInventory } from "./support.ts";

test("full checkout with the correct total", async ({ page }) => {
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

// BUG (error_user): the "Remove" button does not remove the product.
test("removing from the cart updates the counter", async ({ page }) => {
  await loginToInventory(page, "error_user");
  await page.getByTestId("add-to-cart-sauce-labs-backpack").click();
  await page.getByTestId("add-to-cart-sauce-labs-bike-light").click();
  await expect(page.getByTestId("shopping-cart-badge")).toHaveText("2");

  await page.getByTestId("remove-sauce-labs-backpack").click();
  await expect(page.getByTestId("shopping-cart-badge")).toHaveText("1");
});

// BUG (problem_user): whatever is typed into "Last Name" goes into "First Name".
// The test fills in the last name, but the app replies "Last Name is required": it looks like
// a badly written test, but the defect is in the app. A good case for the `test_code_defect` noul.
test("checkout accepts first and last name", async ({ page }) => {
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
  expect(errorText, "the app showed an error after filling in first name, last name and postal code").toBeNull();
  await expect(page).toHaveURL(/checkout-step-two/);
});

// SLOWNESS (performance_glitch_user): the flow works, but takes too long.
test("full checkout within 3 s", async ({ page }) => {
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
  expect(elapsed, `checkout took ${elapsed} ms (budget: 3000 ms)`).toBeLessThan(3000);
});

// TEST DEFECT (deliberate): the real data-test is "add-to-cart-sauce-labs-backpack".
// The app is correct; the selector is wrong.
test("add the backpack to the cart", async ({ page }) => {
  await loginToInventory(page, "standard_user");
  await page.getByTestId("add-to-cart-backpack").click();
  await expect(page.getByTestId("shopping-cart-badge")).toHaveText("1");
});
