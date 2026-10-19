/**
 * Mini "shop" used by the tests. Native Node HTTP server, no dependencies.
 * Playwright starts it via `webServer` (see playwright.config.ts).
 *
 * Environment variables that control the deliberate failures:
 *   PORT                 port (default 3000)
 *   FAKE_ENV_DOWN=1      /api/inventory returns 503 (environment failure)
 *   FLAKY_MAX_DELAY_MS   maximum random delay of /api/report (default 2000)
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const FAKE_ENV_DOWN = process.env.FAKE_ENV_DOWN === "1";
const FLAKY_MAX_DELAY_MS = Number(process.env.FLAKY_MAX_DELAY_MS ?? 2000);

const products = [
  { id: 1, name: "Keyboard", price: 40 },
  { id: 2, name: "Mouse", price: 20 },
  { id: 3, name: "Monitor", price: 140 },
];

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = await readFile(join(import.meta.dirname, "public", "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (url.pathname === "/api/products") return json(res, 200, products);

  // ENVIRONMENT failure: simulates a dependency (stock service) being down.
  if (url.pathname === "/api/inventory") {
    if (FAKE_ENV_DOWN) return json(res, 503, { error: "Inventory service unavailable" });
    return json(res, 200, { 1: 12, 2: 0, 3: 4 });
  }

  // FLAKY failure: response with a random delay; the test waits at most 1 s.
  if (url.pathname === "/api/report") {
    const delay = Math.floor(Math.random() * FLAKY_MAX_DELAY_MS);
    setTimeout(() => json(res, 200, { orders: 42, generatedInMs: delay }), delay);
    return;
  }

  res.writeHead(404).end("Not found");
});

server.listen(PORT, () => {
  console.log(`Shop running on http://localhost:${PORT} (FAKE_ENV_DOWN=${FAKE_ENV_DOWN ? 1 : 0})`);
});
