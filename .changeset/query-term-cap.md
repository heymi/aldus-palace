---
"@aldus-palace/core": patch
---

Bound the FTS5 query expression: the input is capped at 512 characters and 24
terms, so a long capture cannot turn retrieval into an unbounded OR chain.
