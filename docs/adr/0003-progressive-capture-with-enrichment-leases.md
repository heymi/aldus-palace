---
status: accepted
---

# Progressive capture with enrichment leases

## Context

A capture must feel instant, but only a model can produce a high-quality
understanding. Running the model inline makes every capture wait on a network
call; running it only in the background means the user stares at nothing.

Early versions wrote local results and then handed off to a background model
call. Two failure modes appeared:

1. Two enrich calls (client retry + server-side auto-enrich) could both run and
   interleave, leaving objects half-written by one generation and half by another.
2. A crashed worker left `processing_status = 'enriching'` forever, so a later
   retry was rejected as “already enriching”.

## Decision

Model enrichment is a **lease**, not a fire-and-forget job.

- `processing_generation_id` identifies the writer of the current attempt.
- `processing_lease_until` bounds the lease in time; `claimEnrichment` only
  succeeds when there is no live lease.
- `result_generation_id` records which generation produced the stored result.
- Every write in the AI pass is guarded by `WHERE processing_generation_id = ?`,
  so a superseded generation cannot overwrite its replacement.
- The AI pass runs against the *original* `raw_inputs.content` and replaces
  local derivatives only after the model output validates (`clearInputDerivatives`
  runs after a successful parse). A failed parse leaves the local results intact.

`mode` on `POST /v1/inputs` selects the path: `progressive` (default, local +
leased background enrich), `sync` (model inline; used by non-UI clients), or
`local` (rules only).

## Consequences

- Captures are instant and always produce a usable ActionCard.
- Enrichment is idempotent under retries and concurrent callers.
- Failed enrichment is observable (`processing_status = 'failed'`, `error_message`)
  and is exposed to clients as a terminal state.
- The runtime owns a small state machine that every storage adapter must support;
  it is covered by `packages/core/test/enrichmentLease.test.ts`.
