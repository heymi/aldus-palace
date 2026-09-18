# Aldus Palace

**A spec-first, provider-agnostic agent runtime that turns free-form input into
structured personal knowledge objects — runs fully offline, tested by replayable
acceptance fixtures.**

> The user expresses intent. The system owns structure, planning and long-term
> memory (with confirmation).

Aldus Palace is not a todo app, a calendar, a note-taking app, or a chatbot
wrapper. Tasks and calendar entries are *projections* of deeper objects:
Thoughts, Commitments, Decisions, Memories, Concepts and Projects.

## Why it exists

Most "AI personal assistant" projects are a prompt wrapped around a database.
This one is the opposite: a **frozen domain model**, an **agent runtime** with a
documented data flow, and **acceptance fixtures** that run without an API key.

Three things make it unusual:

1. **Runs offline.** The bundled `dev` provider is a deterministic rule engine,
   so `pnpm test` and `pnpm eval` are reproducible in CI with zero secrets.
2. **Progressive capture.** Rules produce a usable ActionCard instantly, then a
   background AI pass replaces it under an enrichment lease — generation IDs make
   the hand-off idempotent and supersede-safe (see
   [ADR 0003](docs/adr/0003-progressive-capture-with-enrichment-leases.md)).
3. **Provider-agnostic.** `LLMProvider` is a 9-line interface; DeepSeek and any
   OpenAI-compatible endpoint ship today, and the runtime never reads
   `process.env` behind your back.

## Quick start (no API key)

```bash
git clone https://github.com/heymi/aldus-palace.git
cd aldus-palace
pnpm install
pnpm test          # deterministic suites, offline
pnpm eval          # replayable acceptance fixtures, offline
```

Embed it in ~40 lines:

```bash
pnpm --filter @aldus-palace/example-capture-cli start
```

Run the reference server:

```bash
cd apps/server && cp .env.example .env
pnpm dev           # http://127.0.0.1:8787
curl -X POST http://127.0.0.1:8787/v1/inputs \
  -H 'Authorization: Bearer dev-local-token' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Ship the onboarding page next week","mode":"sync"}'
```

## Repository layout

```
packages/core          domain model, agent runtime, storage port, migrations, providers
apps/server            Hono reference server (local SQLite + Cloudflare Durable Object)
examples/capture-cli   smallest possible embedder
clients/macos          SwiftUI reference client (best effort)
spec/schema.sql        generated, readable schema
eval/fixtures          acceptance scenarios (S04, S05, …)
docs/                  architecture, domain schema, eval guide, ADRs
```

## Documentation

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | agent runtime, module boundaries, storage port, runtime targets |
| [docs/DOMAIN-SCHEMA.md](docs/DOMAIN-SCHEMA.md) | the objects, their fields and invariants |
| [docs/EVAL.md](docs/EVAL.md) | how to run and extend the acceptance fixtures |
| [docs/adr/](docs/adr) | architecture decision records |
| [AGENTS.md](AGENTS.md) | how this repo is developed agent-natively |
| [CONTEXT.md](CONTEXT.md) | ubiquitous language for planning behaviour |
| [GOVERNANCE.md](GOVERNANCE.md) | how decisions are made and merged |

## Status

`0.x` — the HTTP API and the core package are usable and tested, but the public
surface may still change between minor versions. The macOS client is a
reference client, maintained best-effort.

## License

[Apache-2.0](LICENSE). Contributions are accepted under the
[Developer Certificate of Origin](CONTRIBUTING.md).
