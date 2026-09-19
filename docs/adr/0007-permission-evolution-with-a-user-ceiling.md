---
status: accepted
---

# Permission evolution, capped by a user ceiling

## Context

ADR 0006 gave the gate a trust score and autonomy levels, but a caller had to
pass the level for it to matter. The design says authority should rise and fall
with the record on its own. Letting it rise without limit would contradict the
autonomy rule in [`AGENTS.md`](../../AGENTS.md): deleting data and permanent
memory require explicit user confirmation.

## Decision

- **The published rule is the baseline.** Level 2 is what the gate already does:
  low runs, medium runs as a notification, high and critical wait. A fresh user,
  and a user whose record falls apart, behave exactly as before.
- **The user sets a ceiling.** `autonomy_settings.ceiling` defaults to 2 and
  accepts 2, 3 or 4. Raising it is the explicit consent that lets earned trust
  widen autonomy. `setAutonomyCeiling` writes an
  `autonomy_ceiling_changed` action-log entry.
- **The effective level is derived and capped.**
  `effective_level = min(max(level, 2), ceiling)`, where `level` comes from the
  trust score and its minimum samples. `getAutonomyState` returns all three, so
  the gap between earned and allowed is visible.
- **The gate applies it by default.** `proposeAction` reads
  `effective_level` when the caller does not pass a level; an explicit
  `autonomyLevel` still overrides.
- **Critical stays gated until the top ceiling.** With ceiling 2 or 3, a
  critical action still waits; only ceiling 4 lets level 4 run it with a record.

## Consequences

- "Authority grows with demonstrated reliability" is now a mechanism, and it
  falls back when rejections accumulate.
- High-risk autonomy is impossible without an explicit user decision, so the
  change respects the autonomy rule.
- The default is inert by design: the feature does nothing until the ceiling is
  raised. Tests cover the baseline, the rise, the fall, the top ceiling and the
  rejected values in `packages/core/test/trustScore.test.ts`.
- `initialStatus` remains the baseline helper for callers that want the rule
  without the record.
