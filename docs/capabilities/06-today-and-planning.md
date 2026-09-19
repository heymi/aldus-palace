# 6. Today & planning

> **Nobody wants a list of 87 things. Everybody wants to know what to do next.**
>
> **Delete the word “overdue”.**

**The moment.** You open your task app. Twelve items are red. You close it. You
still do not know what to do *now*, and the app has made you feel worse for
having written things down.

**What you get.** A view that answers one question — what now — and a planner
that adapts instead of nagging:

| Piece | Behaviour |
|---|---|
| **Now** | exactly one thing is highlighted; urgency, importance, time fit and context match score it, and the reason travels with it |
| **Timeline** | scheduled work, in order, including AI-suggested slots |
| **Risks** | the commitments that need attention — this is what replaces “overdue” |
| **Unscheduled** | everything else, visible without being shouted at |
| **Empty-day plan** | a genuinely empty day gets up to three suggestions instead of nothing |
| **Adaptive limits** | automatic additions stop at a cap (5, or 10 after you deliberately add more), then it suggests rest |
| **Daily buffer** | a quarter of the 09:00–18:00 window stays free; auto-fill stops before the day is full |
| **Dependencies** | a commitment that waits on another is never scheduled while a blocker is open |
| **Migration** | slipped, flexible, unstarted work moves forward; three deferrals ask for a decision, and a deadline never migrates silently |
| **Morning plan** | the day is classified into core, optional and deferred |
| **Replanning** | finishing something re-derives the day |
| **Stall detection** | the same queue of 1–3 items producing no completion for 24 h pauses auto-fill instead of piling on |
| **Behaviour model** | project weighting and preference signals are learned from a rolling 15-day window |

That learned layer is deliberately **not** memory: it is reversible planning
state, it never appears as a belief about you, and it never overrides a deadline
you set ([ADR 0001](../adr/0001-keep-adaptive-planning-state-outside-memory.md)).

**Who this is for.** Knowledge workers who want a daily focus; products that
should reduce anxiety rather than manufacture it.

## See it in 30 seconds

```bash
pnpm --filter @aldus-palace/example-today-only start
```

Five commitments exercising all four time models — a deadline, an availability
window, an AI slot and no time at all — then the Today projection and the
adaptive work-stream grouping.

## Use it as

| Level | How |
|---|---|
| **MCP** | profile `today` → `list_today` |
| **HTTP** | `GET /v1/today`, `POST /v1/plan/today`, `POST /v1/plan/migrate`, `POST /v1/commitments/:id/arrange-today`, `GET/POST/DELETE /v1/commitments/:id/dependencies` |
| **Library** | `buildToday`, `planEmptyToday`, `reconcileTodayPlan`, `recordUserTodayArrangement`, `migrateStaleWork`, `replanAfterChange`, `addDependency` |

## Proof

- `packages/core/src/services/today.ts` — the projection, `isRisk()`, the scored Now, the morning plan
- `packages/core/src/services/planToday.ts` — scoring for an empty day
- `packages/core/src/services/adaptivePlanning.ts` — caps, pause, rest suggestion, behaviour profile, buffer, duration estimation
- `packages/core/src/services/workMigration.ts` — slipped flexible work and deferral counting
- `packages/core/src/services/dependencies.ts` — blocked-by edges and cycle rejection
- `packages/core/src/services/replan.ts` — replanning after a change
- `packages/core/test/adaptivePlanning.test.ts`, `workMigration.test.ts`, `dependencies.test.ts`, `planningIntelligence.test.ts` — scenarios, offline
- `CONTEXT.md` — the vocabulary (`主动续排`, `续排暂停`, `规划经验`) behind the behaviour
