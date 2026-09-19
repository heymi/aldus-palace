# @aldus-palace/core

> **The user typed a paragraph. Somewhere in it there is a task, a decision and a
> thing worth keeping. Your database needs all three, typed.**

```bash
npm install @aldus-palace/core
```

---

**The moment.** Week one of building anything that takes natural-language input.
A user types *“push the launch to Friday, and I keep going back and forth on
pricing.”* One task, two tasks, a note, a decision? You guess, and you ship the
guess. Three weeks later the model produces shapes your tables cannot hold, the
same task exists three times, and someone asks why the assistant believes the user
prefers minimalism.

**This is that problem, solved and tested.** A domain model for human intent, an
agent that turns free text into typed objects, a memory store that explains what
it keeps, and a scheduling projection with no `overdue` state — with no global
state and nothing to configure.

## Why you'd use it

You are about to invent a data model, a prompt pipeline, a duplicate strategy, a
memory policy and a scheduler. Here is what each of those looks like when it is
already decided and tested:

| You would otherwise build | What this provides |
|---|---|
| an object model for thoughts / commitments / decisions | a frozen schema with invariants as `CHECK` constraints, plus forward-only migrations |
| prompt engineering + output validation | one pipeline with server-side gates and a deterministic fallback |
| “wait for the model” UX | local-first capture, then leased background enrichment |
| an assistant memory policy | candidates, evidence, conflicts, versioning, and no silent activation |
| a scheduler | four kinds of time, risk in place of overdue, adaptive daily limits |

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

The runtime reads no environment variables, holds no module-level state, and imports no
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

- **Raw input is immutable.** Models fill derived fields; `raw_inputs` stays as written.
- **Failures degrade, they don't lose data.** A bad model response leaves the
  deterministic result in place.
- **Concurrency is safe.** Background enrichment is leased; a superseded writer
  cannot overwrite a newer result ([ADR 0003](../../docs/adr/0003-progressive-capture-with-enrichment-leases.md)).
- **Memory explains every activation.** A rule you state takes effect on capture;
  an inference waits for confirmation. Every row carries its evidence and a note
  that says which. Replacements keep their history.
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
