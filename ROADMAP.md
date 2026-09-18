# Roadmap

This is a public summary. Detailed design history lives in
[`docs/design-archive`](docs/design-archive).

## v0.1 — public foundation (current)

- [x] `@aldus-palace/core`: domain model, agent runtime, storage port, migrations
- [x] Deterministic offline provider + provider-agnostic `LLMProvider`
- [x] Progressive capture with enrichment leases
- [x] Reference server: local SQLite **and** Cloudflare Durable Object adapters
- [x] Two-tier tests: deterministic suites + acceptance fixtures (offline)
- [x] `spec/schema.sql` generated from the canonical schema
- [x] SwiftUI reference client (best effort)
- [ ] Anthropic provider
- [ ] MCP server (`capture`, `list_today`, `confirm_memory`) so Claude Desktop
      and Claude Code can capture directly
- [ ] Published to npm with a release pipeline

## v0.2 — ecosystem

- [ ] `@aldus-palace/core` published, with a documented stability policy
- [ ] Integration example: embed the runtime in your own app
- [ ] A technical write-up on progressive capture and enrichment leases
- [ ] More acceptance fixtures contributed by users

## Later

- [ ] Postgres adapter behind the existing async port (the port was designed for it)
- [ ] Memory conflict detection and supersede flows
- [ ] Cognitive-map exploration UI
- [ ] Planning engine beyond Today (horizon, dependencies, energy patterns)

## Explicit non-goals

- multi-tenant hosting of other people's personal data
- autonomous external actions (sending mail, payments) without confirmation
- becoming a project-management or note-taking suite

See [AGENTS.md](AGENTS.md) for the product rules behind these.
