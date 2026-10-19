// "local" suite: the mini shop in app/, started by webServer.
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
    // Never reuse: the server must start with this run's variables (FAKE_ENV_DOWN, ...).
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
  },
});
