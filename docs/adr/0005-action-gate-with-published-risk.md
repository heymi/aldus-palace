---
status: accepted
---

# An action gate with a published risk table

## Context

The runtime takes actions on the user's behalf: it captures, activates memories
and assigns planning slots. The autonomy rule in [`AGENTS.md`](../../AGENTS.md)
says low-risk actions may run and high-risk actions need explicit confirmation,
but nothing in the code represented a *pending* action, a decision, or a
revocation. An agent either acted or did not, and the only trace was the action
log.

## Decision

Every agent action can be routed through `runGatedAction`:

1. **Propose.** The action is recorded in `action_proposals` with its type,
   payload, actor and risk.
2. **Grade.** `assessActionRisk` reads a published table in
   `services/actionGate.ts`. An action that is not in the table is graded
   `high`, so a new capability waits until it is classified.
3. **Decide.**
   - `low` → `approved`, the callback runs.
   - `medium` → `notified`, the callback runs and the notification is recorded.
   - `high` → `proposed`, waiting for one approval.
   - `critical` → `proposed`; the first approval moves it to `pending_second`,
     the second approves it.
4. **Record.** Proposal, decision and revocation each write an `action_log`
   entry. Revoking is a status change; nothing is deleted.

The gate ships as a service and an HTTP surface (`GET /v1/actions`,
`POST /v1/actions/:id/decide`, `POST /v1/actions/:id/revoke`). It does **not**
intercept the existing capture and planning flows yet; those can be routed
through it without changing their behaviour, because their action types are
graded `low`.

## Consequences

- A high-risk action can now wait, be approved, be rejected, or be revoked, and
  the whole path is readable in `action_proposals` and the action log.
- Autonomy levels and a trust score (design in
  [`docs/INTELLIGENCE.md`](../../docs/INTELLIGENCE.md)) can build on the
  proposal table rather than on a new mechanism.
- New agent capabilities must be classified in the risk table or they default
  to waiting.
- Covered by `packages/core/test/actionGate.test.ts`.
