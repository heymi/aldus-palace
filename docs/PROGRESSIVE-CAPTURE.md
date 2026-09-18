# Progressive capture with enrichment leases

*A capture must feel instant. Only a model can produce a good understanding.
This is how Aldus Palace reconciles the two — and why the hand-off is idempotent
under retries, concurrent clients and crashes.*

## The problem

The naive designs both fail:

- **Model inline.** Every capture waits on a network call (500 ms – 5 s). The
  product feels broken, and a provider outage stops capture entirely.
- **Fire-and-forget.** Write local results, kick off a background model call.
  Now two enrich requests can interleave — a client retry plus the server's own
  auto-enrich — and the database ends up with objects half-written by one run and
  half by another. A crashed worker leaves `processing_status = 'enriching'`
  forever, so every later retry is rejected.

The fix is to treat the model pass as a **resource with a lease**, not as a
job.

## The model

A capture is two passes over the *same* immutable `raw_inputs` row:

| Pass | Who | Cost | Result |
|---|---|---|---|
| `local` | deterministic rules (`lib/`, `providers/dev.ts`) | microseconds | a real, usable ActionCard |
| `full` | the configured model | one API call | replaces the local derivatives |

`POST /v1/inputs` returns the local card immediately and, when a real provider is
configured, also starts the model pass. Clients may equally call
`POST /v1/inputs/:id/enrich` themselves — whichever arrives first wins, and the
second is a no-op.

Three columns carry the coordination:

| Column | Meaning |
|---|---|
| `processing_generation_id` | which attempt is currently allowed to write |
| `processing_lease_until` | when a silent attempt is presumed dead |
| `result_generation_id` | which attempt produced the stored result |

### Claiming

```ts
const generationId = await claimEnrichment(db, inputId, userId);
if (!generationId) {
  // someone else holds a live lease — do not touch anything
}
```

`claimEnrichment` is a single conditional `UPDATE`:

```sql
UPDATE raw_inputs
   SET processing_status = 'enriching', processing_generation_id = ?,
       processing_lease_until = ?, ...
 WHERE id = ? AND user_id = ?
   AND (processing_status != 'enriching'
        OR processing_lease_until IS NULL OR processing_lease_until <= ?)
```

It returns `null` when the lease is held. There is no read-then-write window, so
SQLite's row lock (or the Durable Object's single-threaded storage) is enough to
serialise claims.

### Writing

Every write in the model pass is guarded by the generation:

```sql
... WHERE id = ? AND processing_generation_id = ?
```

If a stale worker wakes up after its lease expired and a newer generation has
taken over, its `UPDATE` matches zero rows and it throws
`enrichment_superseded` — it cannot corrupt the newer result. The lease therefore
gives *liveness* (a dead worker's work becomes reclaimable) while the generation
gives *safety* (a resurrected worker cannot write).

### Failing

A failed model pass **must not** destroy the local result. The order of
operations is the whole trick:

1. Parse and validate the model output.
2. Only then `clearInputDerivatives()` — delete the previous derivatives and
   write the new ones, inside one transaction.
3. On failure, record `processing_status = 'local'` and `error_message`, and
   release the lease. The user still has their local card.

## What this buys

- **Capture never blocks** and never depends on an API being up.
- **Retries are free.** Any number of clients can call `/enrich`; exactly one
  does the work.
- **Crash recovery is automatic.** After `processing_lease_until`, the next
  attempt reclaims the work.
- **Failures are observable.** The client sees `enriching` → `processed`, or a
  terminal `failed` with a reason, which clients surface to the user.

## Tests that pin it

`packages/core/test/enrichmentLease.test.ts` covers the three states that
matter: a concurrent claim is rejected, an expired lease is reclaimable, and a
superseded generation cannot overwrite its replacement or release its lease.

`apps/server/test/commitmentClassification.test.ts` additionally runs the
classification lease race through the HTTP surface.

## When not to use this pattern

Progressive capture adds a state machine and an extra column set. If your
understanding step is cheap and deterministic, write it inline. The pattern earns
its keep when the expensive part is a remote call you do not control, and when
losing the user's input would be unacceptable.
