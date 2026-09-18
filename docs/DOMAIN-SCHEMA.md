# Domain schema

The canonical DDL lives in [`packages/core/src/db/schema.ts`](../packages/core/src/db/schema.ts);
[`spec/schema.sql`](../spec/schema.sql) is generated from it (`pnpm gen:spec`).

## Objects

| Object | Table | Role |
|---|---|---|
| RawInput | `raw_inputs` | immutable audit record of what the user actually said |
| Thought | `thoughts` | an idea, insight, observation, research note or decision candidate |
| Commitment | `commitments` | something the user intends to get done |
| Decision | `decisions` | a choice, with a reason, that can be superseded or retracted |
| Memory | `memories` | durable personal context — **candidate until confirmed** |
| Concept | `concepts` | a reusable cognitive node (e.g. “simplicity”, “privacy”) |
| Project | `projects` | context container with a free-form `brief` used for grounding |
| Event | `events` | fixed external calendar entries and AI work blocks (read-mostly) |
| ActionLog | `action_logs` | every user/agent mutation, with a reason |

### Projections (never truth sources)

| Table | Rebuildable from |
|---|---|
| `today_assignments` | commitments + planning decisions |
| `commitment_classifications` | commitments + projects + active memories |
| `planning_day_states`, `planning_profiles`, `planning_feedback_episodes` | planner behaviour over time |

Deleting a projection must never change what the user committed to — see
[ADR 0002](adr/0002-keep-work-classification-as-rebuildable-projection.md).

## Key invariants

1. **`raw_inputs` is sacred.** Model output only ever writes fields *derived*
   from it; the original text is never rewritten.
2. **Memory needs confirmation.** New memories are inserted as `candidate`;
   only `active` memories are injected into the understanding context.
   `evidence` and `confidence` are required, and near-duplicates are rejected.
3. **Commitments are deduplicated.** Re-capturing a near-identical intention
   skips the insert and surfaces the existing commitment instead.
4. **Dates are resolved server-side.** `deadline`, `window_start`/`window_end`
   and `ai_slot_start`/`ai_slot_end` are distinct fields: a deadline is not a
   schedule, and an AI suggestion is not a calendar event.
5. **Time is stored as ISO-8601 UTC**, with the user's timezone applied when
   computing “today”.
6. **Statuses are constrained** by `CHECK` in the schema and mirrored in
   `domain/types.ts`:

| Field | Values |
|---|---|
| `thoughts.status` | `captured`, `exploring`, `converted`, `archived` |
| `thoughts.type` | `idea`, `insight`, `observation`, `research`, `decision_candidate` |
| `commitments.status` | `captured`, `planned`, `scheduled`, `completed`, `cancelled`, `risk` |
| `memories.status` | `candidate`, `active`, `archived` |
| `memories.type` | `preference`, `project_context`, `principle`, `decision`, `experience` |
| `raw_inputs.processing_status` | `pending`, `local`, `enriching`, `processed`, `failed` |
| `memories.source` | `user_explicit`, `ai_inferred`, `decision_promote` |

## Migrations

`migrate()` is forward-only and records every version in `schema_migrations`.
Never edit a shipped migration — add a new one. The migration set is part of the
public contract, because it runs against databases other people already own.

```ts
await applySchema(db);          // idempotent DDL
await migrate(db);              // pending migrations only
await initialize(db);           // both, in order — what servers call
```
