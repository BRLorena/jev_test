import { defineConfig, devices } from "@playwright/test";

// Carrega o .env local, se existir (Node >= 21.7, sem dotenv).
try {
  process.loadEnvFile();
} catch {}

const PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    // A triagem lê este ficheiro.
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx app/server.ts",
    url: `http://localhost:${PORT}`,
    // Nunca reutilizar: o servidor tem de arrancar com as variáveis (FAKE_ENV_DOWN, ...) desta execução.
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
  },
});
