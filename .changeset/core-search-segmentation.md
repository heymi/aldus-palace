---
"@aldus-palace/core": minor
---

Add `lib/search.ts`: `segmentForSearch` and `toMatchQuery` prepare text and
queries for FTS5 so CJK substring search works on both runtimes. The Retriever
spike that motivated it is in `docs/RETRIEVER.md`.
