---
"@aldus-palace/core": minor
---

Add the memory value model: `memoryLevelFor`, `decayWeight`,
`memoryValueScore` and `memoryRetrievalScore`. Retrieval now weighs the keyword
match by level, decay and value, so a fresh principle outranks an old
experience. The memory list exposes `level` and `decay`.
