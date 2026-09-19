# Evaluate this project

A checklist for a person or an agent. Every public claim maps to a command or a
file that proves it.

> 中文版见 [`EVALUATION.zh.md`](EVALUATION.zh.md)。

## Five minutes, no API key

```bash
git clone https://github.com/heymi/aldus-palace.git && cd aldus-palace
pnpm install
pnpm verify     # typecheck · suites · fixtures · benchmark · build · spec · openapi · llms · docs
pnpm demo       # the offline capture demo
```

A passing `pnpm verify` ends with fragments like:

```
packages/core test: All 23 suites passed.
packages/mcp test: mcp tool tests passed.
apps/server test: All 3 suites passed.
All fixtures passed.
spec/schema.sql is up to date.
```

`pnpm demo` prints the card shown at the top of the README. Nothing needs a key,
a network or a running server.

If you cannot run the repository, the real output is committed:
[`examples/output/`](examples/output) (demo, suites, fixtures, benchmark) and
[`docs/assets/demo.cast`](docs/assets/demo.cast) (asciinema).

## Claim → proof

| Claim | Prove it | Expect |
|---|---|---|
| Free text becomes typed objects | `pnpm demo` | `Captured · 1 commitment`, with the window resolved |
| The pipeline runs offline | `pnpm verify` | 28 suites and 11 fixtures pass with no key |
| `overdue` has no state to occupy | `rg overdue packages/core/src/db/schema.ts` | no matches; statuses are `captured/planned/scheduled/completed/risk/cancelled` |
| Memory activates by one published rule | `sed -n '19,21p' packages/core/src/lib/memoryActivation.ts` | `MEMORY_ACTIVE_THRESHOLD = 0.8` |
| A mood never becomes a memory | `pnpm eval` | fixture `S04` passes |
| A repeat points at the first record | `pnpm demo` | `Already tracked, so this repeat was skipped` |
| Dates resolve on the server | `pnpm --filter @aldus-palace/example-capture-cli start "Ship the onboarding page next week"` | a window, not the literal phrase |
| Every memory carries evidence | `packages/core/test/memoryEvolution.test.ts` | evidence and activation notes asserted |
| A contradiction is flagged, not stored twice | `packages/core/test/memoryEvolution.test.ts` | supersede and the version chain |
| Background enrichment survives retries | `packages/core/test/enrichmentLease.test.ts` | lease and generation assertions |
| The model proposes, the server decides | `packages/core/test/inputObjectClassification.test.ts` | one object mode per capture |
| A missing duration is estimated from history | `packages/core/test/adaptivePlanning.test.ts` | the slot follows the project median |
| The planner keeps a quarter of the day free | `packages/core/test/adaptivePlanning.test.ts` | nine hours plan as 6.75; a full day is not over-filled |
| Slipped flexible work moves forward, deadlines do not | `packages/core/test/workMigration.test.ts` | slot cleared and deferral counted; a deadline stays a risk; three deferrals ask for a decision |
| A blocked commitment is never scheduled | `packages/core/test/dependencies.test.ts` | the planner skips it; completing the blocker releases it; cycles are refused |
| Now is the best current action, not the first in line | `packages/core/test/planningIntelligence.test.ts` | the context match wins, and the reason travels with it |
| The day is classified into core, optional and deferred | `packages/core/test/planningIntelligence.test.ts` | a risk item is core, work that fits is optional, the rest is deferred |
| Finishing early refills the day | `packages/core/test/planningIntelligence.test.ts` | a completion replans and the next candidate is scheduled |
| A fresh principle outranks an old experience | `packages/core/test/memoryValue.test.ts` | levels, decay and the value score rank retrieval |
| A cloud call can be redacted before it leaves | `packages/core/test/privacy.test.ts` | names, money and emails become placeholders; level 4 stays local |
| A cloud provider cannot be built without the guard | `packages/core/test/providers.test.ts` | `createLLMProvider` refuses a cloud kind without a guard |
| An approved action runs once, and deletion runs through the gate | `packages/core/test/actionGate.test.ts`, `apps/server/test/actionGate.test.ts` | the executor runs once; purge proposes and approval deletes |
| A live model's dates are resolved on the server | `packages/core/test/modelDateNormalization.test.ts` | free text becomes ISO; a past date for a future phrase is dropped |
| Memory retrieval is full-text, and CJK works | `packages/core/test/retriever.test.ts` | FTS5 with bm25; a Chinese substring is found |
| Retrieval quality is measured | `pnpm bench:retrieval` | Recall@1/3/5 and MRR on a labeled corpus |
| Memory is private until a scope is granted | `packages/core/test/privacy.test.ts` | the default scopes exclude memory; revoking works |
| Deletion is real | `packages/core/test/privacy.test.ts` | the purge needs `confirm` and empties every table for the user |
| A high-risk agent action waits for a decision | `packages/core/test/actionGate.test.ts` | critical needs two approvals; revocation is final |
| The Action Gate is reachable from MCP | `packages/mcp/test/tools.test.ts` | the `actions` profile exposes list, decide and revoke |
| Trust grows from decisions, not silence | `packages/core/test/trustScore.test.ts` | level 0 with no evidence; six decisions at 0.75 reach level 2 |
| Autonomy widens only as far as the user's ceiling | `packages/core/test/trustScore.test.ts` | default ceiling 2; raising it to 3 runs high risk only after the record reaches level 3, and rejections lower it again |
| The schema is the single source of truth | `pnpm spec:check` | `spec/schema.sql` matches `db/schema.ts` |
| One record, three surfaces | `packages/mcp`, `apps/server`, `packages/core` | the same schema and migrations everywhere |
| MCP tools return a readable card | `pnpm --filter @aldus-palace/mcp test` | card text asserted, payload in `structuredContent` |
| The rule layer has measured numbers | `pnpm bench` | see [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) |

## Layout for agents

| File | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | the development contract |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code entry, imports AGENTS.md |
| [`.cursor/rules/aldus.mdc`](.cursor/rules/aldus.mdc) | Cursor rules |
| [`llms.txt`](llms.txt) | curated index for LLM tools |
| [`llms-full.txt`](llms-full.txt) | the key docs concatenated |
| [`docs/MAP.md`](docs/MAP.md) | capability → code → doc → test |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | the shared vocabulary |
