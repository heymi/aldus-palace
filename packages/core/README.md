# @aldus-palace/core

**The runtime behind Aldus Palace**: a domain model for human intent, an agent
that turns free text into structured objects, a memory gate, and a scheduling
projection — with no global state and nothing to configure.

```bash
npm install @aldus-palace/core
```

## Why you'd use it

You are building something where people state intentions — a notes app, an
assistant, a support tool, an internal bot — and you are about to invent a data
model, a prompt pipeline, a duplicate strategy, a memory policy and a scheduler.
This is that, already decided and tested:

| You'd otherwise build | What's here instead |
|---|---|
| an object model for thoughts / commitments / decisions | a frozen schema with invariants as `CHECK` constraints, plus forward-only migrations |
| prompt engineering + output validation | one pipeline with server-side gates and a deterministic fallback |
| “wait for the model” UX | local-first capture, then leased background enrichment |
| an assistant memory policy | candidates, evidence, conflicts, versioning, and no silent activation |
| a scheduler | four kinds of time, risk instead of overdue, adaptive daily limits |

## Install it in four lines

```ts
import { DevLLMProvider, ensureDevUser, initialize, newId, processRawInput } from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const db = await openSqliteDatabase(":memory:", { wal: false });   // or a file
await initialize(db);                                              // schema + migrations
const user = await ensureDevUser(db, { name: "Me", timezone: "UTC", language: "en" });

// insert a raw_input, then:
const card = await processRawInput(db, new DevLLMProvider(), user, rawInputId, "local");
```

The runtime never reads `process.env`, holds no module-level state, and imports no
HTTP framework — you own configuration and I/O.

## Subpath exports

| Import | Contents |
|---|---|
| `@aldus-palace/core` | everything below, re-exported |
| `@aldus-palace/core/domain` | object types and enums |
| `@aldus-palace/core/db/port` | the `SqlDatabase` contract + `nowIso` |
| `@aldus-palace/core/db/migrate` | `applySchema`, `migrate`, `initialize` |
| `@aldus-palace/core/db/schema` | `SCHEMA_SQL` — the canonical DDL |
| `@aldus-palace/core/db/sqlite` | bundled SQLite adapter (optional `better-sqlite3` peer) |
| `@aldus-palace/core/providers` | `LLMProvider`, dev / OpenAI-compatible / Anthropic |

## Providers

```ts
import { DevLLMProvider, createLLMProvider, resolveProviderConfig } from "@aldus-palace/core/providers";

new DevLLMProvider();                                   // deterministic, offline, no key
createLLMProvider({ kind: "anthropic", apiKey: "…" });  // Messages API
createLLMProvider(resolveProviderConfig(process.env));  // auto: key if present, else dev
```

## Guarantees worth knowing

- **Raw input is immutable.** Models fill derived fields; `raw_inputs` is never rewritten.
- **Failures degrade, they don't lose data.** A bad model response leaves the
  deterministic result in place.
- **Concurrency is safe.** Background enrichment is leased; a superseded writer
  cannot overwrite a newer result ([ADR 0003](../../docs/adr/0003-progressive-capture-with-enrichment-leases.md)).
- **Memory is never activated silently.** Candidates require a human confirmation;
  replacements keep their history.
- **Migrations are forward-only** and versioned in `schema_migrations`.

## Documentation

- [Capabilities](../../docs/CAPABILITIES.md) — what each module promises
- [Architecture](../../docs/ARCHITECTURE.md) — the runtime and the storage port
- [Domain schema](../../docs/DOMAIN-SCHEMA.md) — objects and invariants
- [Examples](../../examples) — runnable, one per capability group

## Module format

ESM. `import` works everywhere; `require()` works on Node ≥ 22.12 via
`require(esm)`.

## Status

`0.x` — usable and tested; the API may still change between minor versions.

Apache-2.0.
