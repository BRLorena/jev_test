// Suite "local": a mini loja em app/, levantada pelo webServer.
import { defineConfig } from "@playwright/test";
import { suiteConfig } from "./playwright.shared.ts";

const PORT = Number(process.env.PORT ?? 3000);
const base = suiteConfig("local");

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: "npx tsx app/server.ts",
    url: `http://localhost:${PORT}`,
    // Nunca reutilizar: o servidor tem de arrancar com as variáveis (FAKE_ENV_DOWN, ...) desta execução.
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
  },
});
