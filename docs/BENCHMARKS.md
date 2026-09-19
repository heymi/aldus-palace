# Benchmarks

Measured numbers for the **deterministic rule layer**. The corpus ships in this
repository (`packages/core/bench/run.ts`), so every number is reproducible
offline with no API key.

```bash
pnpm bench          # table
pnpm bench --json   # machine-readable
```

## Results (37 contract cases)

| Suite | Pass | Accuracy | Precision | Recall |
|---|---|---|---|---|
| Relative dates (en/zh, fixed clock) | 8/8 | 1.000 | — | — |
| Duplicate commitments | 6/6 | 1.000 | 1.000 | 1.000 |
| Memory conflicts | 5/5 | 1.000 | 1.000 | 1.000 |
| Memory activation | 6/6 | 1.000 | 1.000 | 1.000 |
| Actionable work | 7/7 | 1.000 | 1.000 | 1.000 |
| Object mode | 5/5 | 1.000 | — | — |

A case that fails exits non-zero, so a rule regression fails `pnpm verify`.

## Adding a case

Add an entry to the matching corpus in `packages/core/bench/run.ts`. Each case is
a promise that must hold; a regression is a red run.
