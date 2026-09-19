# Glossary

The shared vocabulary. Planning-specific terms live in
[`CONTEXT.md`](../CONTEXT.md).

## Objects

| Term | Meaning | Table |
|---|---|---|
| **Raw input** | the user's words, stored as written and never edited | `raw_inputs` |
| **Thought** | something worth keeping that is not yet work: an idea, insight, observation, research note or decision candidate | `thoughts` |
| **Commitment** | something the user intends to do; carries the four kinds of time and a status | `commitments` |
| **Decision** | a choice, with the reasoning attached | `decisions` |
| **Memory** | a durable belief about the user: preference, project context, principle, decision or experience | `memories` |
| **Project** | a durable container that commitments and memories can point at | `projects` |
| **Concept** | a reusable cognitive node (for example "simplicity") linked from memories | `concepts` |

## Time and status

| Term | Meaning |
|---|---|
| **Deadline** | the world imposes this time |
| **Availability window** | the work can happen anywhere inside `window_start` / `window_end` |
| **Suggested slot** | an agent proposal in `ai_slot_start` / `ai_slot_end`; not a promise |
| **Unscheduled** | open work with no time attached; still visible |
| **Risk** | the state that replaces `overdue`: a date that needs attention and can be moved |
| **Buffer** | the share of the daytime window the planner keeps free (a quarter by default) |
| **Deferral** | one automatic move of a slipped, flexible, unstarted commitment; counted on the row |
| **Migration** | clearing a slipped slot so the planner can place the work again; after three deferrals the item asks for a decision |
| **Status** | `captured → planned → scheduled → completed`, plus `risk` and `cancelled` |

## Memory lifecycle

| Term | Meaning |
|---|---|
| **Candidate** | a proposed memory waiting for confirmation |
| **Active** | a memory in effect; `activation_note` says whether the user stated it, confirmed it, or the system inferred it |
| **Superseded** | a replaced belief, kept readable in the version chain |
| **Archived** | a memory the user removed from use |
| **Evidence** | the excerpt, confidence and input id behind a memory |
| **Activation gate** | `confidence >= 0.8` and `importance >= 0.8`; everything below waits as a candidate |

## Runtime

| Term | Meaning |
|---|---|
| **Understanding** | the capture front end: a sentence into typed objects, dates resolved, duplicates skipped |
| **Progressive capture** | the local pass writes first; the model replaces derived fields under a lease |
| **Enrichment lease** | the mechanism that makes "local first, model second" idempotent under retries |
| **Action log** | an append-only row written on every mutation, with a reason |
| **Action Gate** | the published risk table that decides whether a proposed agent action runs or waits; a decision is logged and revocable (`services/actionGate.ts`) |
| **Trust score** | the Laplace-smoothed approval rate of the decisions the user made in the last 90 days; automatic runs do not count |
| **Autonomy level** | 0–4, derived from the trust score with minimum samples |
| **Autonomy ceiling** | how far earned trust may widen autonomy (default 2, up to 4); raising it is the user's explicit consent |
| **Effective level** | `min(max(earned, 2), ceiling)` — what the gate applies; the published rule is the floor |
| **Storage port** | the async `SqlDatabase` interface; the only I/O boundary in `packages/core` |
| **Projection** | a view rebuilt from the source of truth, never a second truth (Today, work streams) |

## Documentation markers

| Marker | Meaning |
|---|---|
| **Shipped today** | runs in the current `0.x` release |
| **Designed** | the direction the system is being built toward; tracked in [`ROADMAP.md`](../ROADMAP.md) |
