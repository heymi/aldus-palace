# Capabilities

Nine capabilities, three ways in. Use one, or all of them.

| # | Capability | You don't have to build | MCP profile | HTTP | Library |
|---|---|---|---|---|---|
| 1 | [Schema & domain](capabilities/01-schema-and-domain.md) | the object model for human intent, its constraints and migrations | — | — | `core/domain` `core/db/*` |
| 2 | [Providers](capabilities/02-providers.md) | model abstraction + a deterministic provider so agents are testable | — | — | `core/providers` |
| 3 | [Understanding Agent](capabilities/03-understanding.md) | prompt engineering, output validation, fallbacks, dedupe, date resolution | `capture` | `POST /v1/inputs` | `core` |
| 4 | [Progressive capture](capabilities/04-progressive-capture.md) | concurrency, retry and crash-safety around background LLM enrichment | `capture` | `POST /v1/inputs/:id/enrich` | `core` |
| 5 | [Memory](capabilities/05-memory.md) | a candidate/confirm/evidence gate that also versions what it learns | `memory` | `/v1/memories*` | `core` |
| 6 | [Today & planning](capabilities/06-today-and-planning.md) | scheduling heuristics, risk detection, adaptive daily limits | `today` | `/v1/today` `/v1/plan/today` | `core` |
| 7 | [Work streams](capabilities/07-work-streams.md) | grouping that is rebuildable and never touches the source of truth | `workstreams` | `GET /v1/work-streams` | `core` |
| 8 | [HTTP API](capabilities/08-http-api.md) | the REST layer, storage adapters and deployment | — | all 40+ routes | `apps/server` |
| 9 | [MCP server](capabilities/09-mcp.md) | the Model Context Protocol surface and tool selection | — | — | `packages/mcp` |

## Modules are decoupled in code

Every capability service depends only on the storage port, the domain types and
pure helpers — **there are zero dependencies between the services themselves**:

```
services/*  ←  domain/types · db/port · lib/* · repos/actionLogs
```

That is what makes "use just this one" real, and it is enforced by the module
graph rather than by convention.

## One shared contract

Capabilities 1–7 read and write the same schema. "Bring one module" therefore
means **bring our migrations**:

```ts
import { initialize } from "@aldus-palace/core";
await initialize(db);   // canonical DDL + forward-only migrations
```

Migrations are forward-only and versioned in `schema_migrations`, so a database
created by an older release upgrades on startup. `spec/schema.sql` is generated
from the canonical schema and checked in CI (`pnpm spec:check`).

## Three ways in

| Level | You write | Best for |
|---|---|---|
| **MCP** | a JSON config block | using it inside Claude, Cursor or any MCP client |
| **HTTP** | `fetch` / `curl` / any language | your own frontend, mobile app or service |
| **Library** | TypeScript | embedding the runtime in your product |

Start at [`INTEGRATION.md`](INTEGRATION.md).
