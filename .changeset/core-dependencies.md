---
"@aldus-palace/core": minor
---

Add dependency constraints: `addDependency`, `removeDependency`,
`listDependencies` and `blockedCommitmentIds`. The planner skips a commitment
while a blocker is open, a finished blocker releases it, and cycles are refused.
ADR 0009.
