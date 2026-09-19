# Map: capability → code → doc → test

Use this instead of searching. Every capability names the file that implements
it, the doc that explains it and the suite that pins it.

| Capability | Code | Doc | Test |
|---|---|---|---|
| Schema & domain | `packages/core/src/db/schema.ts` | [01](capabilities/01-schema-and-domain.md) | `pnpm spec:check` |
| Providers | `packages/core/src/providers/` | [02](capabilities/02-providers.md) | `packages/core/test/providers.test.ts` |
| Understanding | `packages/core/src/agent/understand.ts` | [03](capabilities/03-understanding.md) | `inputObjectClassification.test.ts`, `relativeDay.test.ts`, `thoughtTitle.test.ts`, `projectMatch.test.ts` |
| Progressive capture | `packages/core/src/services/enrichmentLease.ts` | [04](capabilities/04-progressive-capture.md) | `packages/core/test/enrichmentLease.test.ts` |
| Memory | `lib/memoryExtract.ts`, `lib/memoryActivation.ts`, `services/memoryLifecycle.ts`, `services/memoryEvolution.ts` | [05](capabilities/05-memory.md) | `memoryActivation.test.ts`, `memoryEvolution.test.ts` |
| Today & planning | `services/today.ts`, `services/planToday.ts`, `services/adaptivePlanning.ts`, `services/workMigration.ts`, `services/dependencies.ts` | [06](capabilities/06-today-and-planning.md) | `adaptivePlanning.test.ts`, `workMigration.test.ts`, `dependencies.test.ts` |
| Work streams | `services/workStreams.ts`, `services/commitmentClassification.ts` | [07](capabilities/07-work-streams.md) | `apps/server/test/commitmentClassification.test.ts` |
| HTTP API | `apps/server/src/` | [08](capabilities/08-http-api.md) | `apps/server/test/` |
| MCP server | `packages/mcp/src/` | [09](capabilities/09-mcp.md) | `packages/mcp/test/tools.test.ts` |
| Text projections | `packages/core/src/lib/format.ts` | [EVALUATION](../EVALUATION.md) | `packages/core/test/format.test.ts` |
| Action Gate | `packages/core/src/services/actionGate.ts` | [INTELLIGENCE](INTELLIGENCE.md) · [ADR 0005](adr/0005-action-gate-with-published-risk.md) | `packages/core/test/actionGate.test.ts` |
| Acceptance fixtures | `eval/fixtures/` | [EVAL](EVAL.md) | `pnpm eval` |
| The engine design | `docs/INTELLIGENCE.md` (design) | [INTELLIGENCE](INTELLIGENCE.md) | shipped parts above |

## Where to start reading

| Question | File |
|---|---|
| What does the product do? | [`README.md`](../README.md) |
| How is the runtime put together? | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| What are the objects and invariants? | [`DOMAIN-SCHEMA.md`](DOMAIN-SCHEMA.md) |
| Why is a decision the way it is? | [`adr/`](adr) |
| What is planned, and what is not? | [`ROADMAP.md`](../ROADMAP.md) |
| How do I verify a claim? | [`EVALUATION.md`](../EVALUATION.md) |
| What does a word mean here? | [`GLOSSARY.md`](GLOSSARY.md) |

## The runtime loop

```
raw input → understanding → thoughts / commitments / decisions / memory
                │
                ├─ Today (projection)
                ├─ Work streams (projection)
                └─ Memory lifecycle (candidate → active → superseded)
```
