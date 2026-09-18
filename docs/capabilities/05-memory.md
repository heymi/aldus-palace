# 5. Memory

> **Five ways of saying the same thing become one memory. A bad day never becomes a personality.**
>
> **And when you change your mind, it asks — instead of quietly keeping both.**

**The moment.** You mention once that a UI felt noisy. Six weeks later your
assistant is confident you “prefer minimalism”, you cannot find where that came
from, and there is no way to correct it. Meanwhile the one thing you *did*
decide — Mac only — is nowhere.

**What you get.** A memory layer designed to be wrong safely:

| Behaviour | Detail |
|---|---|
| **Candidates, not facts** | a capture proposes; only a human confirmation activates. High confidence is still not enough |
| **Evidence on every row** | the excerpt it came from, a confidence value, and the input id |
| **Temporary states rejected** | “I'm tired today” is dropped before storage — no long-term signal, no memory |
| **Junk filtered with reasons** | one-off creative fragments and low-confidence inferences are skipped, and `warnings[]` says why |
| **Duplicates collapse** | different phrasings of the same principle normalise to one key (`preference\|prefer_simplicity`) |
| **Contradictions surface** | an opposing statement is flagged against the confirmed memory it disagrees with |
| **Replacements keep history** | confirming a replacement marks the old memory `superseded` with a pointer and a reason. Nothing is deleted |
| **Memory feeds back** | active memories are injected into the next capture, so understanding improves — and every injection is logged |

**Who this is for.** Anyone building an assistant that remembers, in a product
where being wrong about a user is expensive.

## See it in 30 seconds

```bash
pnpm --filter @aldus-palace/example-memory-gate-only start
```

One belief, its whole life: confirmed → contradicted by a new candidate →
replaced → the old version still readable in the version chain, and the counts
per state printed at the end.

## Use it as

| Level | How |
|---|---|
| **MCP** | profile `memory` → `list_memories` (`state`: candidate \| active \| superseded \| archived \| all) and `confirm_memory` (with `supersedes`) |
| **HTTP** | `GET /v1/memories?state=`, `POST /v1/memories/:id/confirm { supersedes?, reason? }`, `GET /v1/memories/:id/versions`, `POST /v1/memories/dedupe` |
| **Library** | `confirmMemory`, `rejectMemory`, `detectMemoryConflict`, `supersedeMemory`, `listMemoryVersions` |

```
candidate ──confirm──► active ──superseded by a newer belief──► superseded
    │                    │
    └──reject──► archived └──feed back into the next capture
```

Conflict detection runs on rules offline (topic + polarity, e.g. “Mac only” vs
“start shipping iOS”) and can be upgraded to the model when one is configured —
the user still makes the call.

## Proof

- `packages/core/src/services/memoryLifecycle.ts` — confirm / reject / list
- `packages/core/src/services/memoryEvolution.ts` — conflicts, supersede, version chains
- `packages/core/src/lib/memoryExtract.ts` — extraction, scoring fields, the pollution gate
- `packages/core/test/memoryEvolution.test.ts` — polarity detection, supersede, history retention
- `apps/server/test/commitmentClassification.test.ts` — memory counts through the API
