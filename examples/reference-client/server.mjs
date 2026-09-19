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
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "public");
const PORT = Number(process.env.PORT ?? 5173);
// Loopback by default: the host injects the bearer token, so it must not be
// reachable from the network unless the operator asks for it.
const HOST = process.env.HOST ?? "127.0.0.1";
const API = (process.env.ALDUS_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const TOKEN = process.env.ALDUS_API_TOKEN ?? "dev-local-token";
const MAX_BODY_BYTES = 1_000_000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("request_too_large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
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
    if (resolved !== publicDir && !resolved.startsWith(publicDir + sep)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    let data;
    try {
      data = await readFile(resolved);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      throw error;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[extname(resolved)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch (error) {
    const status = typeof error?.status === "number" ? error.status : 500;
    // Do not echo filesystem paths or internal messages to the browser.
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: status === 500 ? "internal_error" : String(error?.message ?? error) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Reference client on http://${HOST}:${PORT}  →  ${API}`);
});
