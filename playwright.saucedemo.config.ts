// Suite "saucedemo": testes contra https://www.saucedemo.com (site público para praticar automação).
import { defineConfig } from "@playwright/test";
import { suiteConfig } from "./playwright.shared.ts";

const base = suiteConfig("saucedemo");

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: "https://www.saucedemo.com",
    testIdAttribute: "data-test",
    // Um seletor que não existe falha em 10 s em vez de esperar pelo timeout do teste (30 s).
    actionTimeout: 10_000,
  },
});
