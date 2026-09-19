# Aldus Palace

[![CI](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml/badge.svg)](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml)
[![npm core](https://img.shields.io/npm/v/%40aldus-palace%2Fcore?label=core)](https://www.npmjs.com/package/@aldus-palace/core)
[![npm mcp](https://img.shields.io/npm/v/%40aldus-palace%2Fmcp?label=mcp)](https://www.npmjs.com/package/@aldus-palace/mcp)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

![A capture session](docs/assets/capture-session.svg)

**Write what you need to do. The system decides what it is, when it matters, and
what to remember about you.**

---

A to-do list asks you to file, tag, date and prioritize every item. The list
grows. The managing becomes the work.

An AI assistant remembers things about you. That memory sits in a closed box. You
read it through one app, and you move it nowhere.

Aldus Palace holds one place for what you need to do. You write a sentence. The
system does the filing.

```
input ──► understanding ──► objects ──────────► projections
          dates, gates      thought             today
          dedupe            commitment          work streams
          fallback          decision            memory context
                            memory
```

## What it does

**It reads a sentence and sorts it.** Write "Ship the onboarding page next week"
and you get one commitment, with the date worked out. No project picker, no
priority field, no due-date calendar. Paste a paragraph and you get several
objects: thoughts, commitments, decisions, memory candidates.

**It catches repeats.** Repeat yourself and the system points at the first record.

**It remembers the rules you state.** "I prefer simple tools" lands as a rule the
system follows from the next capture onward. The memory list archives it.

**It shows its work.** Every memory carries the sentence you said, the
confidence behind it, and a note that says whether you stated it or the system
inferred it.

**It follows you.** One file, one API. Claude, Cursor, your own frontend, a script
you write.

## How this compares

| The dimension | What you use today | Aldus Palace |
|---|---|---|
| **What you give it** | a form: project, due date, priority, tags | a sentence in your own words; a paragraph yields several records |
| **Who decides the shape** | you classify, prioritize and schedule | the runtime files the thought, the commitment, the decision and the memory |
| **How time works** | one due date, and a red label when it passes | four kinds held apart — deadline, availability window, suggested slot, unscheduled — and a missed date becomes a risk you can move |
| **How memory behaves** | the assistant infers and stores inside that app | confident memories take effect on capture, and each one carries the sentence it came from plus a note saying why it is active |
| **Where your words live** | summarized into a task or a chat log | kept as you wrote them, with the system's own reading beside them |
| **What the daily view answers** | a list of everything | what to do now, what is at risk, what is unscheduled; a full day gets a rest suggestion |
| **How many stores you have** | one per app | one record, reached by MCP, HTTP and a library: Claude, Cursor, your own frontend, a script |
| **Where the record sits** | a vendor cloud | a SQLite file you own, or a Cloudflare Worker; copy it, back it up, hand it on |
| **How you verify it** | by using it | a deterministic provider runs the pipeline with no network and no API key; 15 suites and 11 fixtures replay each run |

## Designed scope

- **One user.** One person, one database, one bearer token. Run one instance per
  person.
- **One writer per SQLite file.** Two processes on the same file fight over the
  write lock. Point extra clients at the HTTP API.
- **No client interface.** The surfaces are MCP, HTTP and the library. You bring
  the screen.
- **No sync.** The file does not merge with a second copy.
- **No external actions.** The runtime records intent and plans. It sends no mail,
  posts nothing and pays nobody.
- **Offline mode recognises a narrow set of phrasings.** The deterministic
  provider handles commands, stated rules and a few date forms, in English and
  Chinese. Connect a model for general understanding; the receipts show which
  provider produced them.

## Build with it

Three surfaces, one schema, open source under Apache-2.0. Offline mode runs with
no API key.

**Library**

```ts
import { DevLLMProvider, ensureDevUser, initialize, newId, nowIso,
         processRawInput } from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const db = await openSqliteDatabase("./aldus.db");
await initialize(db);                              // canonical DDL + migrations
const user = await ensureDevUser(db, { name: "Me", timezone: "UTC", language: "en" });

const id = newId("inp");
const text = "Ship the onboarding page next week";
await db.prepare(`INSERT INTO raw_inputs
  (id, user_id, content, source, processing_status, created_at, updated_at)
  VALUES (?, ?, ?, 'text', 'pending', ?, ?)`)
  .run(id, user.id, text, nowIso(), nowIso());

const card = await processRawInput(db, new DevLLMProvider(), user, id, "local");
console.log(card.summary);        // Captured · 1 commitment
console.log(card.commitments);    // one commitment, window_start / window_end resolved
```

**MCP** — inside Claude, Cursor or any MCP client

```bash
npm install -g @aldus-palace/mcp
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"
```

**HTTP** — self-hosted, SQLite in a volume

```bash
cp .env.example .env && docker compose up --build
curl -X POST localhost:8787/v1/inputs \
  -H 'Authorization: Bearer dev-local-token' -H 'Content-Type: application/json' \
  -d '{"content":"Ship the onboarding page next week","mode":"sync"}'
```

---

## Scale

`packages/core` is 9,169 lines of TypeScript: 20 tables, 45 HTTP routes, 109
exports, 7 MCP tools, 5 runnable examples. **Requirements:** Node 20 or newer.
`better-sqlite3` ships prebuilds for common platforms; other platforms need a C
toolchain.

## The system behind it

The runtime runs as a pipeline, and the Core Intelligence Layer organises it into
four engines. Understanding — the capture front end in `agent/understand.ts` —
turns a sentence into typed objects; the engines decide what is kept, what
happens next, what the system may do on its own, and which model is used. A model
can contribute to understanding and to conflict detection, and every engine has a
path that runs without one. Each engine ships today and has a designed
extension — the shipped parts name the file they live in, and the full design is
mapped in [`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md).

```
user / environment
      |
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
| **Memory** | proposes candidates, filters noise, detects contradictions, versions beliefs, retrieves context | `lib/memoryExtract.ts`, `lib/memoryActivation.ts`, `services/memoryLifecycle.ts`, `services/memoryEvolution.ts` |
| **Planning** | holds four kinds of time apart, assembles Today, flags risk, adapts the daily limit | `services/today.ts`, `planToday.ts`, `adaptivePlanning.ts` |
| **Trust & autonomy** | decides what the system may do without asking, and widens that as trust is earned | designed — [`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md) |
| **Model orchestration** | one provider interface, three implementations, configuration resolved by the caller | `providers/` |

### Memory Intelligence Engine

*Understand a person over years, not store a chat log.*

**Shipped today** — extraction reads durability markers ("from now on", "as a
rule") and repeated behaviour; evaluation drops a temporary state, a one-off
creative fragment and a low-confidence guess; activation follows one published
rule (`confidence >= 0.8` and `importance >= 0.8`); every row carries the
evidence it came from; duplicates collapse; contradictions surface; a replaced
belief is `superseded`, never deleted; active memories are injected into the next
capture and every injection is logged. Five kinds ship.

**Designed next** — a graded model (raw experience → observation → preference →
principle → identity), decay by kind, the full value score (explicitness +
frequency + impact + scope + future relevance), more kinds (goal, relationship,
knowledge, habit, episode), the impact and scope extraction signals, and a memory
graph with retrieval ranking.

### The memory pipeline

```
capture -> extraction -> candidate -> evaluation -> conflict check -> storage -> activation -> retrieval
```

- **Extraction** reads two signals: durability markers ("from now on", "as a rule") and repeated behaviour. Rules run with no model; a model adds general understanding.
- **Evaluation** drops what should not be remembered: a temporary state, a one-off creative fragment, a low-confidence guess.
- **Activation** follows one published rule: `confidence >= 0.8` and `importance >= 0.8`. Everything below that waits as a candidate.
- **Conflict check** compares a candidate against active memories on the same dimension and reports the contradiction instead of storing both.
- **Retrieval** injects active memories into the next capture, so understanding improves with use. Each injection lands in the action log.

### Three rules that keep memory honest

1. **A mood does not become a profile entry.** "I'm tired today" is dropped before storage.
2. **One inference does not make a principle.** A principle the system inferred waits for confirmation, whatever its score.
3. **Every memory carries evidence.** The sentence it came from, a confidence value, and a note that says whether you stated it or the system inferred it.

### Planning Intelligence Engine

*Turn understanding into things happening — when and in what order work occurs in
the real world, without a pretty calendar to maintain.*

**Shipped today** — planning works on Commitments and reads the calendar and a
learned behaviour model. Four kinds of time stay apart (deadline, availability
window, suggested slot, unscheduled; there is no `overdue`), and constraints are
honoured concretely: a deadline sets the hard boundary and risk tiers, a window
bounds eligibility, a project preference is learned. Priority scoring combines
risk, deadline proximity, recent-project continuity, importance and learned
preferences. `findSlot` generates real candidate windows and takes the next free
one, which is how a scheduling conflict is avoided; scheduling writes the slot
with a reason. Execution is monitored as feedback episodes, and a reconcile pass
replans, triggered by the plan endpoint or a new commitment arranged for today. A
day gets Now, timeline, risks, unscheduled, adaptive limits (5, or 10) with stall
detection and a rest suggestion, and a light triage that prefers concrete bugs
and small work. `today.ts` · `planToday.ts` · `adaptivePlanning.ts`

**Designed next** — the full pipeline (constraint analysis → priority → time
windows → schedule optimization → conflict resolution → replanning); a constraint
model (hard, soft, preference, dependency); a dynamic priority score (impact ×
urgency × dependency × goal alignment × risk); duration estimation from history;
schedule optimization with an explicit context-switch cost; a morning core /
optional / deferred plan; Now as the best current action (priority × available
time × energy match × context match); replanning triggers; a daily buffer that
keeps part of the day free; and task migration (flexible, unstarted work can move
forward, and repeated deferrals surface for a decision).

### Trust & Autonomy Engine

*Widen what the system may do on its own, safely.*

**Shipped today** — one fixed rule: a capture lands on its own, a principle the
user states takes effect, and everything else waits for the user.

**Designed next** — an action risk model, autonomy levels 0–4, a trust score
accumulated from outcomes, and permission evolution.

### Model Orchestration Engine

*Use the right model for each job, instead of one model for every call.*

**Shipped today** — one `LLMProvider` interface and three implementations (dev,
OpenAI-compatible, Anthropic); configuration is resolved by the caller.
`providers/`

**Designed next** — routing by task: a fast model for classification, a reasoning
model for planning and conflict, embeddings for memory retrieval, and a local
model for sensitive input.

### Privacy is the architecture

*The system touches work, decisions, relationships and habits; privacy is the
shape of it, not a feature on top.*

**Shipped today** — a SQLite file you own (or one Cloudflare Durable Object), a
single-user runtime, immutable `raw_inputs`, model output validated and gated, an
`action_log` entry on every mutation, and a memory gate that confident, stated
memories pass on capture while an inference waits for you. [`SECURITY.md`](SECURITY.md)
records the posture and the current threat model.

**Designed next** — three principles (you own the context; minimum data exposure;
local first); five data levels; a local intelligence layer; a Privacy Gateway
with redaction; local encrypted storage (Keychain / Secure Enclave); progressive,
fine-grained permissions with Memory private by default; an Action Gate with four
risk levels and a viewable, revocable audit log; and a delete policy that reaches
the local database, cloud sync and vector indexes.

## Where the difficulty lives

**Models return text. Code needs records.** A model writes `"0.8"` where you
asked for a number, invents a date, or stores one task under two titles. The
runtime validates each answer, skips duplicates and resolves dates on the server.
A failed answer leaves the previous record in place.

**The slow path breaks products.** A user waits on a model and loses interest. A
background model meets retries, two clients writing at once, and records stuck
mid-update after a crash.

**Memory is a liability.** Store the first inference and the user owns a
personality from one remark. Replace the old record and the history disappears.

**A paid test gets skipped.** Calling an API to check extraction is a test nobody
repeats. The runtime ships a deterministic provider, so the pipeline runs offline.

## What the code enforces

**`overdue` has no state to occupy.** A deadline, an availability window and an
AI-suggested slot live in three fields. A missed date becomes a risk you can move.
`packages/core/src/db/schema.ts`

**Memory explains itself.** A rule you state takes effect on capture. An
inference waits for confirmation. Every row carries the evidence and a note that
says which. `lib/memoryActivation.ts`

**Beliefs carry versions.** State the opposite of a confirmed belief and the
system flags the conflict. The replacement marks the old belief `superseded`,
with a reason, and keeps it readable. `services/memoryEvolution.ts`

**Your sentence stays untouched.** Models fill derived fields. Every write passes
server gates: one object mode per capture, near-duplicates skipped, relative dates
resolved on the server. `agent/understand.ts`

**Background work survives retries.** Local rules produce a result. The model
replaces it under a lease, so two clients, a retry and a dead worker leave the
record intact. `services/enrichmentLease.ts`

**The pipeline runs offline.** A deterministic provider implements the same
interface as the model-backed ones. 15 test suites and 8 acceptance fixtures run
with no key. `providers/dev.ts`

## The one point each capability carries

| Capability | The point |
|---|---|
| Schema & domain | A product stance lives in the constraints: `overdue` has no state to occupy |
| Providers | A deterministic provider shares the interface with the paid ones, so agent logic runs in CI |
| Understanding | The model proposes; the server decides (mode, duplicates, dates, fallback) |
| Progressive capture | A lease and a generation id make "local first, model second" idempotent |
| Memory | A confident memory takes effect on capture, explains itself, and archives on request |
| Today & planning | A day with no plan gets suggestions; a full day gets a rest suggestion |
| Work streams | Grouping is a projection. A rebuild leaves the records as they are |
| HTTP API | One schema, two runtimes: a local SQLite file and a Cloudflare Durable Object |
| MCP server | Runs with no server process, against the same local file |

## See it run

```bash
git clone https://github.com/heymi/aldus-palace.git && cd aldus-palace
pnpm install

pnpm test     # 15 suites — deterministic, offline, no API key
pnpm eval     # 8 acceptance fixtures — the behaviour this project promises

pnpm --filter @aldus-palace/example-understanding-only start
pnpm --filter @aldus-palace/example-memory-gate-only start
pnpm --filter @aldus-palace/example-today-only start
```

Each example prints the records it stored and the reasoning behind them, with no
API key and no network.

## Install

| Surface | Command |
|---|---|
| MCP | `npm install -g @aldus-palace/mcp` |
| HTTP | `cp .env.example .env && docker compose up --build` |
| Library | `npm install @aldus-palace/core` |

## Documentation

| Doc | Contents |
|---|---|
| [INTEGRATION.md](docs/INTEGRATION.md) | the three levels, with copy-paste configs |
| [CAPABILITIES.md](docs/CAPABILITIES.md) | the nine capabilities and their contracts |
| [USE-CASES.md](docs/USE-CASES.md) | five things people build with this |
| [POSITIONING.md](docs/POSITIONING.md) | differentiation, and the designed scope |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | the runtime, module boundaries, storage port |
| [INTELLIGENCE.md](docs/INTELLIGENCE.md) | the four engines and the privacy design, shipped vs planned |
| [DOMAIN-SCHEMA.md](docs/DOMAIN-SCHEMA.md) | objects, invariants, memory evolution |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | local, edge, embedded, backups |
| [EVAL.md](docs/EVAL.md) | the acceptance fixtures, and how to add one |
| [PROGRESSIVE-CAPTURE.md](docs/PROGRESSIVE-CAPTURE.md) | the enrichment lease, written to be copied |
| [adr/](docs/adr) | decisions already made, and why |

## Repository layout

```
packages/core          domain, agent runtime, storage port, migrations, providers
packages/mcp           MCP server (stdio) — profiles, local and HTTP backends
apps/server            Hono reference server (local SQLite and Cloudflare Durable Object)
examples/              five runnable examples, one per capability group
spec/schema.sql        generated, readable schema (CI-checked)
eval/fixtures          acceptance scenarios
docs/                  everything above
```

## Status

`0.x` — usable and tested; the API may change between minor versions. See
[SECURITY.md](SECURITY.md) before exposing an instance.

## Contributing

Fixtures, docs and focused fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
Commits carry a DCO sign-off (`git commit -s`).

## License

[Apache-2.0](LICENSE).
