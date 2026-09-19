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

## What it does

**It reads a sentence and sorts it.** Write "Client visit moved to next
Wednesday, and pricing still bugs me." You get three records: a commitment with
the date the system worked out, a thought filed under the right project, and a
note that the decision stays open.

**It catches repeats.** Repeat yourself and the system points at the first record.

**It remembers the rules you state.** "From now on, keep the product simple"
becomes a rule the system follows. One tap in the memory list archives it.

**It shows its work.** Every memory carries the sentence you said, the
confidence behind it, and a note that says whether you stated it or the system
inferred it.

**It follows you.** One file. Claude, Cursor, a web page you build, a script you
write.

## What it guarantees

**A missed date becomes a risk you can move.** Deadlines, available windows and
suggested times live as three separate things.

**A passing mood stays out of your profile.** Say that a screen annoys you and
the system keeps nothing.

**Your new decision replaces the old one.** The old record stays on file, with
the reason for the change.

**Your words stay in the file as you wrote them.** The system keeps your sentence
beside the version it understood.

**The whole record sits in one file on your machine.** Copy it, move it, hand it
to another assistant.

**You state intent. The system files it.** No projects, no priorities, no "task
or note?".

## Compare

| Today | Here |
|---|---|
| A to-do app: you file, tag, date and prioritize; overdue labels in red | You write a sentence; the system files it; a missed date is a risk |
| An assistant memory: closed box, one app, no export | A file you own, readable, searchable, portable |
| Both at once: two silos | One record, shared by every client |

## Build with it

The features above ship as three surfaces: a TypeScript library, an HTTP API, and
an MCP server for Claude, Cursor and other MCP clients. Open source under
Apache-2.0. Offline mode runs with no API key.

---

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
interface as the model-backed ones. 14 test suites and the acceptance fixtures run
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

`0.x`. Single-user and self-hosted by design. See [SECURITY.md](SECURITY.md)
before exposing an instance.

## Contributing

Fixtures, docs and focused fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
Commits carry a DCO sign-off (`git commit -s`).

## License

[Apache-2.0](LICENSE).
