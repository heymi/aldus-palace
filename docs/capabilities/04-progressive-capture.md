# 4. Progressive capture

> **The user gets a result in 50 ms. The model gets five minutes.**

**The moment.** Capture feels instant for a week, then support tickets arrive:
“it spun forever and I lost what I typed”, “the same task is in here twice”,
“it's been stuck on *enriching* since yesterday”. Every one of them is the
hand-off between your fast path and your smart path.

**What you get.** A pattern for the whole hand-off — deterministic first, model
second, and safe under all the ways that can go wrong:

| Failure | What happens instead |
|---|---|
| Two clients enrich the same capture | one claims the lease, the other returns `running` and does nothing |
| A worker crashes mid-enrichment | the lease expires and the next attempt reclaims the work |
| A stale worker wakes up | its writes match zero rows — it cannot overwrite a newer generation |
| The model times out or returns garbage | the deterministic result stays; the input is never lost |
| The user retries | enrichment is idempotent, because it is keyed by generation |

Three columns carry it: `processing_generation_id`, `processing_lease_until`,
`result_generation_id`. The whole mechanism is ~44 lines of service code, and
the reasoning is written down in [ADR 0003](../adr/0003-progressive-capture-with-enrichment-leases.md).

**Who this is for.** Anyone whose product does “user types → wait for a model”,
and anyone who has ever lost a user's input to a timeout.

## See it in 30 seconds

```bash
pnpm --filter @aldus-palace/example-understanding-only start   # the local pass
sed -n '1,60p' docs/PROGRESSIVE-CAPTURE.md                     # the design, one page
pnpm --filter @aldus-palace/core exec tsx test/enrichmentLease.test.ts
```

## Use it as

| Level | How |
|---|---|
| **MCP** | `capture` with `mode: "progressive"` (default) — local now, model later |
| **HTTP** | `POST /v1/inputs` then `POST /v1/inputs/:id/enrich` (the server also enriches on its own) |
| **Library** | `claimEnrichment` / `recordEnrichmentFailure` + `processRawInput(..., "full", generationId)` |

```ts
const generation = await claimEnrichment(db, inputId, userId);
if (!generation) return;                       // someone else owns this capture
try {
  await processRawInput(db, llm, user, inputId, "full", generation);
} catch (error) {
  await recordEnrichmentFailure(db, inputId, generation, String(error));
}
```

## Proof

- `packages/core/src/services/enrichmentLease.ts` — claim / release / supersede
- `packages/core/test/enrichmentLease.test.ts` — concurrent claim, expired lease, superseded writer
- `apps/server/test/commitmentClassification.test.ts` — the same lease race through the HTTP surface
- `docs/PROGRESSIVE-CAPTURE.md` — the pattern, written to be copied
