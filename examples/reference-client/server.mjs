/**
 * Reference client host.
 *
 *   pnpm --filter @aldus-palace/example-reference-client start
 *
 * Serves the static client and proxies `/api/*` to the Aldus server with the
 * bearer token, so the token never reaches the browser. Only Node built-ins.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "public");
const PORT = Number(process.env.PORT ?? 5173);
const API = (process.env.ALDUS_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const TOKEN = process.env.ALDUS_API_TOKEN ?? "dev-local-token";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname.startsWith("/api/")) {
      const target = `${API}${url.pathname.slice("/api".length)}${url.search}`;
      const body = await readBody(req);
      const upstream = await fetch(target, {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: body.length ? body : undefined,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      });
      res.end(text);
      return;
    }

    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const resolved = normalize(join(publicDir, relative));
    if (!resolved.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const data = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(resolved)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(PORT, () => {
  console.log(`Reference client on http://localhost:${PORT}  →  ${API}`);
});
