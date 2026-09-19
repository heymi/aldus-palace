# 1. Schema & domain

> **The hardest part of an AI assistant isn't the AI. It's deciding what a thing is.**

**The moment.** Week one. A user types “push the launch to Friday, and I keep
going back and forth on pricing.” You now have to decide: is that one task, two
tasks, a note, a decision, an event? You pick something, ship it, and three weeks
later the model starts producing shapes your tables cannot hold.

**What you get.** A frozen domain model for human intent — and the migrations to
evolve it safely:

| Object | What it holds |
|---|---|
| **Thought** | an idea, insight, observation, research note or decision candidate |
| **Commitment** | something the user intends to get done, with four kinds of time |
| **Decision** | a choice *and why it was made*; can be superseded or retracted |
| **Memory** | durable personal context — active through the gate or a candidate waiting, always versioned |
| **Concept** | a reusable cognitive node (“simplicity”, “privacy”) memories attach to |
| **Project** | a context container with a free-form brief used to ground understanding |
| **RawInput** | the immutable record of what the user actually said |
| **ActionLog** | every mutation, with actor, reason and reversibility |

The runtime tables sit beside them: `commitment_dependencies` for blocked-by
edges, `action_proposals` for the Action Gate, `autonomy_settings` for the
earned-autonomy ceiling, `permission_grants` for scopes, `clarifications` for
pending questions and `classification_signals` for what a correction taught the
classifier (ADR 0012). `commitments` carries `deferral_count` and
`migration_surfaced_at` for slipped work.

Three ideas are baked into the design rather than added later:

- **Raw input is sacred.** Models fill derived fields; the original text is never rewritten.
- **Time is a scheduling result, not a task attribute.** `deadline`, `window_*`
  and `ai_slot_*` are separate columns.
- **There is no `overdue` status.** A missed date becomes `risk`.

**Who this is for.** Anyone storing “things a person intends to do or remember”
— and anyone tired of redesigning that schema on the third iteration.

## See it in 30 seconds

```bash
pnpm gen:spec && head -60 spec/schema.sql
```

The canonical DDL is `packages/core/src/db/schema.ts`; `spec/schema.sql` is
generated from it and verified in CI, so the readable copy cannot drift.

## Use it as

- **Library** — `@aldus-palace/core/domain` for types,
  `@aldus-palace/core/db/{schema,migrate}` for the DDL and migrations.
- **HTTP / MCP** — the schema is the contract behind both.

```ts
import { initialize } from "@aldus-palace/core";
await initialize(db);   // idempotent DDL + forward-only migrations
```

### The storage port

```ts
interface SqlDatabase {
  prepare(query: string): { all(...b): Promise<unknown[]>; get(...b): Promise<unknown>;
                            run(...b): Promise<{ changes: number }> };
  exec(query: string): Promise<void>;
  transaction<T>(cb: () => Promise<T>): () => Promise<T>;
}
```

Async by design, so an asynchronous driver (Postgres) can implement it later
without a breaking change. `@aldus-palace/core/db/sqlite` wraps `better-sqlite3`
and caches prepared statements; `apps/server` adds a Cloudflare Durable Object
adapter — both satisfy the same contract.

## Proof

- `packages/core/src/db/schema.ts` — the canonical DDL, with invariants as `CHECK` constraints
- `packages/core/src/db/migrate.ts` — forward-only, versioned in `schema_migrations`
- `apps/server/test/commitmentClassification.test.ts` — replays a legacy database through the migrations
- `pnpm spec:check` — CI fails if `spec/schema.sql` is stale
