# Deployment

Three shapes, from “just try it” to “always on”.

---

## 1. Local, one command

```bash
git clone https://github.com/heymi/aldus-palace && cd aldus-palace
cp .env.example .env          # set DEV_AUTH_TOKEN
docker compose up --build
curl localhost:8787/health
```

Data lives in the `aldus-data` volume (`/data/aldus.db` inside the container).

**Back up** — it is a single SQLite file:

```bash
docker compose exec aldus-palace \
  node -e "console.log(process.env.DATABASE_PATH)"        # /data/aldus.db
docker cp "$(docker compose ps -q aldus-palace)":/data/aldus.db ./aldus-$(date +%F).db
```

**Upgrade** — pull, rebuild, restart. Schema migrations are forward-only and run
on startup; no manual step:

```bash
git pull && docker compose up --build -d
```

**Inspect** — it is SQLite, so anything works:

```bash
docker compose exec aldus-palace node -e "
const D=require('better-sqlite3');const db=new D('/data/aldus.db',{readonly:true});
console.log(db.prepare('select version from schema_migrations order by version').all());
"
```

## 2. Edge (Cloudflare Workers)

One named Durable Object with SQLite storage; no server to keep alive.

```bash
cd apps/server
pnpm install
pnpm cf:types
wrangler login
wrangler secret put DEV_AUTH_TOKEN
wrangler secret put ANTHROPIC_API_KEY     # optional
pnpm cf:deploy
```

Point clients at the worker URL with the same bearer token. See
[`apps/server/CLOUDFLARE_DEPLOYMENT.md`](../apps/server/CLOUDFLARE_DEPLOYMENT.md).

## 3. Embedded

Mount the routes on your own Hono app, or skip HTTP entirely and call the library:

```ts
import { createApp } from "@aldus-palace/server";
import { openLocalDb } from "@aldus-palace/server/db/local";
import { createLLMProvider, resolveProviderConfig } from "@aldus-palace/core/providers";

const db = await openLocalDb("./data/aldus.db");
const app = createApp({
  db,
  llm: createLLMProvider(resolveProviderConfig(process.env)),
  config: {
    devAuthToken: process.env.DEV_AUTH_TOKEN ?? "",
    user: { name: "Local User", timezone: "UTC", language: "en" },
  },
});
```

---

## One writer per SQLite file

SQLite takes a single writer. Two processes pointed at the same `aldus.db`
(the reference server plus a local MCP server, or two MCP servers) compete for
the write lock. The SQLite adapter waits up to five seconds, then returns a busy
error.

Three ways to keep one writer:

- Run the server and point every client at it (`ALDUS_PALACE_API_URL`).
- Run one MCP server per file and use `ALDUS_PALACE_PROFILE` to expose the tools
  that client needs.
- Keep the second copy read-only, or on its own file.

Readers never conflict: several MCP clients can read the same file while one
process writes.

---

## Choosing a model

`LLM_PROVIDER` selects the understanding backend:

| Value | Needs a key | Use for |
|---|---|---|
| `dev` (default in the image) | no | offline, CI, trying it out — deterministic rules |
| `anthropic` | `ANTHROPIC_API_KEY` | best understanding quality |
| `deepseek` | `DEEPSEEK_API_KEY` | cheap, fast, good enough for most captures |
| `openai-compatible` | `OPENAI_COMPATIBLE_*` | OpenAI, a gateway, or a local server |
| `auto` | — | uses a key if one is present, otherwise `dev` |

Full understanding quality needs a model. `dev` is not a degraded mode you have to
tolerate — it is what makes the runtime testable and always available — but it
understands phrasing, not nuance.

## Clients

| Client | How |
|---|---|
| Claude Code / Claude Desktop / Cursor | MCP — see [capability 9](capabilities/09-mcp.md) |
| Your own web or mobile app | HTTP — see [capability 8](capabilities/08-http-api.md) |
| Your own backend | Library — see [INTEGRATION.md](INTEGRATION.md) |

An MCP server can point at the deployed instance instead of a local file:

```json
{ "env": { "ALDUS_PALACE_API_URL": "https://your-worker.workers.dev",
           "ALDUS_PALACE_API_TOKEN": "your-token" } }
```

## Security checklist

- [ ] `DEV_AUTH_TOKEN` changed from the example value
- [ ] Reachable only from where you need it (localhost, VPN, or a tunnel with its
      own auth) — see [SECURITY.md](../SECURITY.md)
- [ ] Backups scheduled (the file, or the volume)
- [ ] `LLM_PROVIDER` and its key set deliberately; if the provider is remote, the
      content of your captures leaves the machine
