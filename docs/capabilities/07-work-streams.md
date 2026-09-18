# 7. Work streams

> **Tagging is a job. Nobody wants that job.**

**The moment.** You have ninety commitments, and no idea how they relate. You
want to see them grouped by what they are *about* — but you are not going to
maintain tags, and you have been burned before by a system that rewrote your data
when you edited a view.

**What you get.** Grouping that is generated, editable, and fundamentally
disposable:

- The model proposes themes (or a deterministic project-based fallback runs when
  no model is configured).
- You can override a single commitment's group, and that override wins.
- The whole grouping is a **projection**: `rebuildCommitmentClassifications`
  recomputes it from commitments + projects + active memories, and rebuilding
  never touches the commitments themselves.
- Each stream surfaces its most urgent work first — at risk, then started, then
  nearest deadline — with the rest still counted, not hidden.

**Who this is for.** Products with many commitments and no appetite for tag
maintenance; anyone who wants “what am I working on?” answered without asking the
user to curate.

## See it in 30 seconds

```bash
pnpm --filter @aldus-palace/example-today-only start    # prints the streams
```

With no model configured you still get grouping — by project — because the
fallback is deterministic. With one, you get themes.

## Use it as

| Level | How |
|---|---|
| **MCP** | profile `workstreams` → `list_work_streams` |
| **HTTP** | `GET /v1/work-streams`, `POST /v1/commitment-classifications/rebuild`, `PATCH /v1/commitments/:id/classification` |
| **Library** | `listWorkStreams`, `rebuildCommitmentClassifications`, `overrideCommitmentClassification` |

```ts
const { groups, unassigned, total } = await listWorkStreams(db, userId, {
  limitPerGroup: 3,
});
```

## Proof

- `packages/core/src/services/workStreams.ts` — grouping, ordering, visible/total split
- `packages/core/src/services/commitmentClassification.ts` — generation, fingerprints, rebuild, overrides
- `docs/adr/0002-keep-work-classification-as-rebuildable-projection.md` — why it can never become the source of truth
- `apps/server/test/commitmentClassification.test.ts` — rebuild, override, and the lease that protects it
