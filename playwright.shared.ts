// Configuração partilhada pelas duas suites (local e saucedemo).
// Cada suite escreve tudo em reports/<suite>/, para que a triagem, o Allure e o Pages
// tratem as duas da mesma forma.
import { devices, type PlaywrightTestConfig } from "@playwright/test";

// Carrega o .env local, se existir (Node >= 21.7, sem dotenv).
try {
  process.loadEnvFile();
} catch {}

export function suiteConfig(suite: string): PlaywrightTestConfig {
  const dir = `reports/${suite}`;
  return {
    testDir: `./tests/${suite}`,
    outputDir: `${dir}/test-results`,
    fullyParallel: true,
    // Sem retries: cada teste corre uma vez e o Jev classifica essa única tentativa.
    retries: 0,
    reporter: [
      ["list"],
      ["html", { open: "never", outputFolder: `${dir}/playwright-report` }],
      // A triagem lê este ficheiro.
      ["json", { outputFile: `${dir}/results.json` }],
      // Resultados Allure 3 (um JSON por teste); a triagem acrescenta-lhes a análise do Jev.
      ["allure-playwright", { resultsDir: `${dir}/allure-results` }],
    ],
    use: { trace: "retain-on-failure" },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  };
}
