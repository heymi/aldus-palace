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
| Memory | `memories` | durable personal context — active through the gate, or a candidate waiting for the user |
| Concept | `concepts` | a reusable cognitive node (e.g. “simplicity”, “privacy”) |
| Project | `projects` | context container with a free-form `brief` used for grounding |
| Event | `events` | fixed external calendar entries and AI work blocks (read-mostly) |
| ActionLog | `action_logs` | every user/agent mutation, with a reason |

### Agent state

| Table | Role |
|---|---|
| `commitment_dependencies` | a commitment waits on another; the planner skips it while a blocker is open |
| `action_proposals` | the Action Gate: risk, status, decision and revocations for agent actions |
| `autonomy_settings` | how far earned trust may widen autonomy (the ceiling) |
| `permission_grants` | granted permission scopes; absence means not granted |
| `classification_signals` | terms from inputs the user corrected, and the mode they chose; applied before asking (ADR 0012) |
| `clarifications` | a pending question about a record (a relative day, or what an input is) |

`commitments` also carries `deferral_count` and `migration_surfaced_at` for
slipped flexible work (see [ADR 0008](adr/0008-daily-buffer-and-work-migration.md)).

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
2. **Memory passes a published gate.** A high-confidence rule the user states is
   inserted as `active` on capture; an inferred principle and anything below the
   gate is inserted as `candidate` and waits. Only `active` memories are injected
   into the understanding context. `evidence` and `confidence` are required, and
   near-duplicates are rejected.
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
| `memories.status` | `candidate`, `active`, `archived` (plus the derived `superseded`) |
| `memories.type` | `preference`, `project_context`, `principle`, `decision`, `experience` |
| `raw_inputs.processing_status` | `pending`, `local`, `enriching`, `processed`, `failed` |
| `memories.source` | `user_explicit`, `ai_inferred`, `decision_promote` |
| `action_proposals.risk` | `low`, `medium`, `high`, `critical` |
| `action_proposals.status` | `approved`, `notified`, `proposed`, `pending_second`, `rejected`, `revoked` |
| `action_proposals.actor` | `user`, `agent` |
| `autonomy_settings.ceiling` | `2`, `3`, `4` |

## Memory evolution

A memory is never overwritten. These columns carry the history:

| Column | Meaning |
|---|---|
| `supersedes_id` | the older memory this one replaced |
| `superseded_by_id` | the newer memory that replaced this one |
| `supersede_reason` | why the user accepted the replacement |
| `conflicts_with_id` | the confirmed memory this candidate disagrees with |
| `conflict_reason` | the detected contradiction |

`memoryState()` derives one of `candidate` / `active` / `superseded` / `archived`
from `status` plus `superseded_by_id`, so the `CHECK` constraint stays intact and
existing databases need no table rebuild.

`activation` distinguishes how a memory became active without another column:
`confirmed_at` set means the user confirmed it, `confirmed_at` null means the
capture activated it (`confidence >= 0.8` and `importance >= 0.8`). See
`lib/memoryActivation.ts`.

## Migrations

`migrate()` is forward-only and records every version in `schema_migrations`.
Never edit a shipped migration — add a new one. The migration set is part of the
public contract, because it runs against databases other people already own.

```ts
await applySchema(db);          // idempotent DDL
await migrate(db);              // pending migrations only
await initialize(db);           // both, in order — what servers call
```
