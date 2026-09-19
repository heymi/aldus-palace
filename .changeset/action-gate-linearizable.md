---
"@aldus-palace/core": patch
---

Make the Action Gate's decisions and execution linearizable.

- `runGatedAction` records its inline run, so a later durable execute sees
  `already_succeeded` instead of running the effect twice.
- A decision or a revocation is written only if the row still has the status that
  was read, so two racing decisions cannot both apply and a confirmation is
  never lost.
- The execution lease is claimed only while the proposal is approved, closing the
  window where a revoke between the check and the claim could still run it.
- Executor bookkeeping is separate from the effect: a failed write no longer
  marks a completed action failed and invites a second run.
