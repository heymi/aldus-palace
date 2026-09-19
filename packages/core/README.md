# @aldus-palace/core

> **The user typed a paragraph. Somewhere in it there is a task, a decision and a
> thing worth keeping. Your database needs all three, typed.**

```bash
npm install @aldus-palace/core
```

---

**The moment.** Week one of building anything that takes natural-language input.
A user types *“Ship the onboarding page next week, and I keep going back and forth
on pricing.”* One task, two tasks, a note, a decision? You guess, and you ship the
guess. Three weeks later the model produces shapes your tables cannot hold, the
same task exists three times, and someone asks why the assistant believes the user
prefers minimalism.

**This is that problem, solved and tested.** A domain model for human intent, an
agent that turns free text into typed objects, a memory store that explains what
it keeps, and a scheduling projection with no `overdue` state — with no global
state and nothing to configure.

## How this compares

| The dimension | What you use today | @aldus-palace/core |
|---|---|---|
| What you give it | a form: project, due date, priority, tags | a sentence in your own words; a paragraph yields several records |
| Who decides the shape | you classify, prioritize and schedule | the runtime files the thought, the commitment, the decision and the memory |
| How time works | one due date, and a red label when it passes | four kinds held apart — deadline, availability window, suggested slot, unscheduled — and a missed date becomes a risk you can move |
| How memory behaves | the assistant infers and stores inside that app | confident memories take effect on capture, and each one carries the sentence it came from plus a note saying why it is active |
| Where your words live | summarized into a task or a chat log | kept as you wrote them, with the system's own reading beside them |
| How you verify it | by using it | a deterministic provider runs the pipeline with no network and no API key; 29 suites and 11 fixtures replay each run |

## Why you'd use it

You are about to invent a data model, a prompt pipeline, a duplicate strategy, a
memory policy and a scheduler. Here is what each of those looks like when it is
already decided and tested:

| You would otherwise build | What this provides |
|---|---|
| an object model for thoughts / commitments / decisions | a frozen schema with invariants as `CHECK` constraints, plus forward-only migrations |
| prompt engineering + output validation | one pipeline with server-side gates and a deterministic fallback |
| “wait for the model” UX | local-first capture, then leased background enrichment |
| an assistant memory policy | a gate, candidates, evidence, conflicts, versioning, levels, decay and an explanation on every activation |
| a scheduler | four kinds of time, blocked-by dependencies, a daily buffer, duration estimation, risk in place of overdue, adaptive daily limits |
| an approval policy for agent actions | a published risk table, a trust score and earned autonomy capped by the user (`services/actionGate.ts`) |
| a privacy layer for model calls | redaction by data level, permission scopes with Memory private by default, and true deletion |

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

## The system behind it

Four engines. A model can contribute to understanding and to conflict detection,
and each engine has a path that runs without one.

```
input          raw text, stored as written
      |
understanding  intent, typed objects, resolved dates, gates
      |
memory         candidates, evidence, confirmation, conflicts, versions
      |
planning       four kinds of time, today, risk, adaptive limits
      |
context        active memories and projects feed the next capture
```

| Engine | Its job | Where it lives |
|---|---|---|
| **Understanding** | reads a sentence, decides the object mode, resolves dates, skips duplicates, falls back when a model fails | `agent/understand.ts` |
| **Memory** | proposes candidates, filters noise, detects contradictions, versions beliefs, grades and decays them, ranks retrieval | `lib/memoryExtract.ts`, `lib/memoryActivation.ts`, `lib/memoryValue.ts`, `services/memoryLifecycle.ts`, `services/memoryEvolution.ts` |
| **Planning** | holds four kinds of time apart, respects dependencies, sizes slots, keeps a buffer, migrates slipped work, scores Now, assembles Today, flags risk, adapts the daily limit | `services/today.ts`, `planToday.ts`, `adaptivePlanning.ts`, `workMigration.ts`, `dependencies.ts`, `replan.ts`, `lib/nowScore.ts`, `lib/dayPlan.ts` |
| **Trust & autonomy** | grades every proposed agent action, records the decision, and widens autonomy as trust is earned | `services/actionGate.ts` |
| **Model** | one provider interface, three implementations, configuration resolved by the caller | `providers/` |

### The memory pipeline

```
capture -> extraction -> candidate -> evaluation -> conflict check -> storage -> activation -> retrieval
```

- **Extraction** reads durability markers and repeated behaviour; rules run with no model.
- **Evaluation** drops a temporary state, a one-off creative fragment and a low-confidence guess.
- **Activation** follows one published rule: `confidence >= 0.8` and `importance >= 0.8`; everything below waits as a candidate.
- **Conflict check** reports a contradiction instead of storing both beliefs.
- **Retrieval** injects active memories into the next capture and logs the injection.

### Three rules that keep memory honest

1. **A mood does not become a profile entry.** "I'm tired today" is dropped before storage.
2. **One inference does not make a principle.** A principle the system inferred waits for confirmation, whatever its score.
3. **Every memory carries evidence.** The sentence it came from, a confidence value, and a note that says whether you stated it or the system inferred it.

## Providers

```ts
import { DevLLMProvider, createLLMProvider, resolveProviderConfig } from "@aldus-palace/core/providers";
import { createMessageGuard, resolvePrivacyLevel } from "@aldus-palace/core";

new DevLLMProvider();  // deterministic, offline, no key

const guard = createMessageGuard(db, user.id, {
  level: resolvePrivacyLevel(process.env),   // default 2
});
createLLMProvider({ kind: "anthropic", apiKey: "…" }, guard);  // Messages API
createLLMProvider(resolveProviderConfig(process.env), guard);  // auto: key if present, else dev
```

A cloud provider is only built with a guard. The guard redacts user content by
data level before it leaves, refuses level 4, and writes one audit row per call;
`dev` runs on the device and needs no guard.

## Guarantees worth knowing

- **Raw input is immutable.** Models fill derived fields; `raw_inputs` stays as written.
- **Failures degrade, they don't lose data.** A bad model response leaves the
  deterministic result in place.
- **Concurrency is safe.** Background enrichment is leased; a superseded writer
  cannot overwrite a newer result ([ADR 0003](../../docs/adr/0003-progressive-capture-with-enrichment-leases.md)).
- **Memory explains every activation.** A rule you state takes effect on capture;
  an inference waits for confirmation. Every row carries its evidence and a note
  that says which. Replacements keep their history, and levels and decay weigh
  retrieval.
- **The agent asks before it oversteps.** A published risk table grades every
  proposed action; trust is the approval rate of your decisions, and autonomy
  never widens past the ceiling you set.
- **Privacy is a mechanism.** A cloud call is redacted by data level, Memory is
  private until a scope is granted, and `purgeUserData` deletes every row you
  own in one transaction.
- **Content follows the user.** Receipts, warnings, memory contents and Today
  labels are written in `users.language`; machine keys stay stable.
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
