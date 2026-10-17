/**
 * Mini "loja" usada pelos testes. Servidor HTTP nativo do Node, sem dependências.
 * O Playwright arranca-o via `webServer` (ver playwright.config.ts).
 *
 * Variáveis de ambiente que controlam as falhas de propósito:
 *   PORT                 porta (default 3000)
 *   FAKE_ENV_DOWN=1      /api/inventory devolve 503 (falha de ambiente)
 *   FLAKY_MAX_DELAY_MS   atraso máximo aleatório de /api/report (default 2000)
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const FAKE_ENV_DOWN = process.env.FAKE_ENV_DOWN === "1";
const FLAKY_MAX_DELAY_MS = Number(process.env.FLAKY_MAX_DELAY_MS ?? 2000);

const products = [
  { id: 1, name: "Teclado", price: 40 },
  { id: 2, name: "Rato", price: 20 },
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

  // Falha de AMBIENTE: simula uma dependência (serviço de stock) em baixo.
  if (url.pathname === "/api/inventory") {
    if (FAKE_ENV_DOWN) return json(res, 503, { error: "Inventory service unavailable" });
    return json(res, 200, { 1: 12, 2: 0, 3: 4 });
  }

  // Falha FLAKY: resposta com atraso aleatório; o teste espera no máximo 1s.
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
