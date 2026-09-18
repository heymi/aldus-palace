# Aldus Palace

[![CI](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml/badge.svg)](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml)
[![npm core](https://img.shields.io/npm/v/%40aldus-palace%2Fcore?label=core)](https://www.npmjs.com/package/@aldus-palace/core)
[![npm mcp](https://img.shields.io/npm/v/%40aldus-palace%2Fmcp?label=mcp)](https://www.npmjs.com/package/@aldus-palace/mcp)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

> ### Drop in the capabilities you'd otherwise build yourself.
> **A self-hosted commitment, memory and planning runtime — usable over MCP, over HTTP, or as a library.**

You speak or type. The runtime decides what it is — a thought, a commitment, a
decision, something worth remembering — when it is due, whether you have said it
before, and whether it contradicts something it already believes about you. It
stores all of it in a database you own.

Not a todo app. Not a calendar. Not a note editor. Tasks and calendar entries are
*projections* of deeper objects.

---

## Three ways in

| | You write | Use it for |
|---|---|---|
| **MCP** | a JSON config block | using it inside Claude, Cursor or any MCP client |
| **HTTP** | `curl` or `fetch` | your own frontend, or a non-JavaScript stack |
| **Library** | TypeScript | embedding the runtime in your product |

```bash
# MCP — zero code
npm install -g @aldus-palace/mcp
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"

# HTTP — one command
cp .env.example .env && docker compose up --build
curl localhost:8787/health

# Library — offline, no key
pnpm install && pnpm test && pnpm eval
```

→ **[docs/INTEGRATION.md](docs/INTEGRATION.md)** for the full walk-through.

---

## What you get

Nine capabilities. Use one, or all of them.

| Capability | You don't have to build | Reach it via |
|---|---|---|
| [Schema & domain](docs/capabilities/01-schema-and-domain.md) | the object model for human intent, with migrations | library |
| [Providers](docs/capabilities/02-providers.md) | model abstraction + a deterministic provider, so agents are testable | library |
| [Understanding Agent](docs/capabilities/03-understanding.md) | prompt engineering, output validation, dedupe, date resolution | `capture` · `POST /v1/inputs` |
| [Progressive capture](docs/capabilities/04-progressive-capture.md) | concurrency, retry and crash-safety around background LLM enrichment | `capture` |
| [Memory](docs/capabilities/05-memory.md) | a confirm-and-evidence gate that also versions what it learns | `memory` · `/v1/memories` |
| [Today & planning](docs/capabilities/06-today-and-planning.md) | scheduling heuristics, risk detection, adaptive daily limits | `today` · `GET /v1/today` |
| [Work streams](docs/capabilities/07-work-streams.md) | grouping that is rebuildable and never touches the source of truth | `workstreams` |
| [HTTP API](docs/capabilities/08-http-api.md) | the REST layer, storage adapters and deployment | 40+ routes |
| [MCP server](docs/capabilities/09-mcp.md) | the Model Context Protocol surface and tool selection | `@aldus-palace/mcp` |

Each capability service depends only on the storage port, the domain types and
pure helpers — **there are no dependencies between the services themselves**, so
“use just this one” is real.

---

## Why it's different

**1 · Delete “overdue” from your vocabulary.**
Time is not an attribute of a task; it is the result of scheduling. Four kinds of
time are modelled separately — deadline, availability window, AI-suggested slot,
and nothing yet — and a missed date becomes a **risk**, never a guilt label.
There is no `overdue` status in the schema.

**2 · Memory you can audit — and that knows when you changed your mind.**
Candidates need confirmation. Every memory carries its evidence excerpt, a
confidence value and the input it came from. Temporary moods are rejected before
storage. Contradictions are flagged. Replacing a belief keeps the old version
readable, so *“why do you think that about me?”* always has an answer.

**3 · The raw input is never rewritten.**
Everything you say is stored verbatim; models only fill derived fields, and every
write passes server-side gates. You can always diff what you said against what
the system stored.

Plus two that developers feel immediately: enrichment that is safe under retries
and crashes ([ADR 0003](docs/adr/0003-progressive-capture-with-enrichment-leases.md)),
and a pipeline that **runs green in CI with no API key** — eleven test suites and
replayable acceptance fixtures, offline.

→ **[docs/POSITIONING.md](docs/POSITIONING.md)** for the honest comparison with
todo apps, PKM tools, assistant memory and calendar schedulers.

---

## Try it in 60 seconds

```bash
git clone https://github.com/heymi/aldus-palace.git && cd aldus-palace
pnpm install

pnpm test     # 11 suites — deterministic, offline, no API key
pnpm eval     # acceptance fixtures — the behaviour this project promises

pnpm --filter @aldus-palace/example-understanding-only start
pnpm --filter @aldus-palace/example-memory-gate-only start
pnpm --filter @aldus-palace/example-today-only start
```

`dev` is the default provider: deterministic rules, no network. Point
`LLM_PROVIDER` at Anthropic, DeepSeek or any OpenAI-compatible endpoint for full
understanding quality — the offline mode is what makes the runtime testable, not
a degraded fallback.

---

## Documentation

| Doc | What's in it |
|---|---|
| [INTEGRATION.md](docs/INTEGRATION.md) | the three levels, with copy-paste configs |
| [CAPABILITIES.md](docs/CAPABILITIES.md) | the nine capabilities and their contracts |
| [USE-CASES.md](docs/USE-CASES.md) | five things people build with this |
| [POSITIONING.md](docs/POSITIONING.md) | the three differentiators, and what this is not |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | the runtime, module boundaries, storage port |
| [DOMAIN-SCHEMA.md](docs/DOMAIN-SCHEMA.md) | objects, invariants, memory evolution |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | local, edge, embedded, backups |
| [EVAL.md](docs/EVAL.md) | how to run and extend the acceptance fixtures |
| [PROGRESSIVE-CAPTURE.md](docs/PROGRESSIVE-CAPTURE.md) | the enrichment-lease pattern, written to be copied |
| [adr/](docs/adr) | decisions already made, and why |

## Repository layout

```
packages/core          domain, agent runtime, storage port, migrations, providers
packages/mcp           MCP server (stdio) — profiles, local + HTTP backends
apps/server            Hono reference server (local SQLite + Cloudflare Durable Object)
examples/              five runnable examples, one per capability group
spec/schema.sql        generated, readable schema (CI-checked)
eval/fixtures          acceptance scenarios
docs/                  everything above
```

## Status

`0.x` — the API and the runtime are usable and tested, and may still change
between minor versions. Single-user and self-hosted by design; see
[SECURITY.md](SECURITY.md) before exposing an instance.

## Contributing

Fixtures, docs and focused fixes are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Commits are accepted under the DCO
(`git commit -s`).

## License

[Apache-2.0](LICENSE).
