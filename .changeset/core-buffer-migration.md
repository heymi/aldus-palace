---
"@aldus-palace/core": minor
---

Add the daily buffer and task migration. `planCapacityMinutes` keeps a quarter
of the daytime window free and auto-fill respects it; `migrateStaleWork` moves
slipped, flexible, unstarted work forward, counts the deferral, and surfaces an
item after three deferrals instead of moving it again. A commitment with a
deadline never migrates silently. ADR 0008.
