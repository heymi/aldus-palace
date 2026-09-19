# AGENTS.md — development guidelines

Aldus Palace is developed **agent-natively**: a large share of its code is
written with AI coding agents. This file is the shared contract for those agents
(and for humans who want the same rules). It is not a disclaimer — the normative
contract is the schema, the code and the acceptance fixtures in
[`docs/EVAL.md`](docs/EVAL.md).

> Also read [`CONTEXT.md`](CONTEXT.md) for the ubiquitous language of planning
> behaviour before changing the planner.

---

## 1. Project identity

You are working on **Aldus Palace**, a personal cognitive OS.

This is NOT:

- a todo application
- a calendar application
- a note-taking application
- a chatbot wrapper

> The goal: a system that understands the user's context, remembers how they
> work, helps organise thoughts, manages commitments, and turns intent into action.

---

## 2. Core philosophy

### Context over tasks

The fundamental objects are Thoughts, Commitments, Decisions, Memories, Concepts
and Projects. Tasks and calendar entries are only *projections*.

### The user expresses intent; the system owns structure

The user should never have to decide “is this a task, a note, or a reminder?”.

### Reduce cognitive load

Every feature must answer: *does this reduce the amount of management the user
has to do?* If not, reconsider the design.

---

## 3. Reference documents

| Priority | Document |
|---|---|
| 1 (normative) | `packages/core/src/db/schema.ts`, `spec/schema.sql` |
| 2 (normative) | `docs/ARCHITECTURE.md`, `docs/DOMAIN-SCHEMA.md` |
| 3 (normative) | `eval/fixtures/*.json` — behaviour the product promises |
| 4 | `docs/adr/*` — decisions already made; do not silently reverse them |
| 5 | `CONTEXT.md` — planning vocabulary |
| 6 (historical) | `docs/internal/design-archive/*` — original Chinese design docs |

Do not expand scope from the design archive. If a vision doc conflicts with the
schema or an ADR, the schema and the ADR win.

---

## 4. Architecture rules

**Data model first.** Object model → schema → services → API → UI.

**The agent is a system, not a prompt.** The pipeline is:

```
input → understanding → object extraction → memory → planning → action → learning
```

Do not collapse it into one giant prompt. Each capability keeps a clear
responsibility (`lib/`, `services/`, `agent/understand.ts`).

**The storage port is the only I/O boundary.** `packages/core` never imports
Hono, Express, Workers APIs, or reads `process.env`.

**The model proposes; the runtime decides.** Model output is validated, then the
server enforces invariants (object mode, dedupe, relative dates, memory gating).

---

## 5. Coding rules

- `packages/core` is runtime-agnostic and dependency-light (`zod`, `dayjs`,
  `nanoid`). New dependencies need a justification.
- Everything that touches storage is `async` — the port is async by contract.
- No module-level mutable state. No globals. Dependencies are passed in.
- Every mutation writes an `action_log` entry via `writeActionLog`.
- Never edit a shipped migration. Add a new one.
- Prefer the smallest change that preserves the product model.

### Tests are part of the contract

- Add or extend a deterministic suite under `packages/core/test` for any logic
  change (they run offline in CI).
- Add an `eval/fixtures/*.json` entry when you change user-visible understanding
  behaviour.
- Behaviour that a fixture pins must not regress; if it must change, change the
  fixture in the same PR and say why.

---

## 6. Before a major change

1. State your understanding of the feature.
2. Identify the affected domain objects.
3. Describe the runtime flow and the data changes.
4. Describe the migration story for databases that already exist.
5. Then implement — and update `docs/` and an ADR if the decision is durable.

---

## 7. Autonomy rules

| Risk | Examples | Behaviour |
|---|---|---|
| Low | organise thoughts, create objects, adjust a flexible plan | the system may act, and logs it |
| Medium | a change that is easy to undo | runs, and is recorded as a notification |
| High | external communication, payments, permanent memory | one explicit approval |
| Critical | permanent deletion | two approvals |

Every important action must be explainable, reversible where possible, and logged.

---

## 8. Model rules

Do not couple the system to one provider. `LLMProvider` is the interface;
configuration is resolved by `resolveProviderConfig` and passed in explicitly.
Models are replaceable; the intelligence layer belongs to the product.
