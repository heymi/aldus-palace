# 3. Understanding Agent

> **Your users paste a paragraph. Your database needs a decision.**

**The moment.** A meeting note arrives: half context, half intention, one date
buried in the middle. Your prompt produces something that looks fine, and a week
later the same task exists three times under three titles, with a date nobody can
explain and a “memory” the user never agreed to.

**What you get.** One call that turns free text into structured objects, with the
gates applied *after* the model, where they belong:

```ts
const card = await processRawInput(db, llm, user, rawInputId, "local");
// → { summary, thoughts[], commitments[], decisions[], memory_candidates[],
//     memory_conflicts[], clarifications[], project_match, warnings[] }
```

The runtime enforces what a prompt cannot:

| Gate | Effect |
|---|---|
| **Object mode exclusivity** | one capture is a thought, a commitment, or genuinely both — never the same thing twice |
| **Near-duplicate skip** | re-capturing an intention surfaces the existing commitment instead of a copy |
| **Server-side relative dates** | “next Wednesday” is resolved from the user's timezone, not trusted to the model |
| **Clarifications** | ambiguous early-morning phrases, and a capture the rules cannot classify (a defect, work, or a note), produce a question, not a guess; the answer is learned for similar sentences (ADR 0012) |
| **Memory gating** | candidates only, with the reason they were kept or dropped in `warnings[]` |
| **Graceful fallback** | a failed or malformed model response leaves the deterministic result in place |

It is also language-agnostic: nothing keys on English keywords.

**Who this is for.** Meeting notes → action items, support conversations →
commitments, voice memos → something a database can query.

## See it in 30 seconds

```bash
pnpm --filter @aldus-palace/example-understanding-only start
```

Four inputs, four different decisions, each printed with the reasoning —
including the duplicate that was skipped and the memory candidate that was kept
while others were filtered.

## Use it as

| Level | How |
|---|---|
| **MCP** | profile `capture` → the `capture` tool |
| **HTTP** | `POST /v1/inputs` (`mode`: `progressive` \| `sync` \| `local`) · `POST /v1/inputs/:id/reclassify` (`bug` \| `task` \| `note`) |
| **Library** | `processRawInput(db, llm, user, rawInputId, mode)` |

## Proof

- `packages/core/src/agent/understand.ts` — the pipeline and the gates
- `packages/core/src/lib/` — date resolution, title quality, project matching, memory filters
- `eval/fixtures/*.json` — the behaviour this promises, replayable offline
- `packages/core/test/inputObjectClassification.test.ts` — thought vs commitment vs mixed
