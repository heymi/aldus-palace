# Benchmarks

Measured numbers for the **deterministic rule layer**. Reproduce with:

```bash
pnpm bench          # table
pnpm bench --json   # machine-readable
```

## What this is, and what it is not

- It is a curated, labeled corpus that ships in this repository
  (`packages/core/bench/run.ts`), so every number is reproducible offline.
- It is **not** a blind benchmark and **not** a model benchmark. It measures the
  rules that run with no API key. Model quality is not measured here.
- It is not LongMemEval or any retrieval leaderboard. The corpus is small and
  authored alongside the rules; treat the numbers as regression evidence, not as
  a claim of general quality.

## Results (37 contract cases)

| Suite | Pass | Accuracy | Precision | Recall |
|---|---|---|---|---|
| Relative dates (en/zh, fixed clock) | 8/8 | 1.000 | — | — |
| Duplicate commitments | 6/6 | 1.000 | 1.000 | 1.000 |
| Memory conflicts | 5/5 | 1.000 | 1.000 | 1.000 |
| Memory activation | 6/6 | 1.000 | 1.000 | 1.000 |
| Actionable work | 7/7 | 1.000 | 1.000 | 1.000 |
| Object mode | 5/5 | 1.000 | — | — |

A contract case that fails exits non-zero, so a rule regression fails
`pnpm verify`.

## Known gaps (measured, not enforced)

Five cases are deliberately measured as limitations. They are reported on every
run and are the honest edge of the rules today:

| Gap | Today | Why it matters |
|---|---|---|
| `"Ship the onboarding page next week"` vs `"ship onboarding page next week"` | not a duplicate | English case-only rewordings are missed; exact repeats and CJK near-duplicates are caught |
| `"Fix the notification bug"` vs `"Fix notification bug"` | not a duplicate | a dropped article is missed |
| `"Start shipping iOS again"` vs `"Stay Mac-only"` | not a conflict | the rule needs an explicit negation on the existing side (`skip Windows`) to flip polarity |
| `"下周把 onboarding 做完"` (raw rules) | not actionable | the offline provider supplies `intent`; the bare fallback misses this phrasing |
| `"AI 产品太吵了，另外把定价页改一下"` | thought, not mixed | the mixed-clause fallback needs a stronger action clause |

Connecting a model narrows some of these; the deterministic path stays the
fallback.

## Adding a case

Add an entry to the matching corpus in `packages/core/bench/run.ts`. Mark it
`known: true` only when it documents a limitation you are not fixing now; a
contract case is a promise that must hold.
