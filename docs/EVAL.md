# Eval and testing

Two tiers, deliberately separated.

## 1. Deterministic suites — `pnpm test`

Assertion scripts under `packages/core/test` and `apps/server/test`, executed
offline by `tsx`. They cover the parts where a regression would be silent:

| Suite | Locks down |
|---|---|
| `relativeDay` | relative date resolution and its timezone edge cases |
| `clarificationReply` | short replies to time clarifications |
| `thoughtTitle` | summary quality gates, transfer grounding |
| `projectMatch` | project matching by name/alias/description |
| `inputObjectClassification` | thought vs commitment vs mixed |
| `adaptivePlanning` | Today planning, adaptive caps, feedback episodes |
| `enrichmentLease` | concurrent enrichment and supersede semantics |
| `commitmentOriginalInput` | optimized content vs original input |
| `commitmentClassification` | work-stream projection, `/v1` API, lease races |
| `llm-config` | wrangler and code agree on the default model |

```bash
pnpm test                       # both packages
pnpm --filter @aldus-palace/core test
```

No API key, no network, no shared state: `createTestDb()` gives every suite its
own in-memory database, migrated exactly like production.

## 2. Acceptance fixtures — `pnpm eval`

`eval/fixtures/*.json` are user-visible behavioural requirements. Each fixture is
an input plus the properties the result must have:

```json
{
  "id": "S04",
  "input": "最近觉得 AI 产品都太吵了，干扰太多",
  "expect": {
    "thoughts_min": 1,
    "commitments_max": 0,
    "thought_types_allowed": ["idea", "insight", "observation", "research", "decision_candidate"],
    "forbidden": ["thought_type:principle", "recurrence"]
  }
}
```

Supported expectations: `thoughts_min`/`thoughts_max`,
`commitments_min`/`commitments_max`, `memory_candidates_min`,
`memory_active_max`, `thought_types_allowed`, `memory_types_allowed`,
`must_include_thought`, and `forbidden` markers
(`thought_type:*`, `commitment:*`, `recurrence`, …).

They run against the **deterministic** provider, so results are stable and the
suite is safe to require on every pull request.

```bash
pnpm eval
# PASS S04 … PASS S25
# All fixtures passed.
```

### Adding a fixture

Contributing a fixture is the best first contribution — it is data, not code:

1. Pick the next `S<n>` id (`S26`, `S27`, …).
2. Copy the shape above; write the input in any language.
3. State only properties that must hold, never the exact model output.
4. Run `pnpm eval` and open a PR explaining the user behaviour you are pinning.

If a fixture documents behaviour that the current rules get wrong, open the PR
with the fixture and mark it `xfail` in the description — that is a valuable bug
report.

## What is *not* tested offline

Live-model quality. `LLM_PROVIDER=deepseek` (or any OpenAI-compatible endpoint)
is exercised manually; there is no CI job that depends on a paid key. When you
change the understanding prompt, re-run the acceptance fixtures **and** capture
a few real inputs with a live provider before merging.
