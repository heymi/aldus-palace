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
## v0.2 — ecosystem (current)

- [x] Anthropic provider (Messages API) alongside DeepSeek / OpenAI-compatible
- [x] `@aldus-palace/mcp` — capture, today, commitments and memory tools over stdio
- [x] Local SQLite adapter published as `@aldus-palace/core/db/sqlite`
- [x] [Technical write-up](docs/PROGRESSIVE-CAPTURE.md) on the enrichment lease
- [x] `claude mcp add` / Claude Desktop integration documented and smoke-tested
- [ ] Published to npm with a release pipeline
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
