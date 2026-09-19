# Retriever

How the runtime finds the memories that matter, and the design for scaling it
from dozens to thousands.

## The question

Memory value already ships: levels, decay and a value score weigh what to keep
(`lib/memoryValue.ts`). Retrieval is the other half, and today it is keyword
overlap plus a heuristic score over the most recent rows. That is right for a
small store. A Retriever should hold up as the store grows, without giving up
local-first or the two runtimes.

## Spike findings (2026-09-19)

| Question | Result |
|---|---|
| FTS5 on the local adapter (`better-sqlite3`, SQLite 3.53.2) | works, with `bm25()` ranking |
| FTS5 on Cloudflare Durable Object SQLite | supported; Cloudflare lists the FTS5 module (including `fts5vocab`) among the supported extensions |
| CJK tokenization | `unicode61` keeps a CJK run as one token, and `trigram` misses two-character queries; separating CJK characters and matching a quoted phrase works for any length (`lib/search.ts`) |
| SQL triggers for CJK | a trigger cannot segment; the index stores text the runtime already segmented |
| Vector search (`sqlite-vec` or similar) | **not portable**: a native extension, absent from the Durable Object supported set and not bundled with `better-sqlite3` |
| Same schema on both runtimes | FTS5 keeps the "one schema, two runtimes" promise |

The decision follows from the spike: **full-text search is the default, and
embeddings are an optional adapter.**

## Design

```
query ──► Retriever port
               ├─ default: FTS5 (portable on both runtimes)
               │     bm25 + level + decay + value + importance
               └─ optional: embeddings + reranker (opt-in, never required)
```

- **A port, not a concrete dependency.** `Retriever` takes the storage port and
  returns ranked memory ids; callers (context assembly, the memory list) do not
  know how the ranking happened.
- **Segmented text the runtime writes.** `lib/search.ts` turns CJK into single
  characters (`segmentForSearch`) and a user query into an FTS5 phrase
  (`toMatchQuery`). A `search_text` column on `memories` holds the segmented
  form, written by the memory write path; triggers copy it into
  `memory_search(memory_id UNINDEXED, search_text)`, because a trigger cannot
  segment. A backfill runs on first use for rows written before the column
  existed.
- **The score blends both worlds.** `bm25` orders the match; the existing
  `memoryRetrievalScore` (level, decay, value, importance) breaks ties and keeps
  a fresh principle ahead of an old experience on the same topic.
- **A fallback stays in code.** If a runtime ever lacks FTS5, retrieval falls
  back to the current keyword scoring, so nothing breaks.
- **Embeddings are optional.** They sit behind the same port as a second
  implementation, and the default path never needs a model or a vector store.

## Slices

1. **FTS5 retriever — shipped.** The `memory_search` table ships in the schema;
   `lib/retriever.ts` indexes a memory (`indexMemory`), backfills on first search
   (`ensureMemoryIndex`), and answers with ranked ids (`retrieveMemoryIds`), and
   `retrieveActiveMemoriesForContext` uses it before the keyword fallback.
   `lib/search.ts` segments CJK. Locked by `packages/core/test/retriever.test.ts`.
2. **Ranking and measurement — shipped.** `bm25` ranks, `memoryRetrievalScore`
   re-ranks, and `pnpm bench:retrieval` reports Recall@K and MRR (1.000 on the
   labeled corpus; `docs/BENCHMARKS.md`).
3. **Optional embeddings.** A second `Retriever` behind the port, opt-in, with no
   change to the default behaviour.

Slices 2 and 3 are recorded in [`ROADMAP.md`](../ROADMAP.md).
