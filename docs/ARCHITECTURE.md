# Architecture

## The loop

```
raw input ──► understanding ──► structured objects ──► ActionCard
                                        │
                                        ├─► Today (planning projection)
                                        ├─► Work streams (rebuildable projection)
                                        └─► Memory candidates (require confirmation)
```

Every step is a pure function over the storage port plus an `LLMProvider`, so the
whole loop is testable offline.

## Progressive capture

The most distinctive part of the runtime. A single capture produces **two
passes**:

1. **Local pass** (`mode: "local"`) — deterministic rules write Thoughts,
   Commitments, Decisions and Memory candidates immediately. The client can
   render a real ActionCard within milliseconds.
2. **AI pass** (`mode: "full"`) — the model re-parses the *original* input and
   replaces the local derivatives.

The hand-off is coordinated by an **enrichment lease**:

| Column | Purpose |
|---|---|
| `processing_generation_id` | identifies the current writer; a stale worker cannot overwrite a newer one |
| `processing_lease_until` | a crashed worker's lease expires and becomes reclaimable |
| `result_generation_id` | records which generation produced the stored result |

`claimEnrichment` returns `null` when another generation holds a live lease, so
concurrent enrich calls are safe by construction. See
[ADR 0003](adr/0003-progressive-capture-with-enrichment-leases.md) and
`packages/core/src/services/enrichmentLease.ts`.

## Module boundaries

```
packages/core/src
├── domain/types.ts      object types + enums (no I/O)
├── db/port.ts           the storage port (async, no globals)
├── db/schema.ts         canonical DDL (single source of truth)
├── db/migrate.ts        applySchema / migrate / initialize (forward-only)
├── providers/           LLMProvider implementations + config resolution
├── lib/                 pure helpers (time, titles, matching, memory filters)
├── services/            domain services (planning, classification, today, leases)
├── repos/               thin data access (users, action log)
└── agent/understand.ts  the Understanding Agent: input → objects → ActionCard
```

`packages/core` never imports Express/Hono/Workers APIs and never reads
`process.env`. Configuration and I/O are owned by the caller.

### The storage port

```ts
interface SqlDatabase {
  prepare(query: string): SqlStatement;       // all/get/run → Promise
  exec(query: string): Promise<void>;
  transaction<T>(cb: () => Promise<T>): () => Promise<T>;
}
```

It is deliberately **async** so an asynchronous driver (Postgres) can implement
it later without a breaking change. Both bundled adapters wrap synchronous
engines and therefore resolve immediately:

- `apps/server/src/db/local.ts` — `better-sqlite3`
- `apps/server/src/db/durableObject.ts` — Cloudflare Durable Object SQLite

## Agent responsibilities

`understand.ts` is the only place that talks to a model, and it treats the model
as a *proposer*, not an authority:

1. Build context: registered projects (name + description + aliases + brief) and
   confirmed memories.
2. Ask for strict JSON and validate it with `zod`. Malformed numbers are coerced;
   malformed structure falls back to the local rule engine.
3. Enforce invariants the model cannot be trusted with:
   - one object mode per capture (thought / commitment / mixed)
   - near-duplicate commitments are skipped
   - relative dates (`明天`, “next Friday”) are resolved server-side, and
     ambiguous early-morning phrases produce a clarification instead of a guess
   - memories are *candidates* until the user confirms them
4. Write an `action_log` entry for every mutation so behaviour stays explainable.

## Runtime targets

| Target | Entry point | Storage |
|---|---|---|
| Node | `apps/server/src/index.ts` | local SQLite file |
| Cloudflare Workers | `apps/server/src/worker.ts` | one named Durable Object (SQLite) |

Both call the same `createApp({ db, llm, config })` factory, so the HTTP surface
is identical. The Worker migrates inside `blockConcurrencyWhile` on first use.
The single Durable Object is intentional for a single-user product and is not
horizontally partitioned — see [SECURITY.md](../SECURITY.md).
