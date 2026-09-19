---
"@aldus-palace/core": patch
---

Keep the memory search index consistent.

- `indexMemory` writes the search row before `search_text`, so an interrupted
  write is repaired by the next backfill instead of leaving a memory marked
  indexed with no row.
- A search row is updated in place, or inserted only if absent, so two flows for
  one memory cannot leave duplicate rows.
- The backfill repairs a memory whose search row went missing, distinguishes an
  empty body from a missing row, and removal drops the row with the memory.
