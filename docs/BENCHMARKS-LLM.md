# LLM benchmark

Real captures through `deepseek-chat`, measured by `packages/core/bench/llm/run.ts`.

```bash
DEEPSEEK_API_KEY=… pnpm bench:llm
```

It needs a key and a network, so it is not part of `pnpm verify`. The corpus is
ten labeled captures, English and Chinese, each with an expected object mode,
commitment count, memory behaviour and resolved date.

## Results (deepseek-chat, 10 cases)

| Metric | Result |
|---|---|
| Object mode accuracy | 100% |
| Commitment count | 90% |
| Memory behaviour | 100% |
| Date resolution | 100% |
| Latency p50 / p95 | 1482 ms / 2915 ms |

Object mode covers thought, commitment and mixed. Memory behaviour checks that a
stated rule becomes active, that a mood is dropped, and that a platform decision
becomes a memory. Date resolution checks the resolved window or deadline against
the day the words point at.

## What the run improved

The first run showed date resolution at 25%: the model sometimes returned a
free-text date ("next week", "Friday") or a hallucinated past date, which the
runtime stored as written. `normalizeModelDate` in `agent/understand.ts` now
resolves free text with the same server rules the deterministic path uses, and
drops a past date when the words point at the future; resolution reached 100%.
Locked by `packages/core/test/modelDateNormalization.test.ts`.

The one remaining miss is a commitment the model created for "Keep Mac only, no
Windows version", where the corpus expects a decision. It is reported, not
hidden.
