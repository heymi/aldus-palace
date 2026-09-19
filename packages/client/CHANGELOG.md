# @aldus-palace/client

## 0.2.1

### Patch Changes

- 62a5eac: Add `updateMe({ language })` for `PATCH /v1/me`, and fix `purge()` for a critical
  action: permanent deletion takes two approvals, so the client asks again when the
  first decision leaves the proposal in `pending_second`, instead of failing with
  `purge_did_not_execute`.

## 0.2.0

### Minor Changes

- d0d813e: `purge()` now goes through the Action Gate: it proposes the deletion and
  approves it in one call, then returns the executor's result.
