---
status: accepted
---

# Dependencies block scheduling, and cycles are refused

## Context

The constraint model had hard (deadline), availability (window) and preference
(learned project weighting) constraints, but nothing represented "this waits on
that". Without it the planner could schedule work that cannot start, and a user
had to keep the order in their head.

## Decision

- **A join table, not a column.** `commitment_dependencies(commitment_id,
  blocked_by_id, user_id, created_at)` with a composite primary key, a
  self-reference check and `ON DELETE CASCADE` on both sides.
- **A dependency is a scheduling constraint.** `blockedCommitmentIds` returns
  the commitments with at least one blocker whose status is not `completed` or
  `cancelled`. Both planning paths — `reconcileTodayPlan` and `planEmptyToday` —
  skip them. A finished blocker stops blocking.
- **Cycles are rejected before they reach the table.** `addDependency` walks the
  existing edges from the new blocker and refuses the insert when it can reach
  the commitment, so a cycle never exists to break later.
- **The edges are visible and reversible.** `GET/POST/DELETE
  /v1/commitments/:id/dependencies` and `listDependencies` expose them; adding
  and removing each write an action-log entry.

## Consequences

- The planner respects order without a priority field, and completing a blocker
  releases the work on the next planning pass.
- A user arrangement that ignores a dependency is still possible: the constraint
  is a scheduling rule, not a data invariant. The planner is where it applies.
- Covered by `packages/core/test/dependencies.test.ts`, including the planner
  scenarios and the cycle checks.
