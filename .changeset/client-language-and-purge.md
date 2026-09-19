---
"@aldus-palace/client": patch
---

Add `updateMe({ language })` for `PATCH /v1/me`, and fix `purge()` for a critical
action: permanent deletion takes two approvals, so the client asks again when the
first decision leaves the proposal in `pending_second`, instead of failing with
`purge_did_not_execute`.
