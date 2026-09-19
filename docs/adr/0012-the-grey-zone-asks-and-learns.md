---
status: accepted
---

# The grey zone asks, and corrections are learned

## Context

The rules are deliberately small and high-precision: an input with a work signal
below the action bar was stored as a thought. That is a guess, and it is wrong in
both directions — a defect report becomes a note, or a note is dragged into work.
Adding more keywords only moves the boundary; it does not make the decision
honest.

## Decision

- **A grey zone asks.** `lib/objectAmbiguity.ts` defines the band (a work score
  from 0.25 to 0.55, never a mood, never something already extracted).
  `processRawInput` then records a pending clarification of kind `object_mode`
  with three fixed options — defect, work, note — instead of storing a guess.
- **The answer creates the object.** `services/reclassify.ts`
  (`applyObjectChoice`) turns `bug`/`task` into one commitment and converts the
  carrying thought; `note` cancels any commitment the input produced and keeps
  the thought. The clarification resolves through the existing
  `resolveClarificationByOption`.
- **The user corrects at any time.** `POST /v1/inputs/:id/reclassify` applies the
  same function, so a wrong classification is one request away from right.
- **Corrections are learned, deterministically.** The terms of the corrected
  input (CJK three-character runs, Latin words) are stored per user in
  `classification_signals`. A later input that shares terms contributing at
  least two hits is classified the same way without asking. No model, no
  embeddings.
- **A model, when configured, handles the residue.** The same grey zone is the
  only place a model is needed for classification; with none configured the
  question is the fallback. The question is never a dead end.

## Consequences

- Nothing is silently guessed in the grey zone; the cost is one question.
- Signals are user data: they are purged with everything else and never used
  across users.
- The rule layer stays small and testable; fixtures pin provider behaviour, the
  suites pin the ask/answer/learn loop.
- A level of learning lives in the user's own corrections, not in a retrained
  model, so the behaviour stays explainable and reversible.
