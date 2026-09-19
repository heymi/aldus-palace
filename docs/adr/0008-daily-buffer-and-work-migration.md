---
status: accepted
---

# A daily buffer, and migration for slipped flexible work

## Context

Two gaps in the planner. It filled an empty day up to a fixed number of items,
so a day could be scheduled to the minute with no room for the unexpected. And
work whose suggested slot or availability window passed stayed where it was:
nothing moved it forward, and nothing noticed that it kept slipping.

## Decision

**The planner keeps a quarter of the daytime window free.** Capacity is the
09:00–18:00 local window minus 25% (nine hours plan as 6.75). Auto-fill counts
the estimated minutes already on the day — the items on it plus fixed events —
and stops when the next item would cross the capacity. The item-count cap stays.

**Slipped, flexible, unstarted work migrates on its own.** `migrateStaleWork`
moves an open commitment whose suggested slot or availability window has ended,
when it has no deadline and has not started: the slot is cleared so the planner
can place it again, `scheduled` returns to `planned`, and `deferral_count`
increments. A commitment with a deadline never migrates silently — a missed
deadline is a risk the user moves.

**Repeated deferrals surface instead of moving again.** At three deferrals the
item stops migrating and appears in `needs_confirmation`; the first surfacing is
recorded once (`migration_surfaced_at`) so the log does not repeat.

**Planning runs migration first.** `POST /v1/plan/today` migrates before it
reconciles, and `POST /v1/plan/migrate` is the explicit entry point.

## Consequences

- A full day is harder to over-schedule, and the remaining room is visible as a
  number (`planCapacityMinutes`, `planBufferMinutes`).
- Flexible work follows the user instead of accumulating stale slots; hard
  deadlines keep their meaning.
- Deferrals are counted and readable, and a repeatedly deferred item asks for a
  decision rather than drifting.
- Covered by `packages/core/test/workMigration.test.ts` and the buffer scenarios
  in `packages/core/test/adaptivePlanning.test.ts`.
