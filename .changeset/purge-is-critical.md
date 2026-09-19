---
"@aldus-palace/core": minor
---

Classify permanent deletion, and look up action types case-insensitively.

`user_data_purge` was unlisted, so the gate graded it `high` (one approval). It is
permanent, so it is now `critical` and takes two approvals, like the other
irreversible action. The risk table is also matched case-insensitively, so
`Payment` grades the same as `payment`.
