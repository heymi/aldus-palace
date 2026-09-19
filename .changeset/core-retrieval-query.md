---
"@aldus-palace/core": patch
---

`toMatchQuery` OR-joins the words of a query (each Latin word a prefix term,
each CJK word a character phrase) so a memory that matches any word is a
candidate and bm25 ranks the rest. The retrieval benchmark now measures
Recall@K and MRR (`pnpm bench:retrieval`).
