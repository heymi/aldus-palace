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
- [x] Two published packages (`@aldus-palace/core`, `@aldus-palace/mcp`)
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

- [x] **A graded memory model.** Levels 0–3 are derived from the shipped kinds
  (experience, decision/project context, preference, principle) and weigh
  retrieval (`lib/memoryValue.ts`). An identity level needs an identity kind
  first.
- [x] **Memory decay.** Each kind carries a half-life — an experience fades in a
  month, a principle holds for years — and retrieval weighs it.
- [x] **A value score.** Explicitness, frequency, impact, scope and future
  relevance average into one score that retrieval uses. Extraction still reads
  two signals, so frequency and scope stay at their defaults.
- [ ] **More memory kinds.** Goal, relationship, knowledge, habit and episode
  memories, each with its own lifetime and evidence rules.
- [ ] **More extraction signals.** Impact on future decisions, and scope across
  projects, alongside durability markers and repeated behaviour.

## Planning, deepened

The shipped planner covers four kinds of time, priority scoring, slot search,
Today, risk, adaptive limits and a learned behaviour model. The design extends
it:

- [x] **A constraint model** — hard (deadline), availability (window),
  preference (learned project weighting) and dependency (blocked-by, with cycle
  rejection) constraints. Soft constraints that trade off against each other are
  not modelled yet.
- [ ] **A blended priority score** — impact and goal alignment are not read yet;
  urgency, dependencies (as eligibility), context and time fit are.
- [x] **Duration estimation from history** — a stated estimate keeps the larger
  weight and is calibrated against the median of completed work in the same
  project (`lib/durationEstimate.ts`). Complexity is not read yet.
- [x] **Context-switch cost.** Continuing the project the user is already in
  scores higher and switching scores lower (`lib/nowScore.ts`); learned project
  weighting adds to it.
- [x] **An explicit morning plan.** The day is classified into core, optional
  and deferred in the Today payload (`lib/dayPlan.ts`).
- [x] **A scored Now.** Urgency, importance, whether the work fits the time left
  and the context match decide the current action; the reason travels with it.
- [ ] **A rhythm-aware Now** — energy match and a user rhythm are not read yet.
- [x] **Event-driven replanning.** Finishing something re-derives the day
  (`replanAfterChange`); a new task and a removal already did. A postponed
  meeting still needs an events surface.
- [x] **Buffer management** — a quarter of the daytime window stays free
  (`lib/planCapacity.ts`).
- [x] **Task migration** — flexible, unstarted work moves forward, and repeated
  deferrals surface for a decision (`services/workMigration.ts`).

## Autonomy and models

- [x] **An Action Gate.** A published risk table grades every proposed agent
  action: low and medium run, high waits for one approval, critical needs two,
  and every decision is logged and revocable (`services/actionGate.ts`).
- [x] **A trust score and autonomy levels.** The Laplace-smoothed approval rate
  of decided actions, with level 0–4 thresholds; a caller can pass the level to
  the gate to widen what runs without asking (`services/actionGate.ts`).
- [x] **Permission evolution.** The effective level is
  `min(max(earned, 2), ceiling)`: the published rule is the floor, the user's
  ceiling (default 2, up to 4) is the consent, and the gate applies the result
  by default (`services/actionGate.ts`).
- [ ] **Model orchestration.** One provider interface serves every call today.
  The design routes work by task: a fast model for classification, a reasoning
  model for planning and conflict, embeddings for memory retrieval, and a local
  model for sensitive input.

## Privacy & local intelligence

The shipped runtime is local-first and single-user, and `SECURITY.md` records the
current posture. The privacy architecture takes shape in these pieces:

- [x] **A Local Intelligence Layer** — input parsing, classification, Memory
  indexing and planning all run in the runtime on the device.
- [x] **A Privacy Gateway** with redaction: `prepareCloudPayload` replaces
  project names, money, emails and phone numbers by data level, refuses level 4,
  and logs each call (`services/privacyGateway.ts`).
- [x] **Progressive, fine-grained permissions** — calendar read by default, mail,
  files and memory scopes on request, with Memory private until granted
  (`services/permissions.ts`).
- [x] **An Action Gate** with four risk levels and a viewable, revocable audit
  log (ADR 0005).
- [x] **A delete policy** — `purgeUserData` deletes every row the user owns in
  one transaction (`services/dataLifecycle.ts`).
- [ ] **Local encrypted storage** for Memory — Keychain plus an encrypted
  database on macOS, Secure Enclave plus encrypted storage on iOS.
- [x] **Routing every cloud call through the gateway** — a cloud provider is only
  built with the guard attached, so a call cannot leave unredacted
  (`providers/guard.ts`, ADR 0011).

## Later

- [ ] A SwiftUI reference client (`clients/` is a placeholder today)
- [ ] Postgres adapter behind the existing async port (the port was designed for it)
- [ ] Cognitive-map exploration UI
- [ ] Planning engine beyond Today (horizon, dependencies, energy patterns)

See [AGENTS.md](AGENTS.md) for the product rules behind these.
