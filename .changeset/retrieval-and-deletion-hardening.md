---
"@aldus-palace/core": patch
---

Harden the FTS5 retriever and true deletion.

- A query that contains an emoji or a punctuation-only word (`"? hello"`,
  `"😀 hello"`) no longer produces a dangling `OR`; the expression stays valid,
  so a capture never fails on such input.
- Context retrieval falls back to the keyword pass when the FTS query errors,
  instead of failing the whole capture.
- `purgeUserData` now also deletes the `memory_search` rows, so a purged memory
  leaves nothing behind in the full-text index.
