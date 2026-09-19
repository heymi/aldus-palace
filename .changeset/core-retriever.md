---
"@aldus-palace/core": minor
---

Add the FTS5 memory retriever: `lib/retriever.ts` indexes a memory
(`indexMemory`), backfills on first search (`ensureMemoryIndex`) and answers
with ranked ids (`retrieveMemoryIds`); `memory_search` and
`memories.search_text` ship in the schema, and `lib/search.ts` segments CJK so
substring search works. Context retrieval uses it before the keyword fallback.
See `docs/RETRIEVER.md`.
