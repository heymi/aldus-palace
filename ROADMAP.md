# Roadmap

This is a public summary. Detailed design history lives in
[`docs/design-archive`](docs/internal/design-archive).

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

## Memory, deepened

The shipped memory layer covers extraction, evaluation, activation, conflict
detection, versioning and retrieval. These parts of the design are not in the
code yet:

- [ ] **A graded memory model.** Today a memory carries one of five kinds
  (preference, project context, principle, decision, experience). The design
  calls for levels — raw experience, observation, preference, principle,
  identity — where a higher level carries more weight in future decisions.
- [ ] **Memory decay.** Today no memory weakens with time. The design puts a
  lifetime on each kind: identity does not decay, principle decays with a long
  half-life, preference in months, habit in weeks, a current state in days.
- [ ] **A value score.** Today importance follows the memory kind and confidence
  follows the extraction rule. The design scores a candidate on explicitness,
  frequency, impact, project coverage and future relevance, then gates on the
  total.
- [ ] **More memory kinds.** Goal, relationship, knowledge, habit and episode
  memories, each with its own lifetime and evidence rules.
- [ ] **Two more extraction signals.** Extraction reads durability markers and
  repeated behaviour. Impact on future decisions, and scope across projects, are
  not read yet.

## Autonomy and models

- [ ] **Trust and autonomy engine.** Risk, reversibility, visibility and an
  accumulated trust score would decide what the system may do without asking.
  Today the rule is fixed: capture lands on its own, and a stated principle takes
  effect, while everything else waits for the user.
- [ ] **Model orchestration.** One provider interface serves every call today.
  The design routes work by task: a fast model for classification, a reasoning
  model for planning and conflict, embeddings for memory retrieval, and a local
  model for sensitive input.

## Later

- [ ] Postgres adapter behind the existing async port (the port was designed for it)
- [ ] Cognitive-map exploration UI
- [ ] Planning engine beyond Today (horizon, dependencies, energy patterns)

## Explicit non-goals

- multi-tenant hosting of other people's personal data
- autonomous external actions (sending mail, payments) without confirmation
- becoming a project-management or note-taking suite

See [AGENTS.md](AGENTS.md) for the product rules behind these.
