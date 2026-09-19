---
"@aldus-palace/core": patch
---

Normalise the dates a model returns. `normalizeModelDate` resolves free-text
dates ("next week", "Friday") with the server rules and drops a past date when
the words point at the future, so a model cannot store "next week" or a
hallucinated past date as a commitment window. Found by the new LLM benchmark
(`pnpm bench:llm`, see `docs/BENCHMARKS-LLM.md`).
