# Integration

Three levels. Pick the one that matches how much you want to own.

```
┌─ Level 0 · MCP ──────── zero code: a JSON block in your assistant's config
├─ Level 1 · HTTP ─────── one container or one Worker; REST for any language
└─ Level 2 · Library ──── npm install; bring your own app and database
```

---

## Level 0 — MCP (no code)

Use Aldus Palace inside Claude Desktop, Claude Code, Cursor or any MCP client.

```bash
npm install -g @aldus-palace/mcp
```

**Claude Code**

```bash
claude mcp add aldus-palace -- node /path/to/node_modules/@aldus-palace/mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "aldus-palace": {
      "command": "npx",
      "args": ["-y", "@aldus-palace/mcp"],
      "env": { "ALDUS_PALACE_PROFILE": "full" }
    }
  }
}
```

**Tool sets.** Install once, enable what you need with `ALDUS_PALACE_PROFILE`:

| Profile | Tools | Use when |
|---|---|---|
| `full` (default) | all six | you want the whole loop |
| `capture` | `capture` | you only want to record things |
| `today` | `list_today`, `list_commitments` | you want the assistant to know your day |
| `memory` | `list_memories`, `confirm_memory` | you only want the memory gate |
| `workstreams` | `list_work_streams` | you want grouped summaries |

Focused profiles also have their own binaries (`aldus-palace-mcp-today`, …).
Keep the model's tool surface small: it selects better and costs less.

**Slash commands** (deterministic writes):

```
/mcp__aldus-palace__capture 周五前把发布说明写完
/mcp__aldus-palace__today
```

**Where the data lives.** By default `~/.aldus-palace/aldus.db` — a plain SQLite
file. Point several clients at it and they share one context. To talk to a
running server instead:

```json
{ "env": { "ALDUS_PALACE_API_URL": "http://127.0.0.1:8787",
           "ALDUS_PALACE_API_TOKEN": "your-token" } }
```

→ [Capability 9: MCP server](capabilities/09-mcp.md)

---

## Level 1 — HTTP

Run the reference server, call it from anything.

```bash
git clone https://github.com/heymi/aldus-palace && cd aldus-palace
cp .env.example .env          # set DEV_AUTH_TOKEN
docker compose up --build
curl localhost:8787/health
```

```bash
curl -X POST localhost:8787/v1/inputs \
  -H 'Authorization: Bearer dev-local-token' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Ship the onboarding page next week","mode":"sync"}'
```

Prefer the edge? `cd apps/server && pnpm cf:deploy` puts the same API on a
Cloudflare Worker backed by a SQLite Durable Object.

→ [Capability 8: HTTP API](capabilities/08-http-api.md) ·
[Deployment](DEPLOYMENT.md)

---

## Level 2 — Library

Embed the runtime in your own product.

```bash
npm install @aldus-palace/core
```

```ts
import {
  DevLLMProvider,
  ensureDevUser,
  initialize,
  newId,
  processRawInput,
} from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const db = await openSqliteDatabase(":memory:", { wal: false });
await initialize(db);                                  // schema + migrations
const user = await ensureDevUser(db, { name: "Me", timezone: "UTC", language: "en" });

const id = newId("inp");
// ...insert the raw input, then:
const card = await processRawInput(db, new DevLLMProvider(), user, id, "local");
```

Everything is injected: the runtime holds no global state and never reads
`process.env` behind your back. Implement
[`SqlDatabase`](capabilities/01-schema-and-domain.md#the-storage-port) for any
store; the bundled adapter covers SQLite.

### Subpath exports

| Import | Contents |
|---|---|
| `@aldus-palace/core` | everything below |
| `@aldus-palace/core/providers` | provider interface, dev / OpenAI-compatible / Anthropic |
| `@aldus-palace/core/db/port` | the `SqlDatabase` contract + `nowIso` |
| `@aldus-palace/core/db/migrate` | `applySchema`, `migrate`, `initialize` |
| `@aldus-palace/core/db/schema` | `SCHEMA_SQL` (canonical DDL) |
| `@aldus-palace/core/db/sqlite` | the bundled SQLite adapter |
| `@aldus-palace/core/domain` | domain types and enums |

---

## Runnable examples

| Example | Shows |
|---|---|
| [`examples/capture-cli`](../examples/capture-cli) | the smallest embedder (~60 lines) |
| [`examples/understanding-only`](../examples/understanding-only) | the gates: object mode, dates, dedupe, memory filtering |
| [`examples/memory-gate-only`](../examples/memory-gate-only) | candidate → conflict → confirm → supersede |
| [`examples/today-only`](../examples/today-only) | four time models, Today projection, work streams |
| [`examples/http-client`](../examples/http-client) | the same capabilities over HTTP |

```bash
pnpm install
pnpm --filter @aldus-palace/example-understanding-only start
```

## Choosing a level

| You want | Level |
|---|---|
| to use it inside an assistant today, no code | **MCP** |
| your own UI, or a client that is not JavaScript | **HTTP** |
| one capability inside your own product | **Library** |
| to skip writing your own domain model and memory gate | **Library** |
