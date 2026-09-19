---
"@aldus-palace/core": minor
---

Add durable action execution. An approved proposal carries an executable
descriptor, an idempotency key, an execution status and the result or error;
`executeApprovedAction` claims a lease, runs the executor registered for the
action type, records the outcome, skips when the permission was revoked, and
never runs a succeeded action twice. New exports: `executeApprovedAction`,
`ActionExecutor`, `ActionExecutorContext`, `ActionExecutorRegistry`,
`ActionExecutionStatus` and `EXECUTION_LEASE_MS`.
