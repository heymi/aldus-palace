# @aldus-palace/core

Domain model, agent runtime, storage port and provider abstractions for
[Aldus Palace](../../README.md). Runs anywhere: it never reads `process.env`,
never imports an HTTP framework, and has no module-level state.

```bash
npm install @aldus-palace/core
```

## Use it

```ts
import {
  DevLLMProvider,
  initialize,
  processRawInput,
} from "@aldus-palace/core";
import type { SqlDatabase } from "@aldus-palace/core/db/port";

// 1. bring your own SqlDatabase implementation (SQLite, Postgres, …)
// 2. migrate it
await initialize(db);

// 3. run the capture pipeline
const card = await processRawInput(db, new DevLLMProvider(), user, inputId, "local");
```

Subpath exports:

| Import | Contents |
|---|---|
| `@aldus-palace/core` | everything below, re-exported |
| `@aldus-palace/core/providers` | `createLLMProvider`, `resolveProviderConfig`, `DevLLMProvider`, `OpenAICompatibleProvider` |
| `@aldus-palace/core/db/port` | the `SqlDatabase` contract + `nowIso` |
| `@aldus-palace/core/db/migrate` | `applySchema`, `migrate`, `initialize` |
| `@aldus-palace/core/db/schema` | `SCHEMA_SQL` (canonical DDL) |
| `@aldus-palace/core/domain` | domain types and enums |

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the runtime flow and
[`docs/DOMAIN-SCHEMA.md`](../../docs/DOMAIN-SCHEMA.md) for the objects.

## Status

`0.x` — the API is usable and tested, but may change between minor versions.
