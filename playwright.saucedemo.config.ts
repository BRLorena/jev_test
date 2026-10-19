// "saucedemo" suite: tests against https://www.saucedemo.com (a public site for practising automation).
import { defineConfig } from "@playwright/test";
import { suiteConfig } from "./playwright.shared.ts";

const base = suiteConfig("saucedemo");

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: "https://www.saucedemo.com",
    testIdAttribute: "data-test",
    // A missing selector fails after 10 s instead of waiting for the test timeout (30 s).
    actionTimeout: 10_000,
  },
});
