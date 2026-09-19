---
status: accepted
---

# Trust grows from decisions, and autonomy is a level on top of the gate

## Context

The Action Gate (ADR 0005) grades every proposed agent action with a fixed
table: low and medium run, high waits for one approval, critical needs two.
That rule treats every user the same, while the design calls for authority to
widen with demonstrated reliability. Nothing represented earned trust.

## Decision

- **Trust is the approval rate of explicit decisions.** `computeTrustScore`
  reads `action_proposals` for rows the user decided in the last 90 days:
  `approved` counts positive, `rejected` and `revoked` count negative, and
  `pending_second` does not count. The score is Laplace-smoothed,
  `(approvals + 1) / (samples + 2)`, so no history starts at 0.5 and three
  approvals reach 0.8. Automatic runs carry no `decided_at`, so they do not
  count: trust grows from decisions, not from silence.
- **The level follows the score with minimum samples.** `autonomyLevelFor`
  returns 0 with fewer than three decisions, then 1 at 0.5, 2 at 0.7 with five
  samples, 3 at 0.85 with ten, and 4 at 0.95 with twenty.
- **A level widens what runs without asking.** `effectiveStatusFor(risk, level)`
  maps the risk to a status: level 1 runs low risk, level 2 adds medium, level 3
  adds high, level 4 runs critical with a record. Everything still writes an
  action-log entry.
- **The published table stays the default.** `proposeAction` only consults a
  level when the caller passes one; without it the ADR 0005 rule applies
  unchanged.
- Trust is **derived, not stored**: no new table and no migration.
  `GET /v1/autonomy` returns the score and level, and the MCP `list_actions`
  card carries them.

## Consequences

- "Authority grows with reliability" is now a mechanism with numbers, not a
  design sentence.
- A product can expose the level as a user setting; permission evolution now
  applies it automatically, capped by the user's ceiling (ADR 0007).
- The score is explainable: approvals and rejections are rows the user can read.
- Covered by `packages/core/test/trustScore.test.ts` and the MCP tool test.
