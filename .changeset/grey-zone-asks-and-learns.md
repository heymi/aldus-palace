---
"@aldus-palace/core": minor
---

The grey zone asks, and corrections are learned.

- An input with a work signal below the action bar is no longer guessed into a
  thought: the capture records a pending `object_mode` clarification with three
  options — defect, work, note — and warns with the question.
- `applyObjectChoice` resolves the answer (defect/work become one commitment,
  note cancels any and keeps the thought), and the new
  `POST /v1/inputs/:id/reclassify` applies the same correction by hand.
- Corrections are stored per user in `classification_signals` (new table and
  migration, purged with the rest) and applied before asking, so the same words
  are not asked twice. Matching needs two term hits: one shared word is not
  enough.
