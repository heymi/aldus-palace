# Roadmap

This is a public summary. The design each item comes from — with what ships
today marked against what does not — is in
[`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md). Detailed design history lives in
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
detection, versioning and retrieval. The design extends it:

- [ ] **A graded memory model.** The five shipped kinds grow into levels — raw
  experience, observation, preference, principle, identity — where a higher level
  carries more weight in future decisions.
- [ ] **Memory decay.** A lifetime on each kind: identity holds, principle fades
  with a long half-life, preference over months, habit over weeks, a current
  state over days.
- [ ] **A value score.** A candidate scored on explicitness, frequency, impact,
  project coverage and future relevance, then gated on the total.
- [ ] **More memory kinds.** Goal, relationship, knowledge, habit and episode
  memories, each with its own lifetime and evidence rules.
- [ ] **More extraction signals.** Impact on future decisions, and scope across
  projects, alongside durability markers and repeated behaviour.

## Planning, deepened

The shipped planner covers four kinds of time, priority scoring, slot search,
Today, risk, adaptive limits and a learned behaviour model. The design extends
it:

- [ ] **A richer constraint model** — hard, soft, preference and dependency
  relationships, so the plan can respect how work depends on other work.
- [ ] **A blended priority score** — impact, urgency, dependencies, goal
  alignment and risk, alongside the current signals.
- [ ] **Duration estimation from history** — blend the user's estimate with
  similar completed work and complexity.
- [ ] **Schedule optimization with context-switch cost** — maximize important
  work completed, minimize switching, fit the user's rhythm and lower stress.
- [ ] **An explicit morning plan** — classify the day into core, optional and
  deferred.
- [ ] **A scored Now** — priority × available time × energy match × context
  match.
- [ ] **Event-driven replanning** — react to a postponed meeting, a new task,
  finishing early, or a change in state.
- [ ] **Buffer management** — keep a share of the day free.
- [ ] **Task migration** — flexible, unstarted work can move forward on its own,
  and repeated deferrals surface for a decision.

## Autonomy and models

- [ ] **Trust and autonomy engine.** Risk, reversibility, visibility and an
  accumulated trust score would decide what the system may do without asking.
  Today the rule is fixed: capture lands on its own, and a stated principle takes
  effect, while everything else waits for the user.
- [ ] **Model orchestration.** One provider interface serves every call today.
  The design routes work by task: a fast model for classification, a reasoning
  model for planning and conflict, embeddings for memory retrieval, and a local
  model for sensitive input.

## Privacy & local intelligence

The shipped runtime is local-first and single-user, and `SECURITY.md` records the
current posture. The privacy architecture takes shape in these pieces:

- [ ] **A Local Intelligence Layer** — input parsing, sensitive detection, Memory
  indexing and basic planning stay on device.
- [ ] **A Privacy Gateway** with redaction, so a cloud call receives only
  temporary context (`input → sensitive detection → redaction → permission check
  → cloud`).
- [ ] **Local encrypted storage** for Memory — Keychain plus an encrypted
  database on macOS, Secure Enclave plus encrypted storage on iOS.
- [ ] **Progressive, fine-grained permissions** — calendar first, then mail, then
  files; read / create / modify separated; Memory private by default.
- [ ] **An Action Gate** with four risk levels (low automatic, medium notified,
  high confirmed, critical confirmed again) and a viewable, revocable audit log.
- [ ] **A delete policy** that reaches the local database, cloud sync and vector
  indexes — deletion is real, not a flag.

## Later

- [ ] Postgres adapter behind the existing async port (the port was designed for it)
- [ ] Cognitive-map exploration UI
- [ ] Planning engine beyond Today (horizon, dependencies, energy patterns)

## Explicit non-goals

- multi-tenant hosting of other people's personal data
- autonomous external actions (sending mail, payments) without confirmation
- becoming a project-management or note-taking suite

See [AGENTS.md](AGENTS.md) for the product rules behind these.
