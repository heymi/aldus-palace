---
"@aldus-palace/core": minor
---

Add `replanAfterChange`: finishing a commitment re-derives the Today plan, and
a planning failure never fails the change that triggered it. `POST
/v1/commitments/:id/complete` returns the replan result.
