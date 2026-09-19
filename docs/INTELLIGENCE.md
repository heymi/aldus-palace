# Core intelligence & privacy design

> **This is design, not a promise about the current release.** It records the
> system Aldus Palace is being built toward. Every section is split into what
> **ships today** and what is **designed**, so the two cannot be confused.

Aldus Palace is not a chat model with a database behind it. It is a system that
runs continuously: it reads input, decides what to remember, decides what it may
do, arranges real work, and calls a model only where a model helps.

## How to read this

| Marker | Meaning |
|---|---|
| **Shipped today** | runs in the current `0.x` release; the file that implements it is named |
| **Designed** | the direction the system is being built toward; tracked in [`ROADMAP.md`](../ROADMAP.md) |

Where this document disagrees with the code, `spec/schema.sql` or an
[ADR](adr), the code and the ADR win — the same rule as the
[design archive](internal/design-archive/README.md). The archive holds the
original Chinese essays these sections condense.

## The loop that ships

```
user / environment
      |
input          raw text, stored as written
      |
understanding  intent, typed objects, resolved dates, gates
      |
memory         candidates, evidence, confirmation, conflicts, versions
      |
planning       four kinds of time, today, risk, adaptive limits
      |
context        active memories and projects feed the next capture
```

The **Core Intelligence Layer** organises the middle of that loop into four
engines. Understanding — the capture front end in
[`agent/understand.ts`](../packages/core/src/agent/understand.ts) — is what
turns a sentence into typed objects today; the engines below decide what is kept,
what happens next, what the system may do on its own, and which model is used.

| Engine | Goal | Shipped today | Designed |
|---|---|---|---|
| **Memory** | understand a person over years, not store a chat log | extraction, pollution gate, activation rule, evidence, dedupe, conflict, versioning, FTS5 retrieval, graded levels, decay, value score | more kinds and signals |
| **Planning** | keep what matters happening while the environment changes | four kinds of time, priority scoring, slot search, Today, risk, adaptive limits, feedback model, constraints, duration estimate, scored Now, morning plan, buffer, migration | blended priority, rhythm-aware Now, schedule optimization |
| **Trust & autonomy** | widen what the system may do on its own, safely | the risk table, autonomy levels, trust score, permission evolution, durable execution | a level per call |
| **Model orchestration** | use the right model for each job | one provider interface, three implementations, the privacy guard at the boundary | routing by task |

---

## Memory Intelligence Engine

*The goal is to understand one person over years — not to archive a chat log.*

### Shipped today

- **Extraction** reads durability markers ("from now on", "as a rule") and
  repeated behaviour. Rules run with no model; a model adds general
  understanding.
- **Evaluation** drops what should not be remembered: a temporary state, a
  one-off creative fragment, a low-confidence guess.
- **Activation** follows one published rule — `confidence >= 0.8` and
  `importance >= 0.8` — everything below waits as a candidate.
- **Evidence on every row**: the excerpt it came from, a confidence value and the
  input id.
- **Duplicates collapse** to a normalised key (for example
  `preference|prefer_simplicity`).
- **Conflict detection** compares a candidate against active memories on the same
  dimension and reports the contradiction instead of storing both.
- **Versioning** marks a replaced belief `superseded` with a reason, and keeps it
  readable. Nothing is deleted.
- **Retrieval** injects active memories into the next capture, and every
  injection lands in the action log.
- **Five kinds** ship: preference, project context, principle, decision,
  experience.
- **A graded value model** (`lib/memoryValue.ts`): the kinds map onto levels
  0–3, each carries a decay half-life, and a value score (explicitness,
  frequency, impact, scope, future relevance) weighs retrieval. A fresh
  principle outranks an old experience on the same topic.

`lib/memoryExtract.ts` · `lib/memoryActivation.ts` ·
`services/memoryLifecycle.ts` · `services/memoryEvolution.ts`

### Designed

- **An identity level.** Levels 0–3 ship; identity (4) needs an identity kind
  before it can exist.
- **The full formation pipeline** — user experience → extraction → candidate →
  evaluation → conflict check → storage → activation → retrieval. Most stages
  ship; the candidate lifecycle is the part that keeps growing.
- **Four extraction signals** — a long-term phrase, repeated behaviour, impact on
  future decisions, and reach across projects. The first two ship; impact and
  scope extend the same extractor.
- **More kinds** — goal, relationship, knowledge, habit and episode, each with
  its own lifetime and evidence rules.
- **Decision memory keeps the *why*** — What, Why, When, Status — not only what
  was chosen.
- **A three-layer store, a memory graph, richer context assembly and a user
  memory control centre.**

---

## Planning Intelligence Engine

*This is the core that turns understanding into things happening: it decides when
and in what order work occurs in the real world. The goal is not a pretty
calendar — it is important work done with the least cognitive load while the
environment changes. Where a traditional calendar holds fixed blocks you adjust
by hand, this plans from goals, constraints and resources, and keeps adjusting.*

### Shipped today

- **Inputs are Commitments, not Tasks.** Planning reads commitments, the calendar
  (`events` of kind `fixed_external`) and a learned behaviour model.
- **Four kinds of time held apart** — deadline, availability window, suggested
  slot, unscheduled. There is no `overdue` state to occupy.
- **Constraints, concretely** — a deadline is a hard boundary and sets the risk
  tiers; an availability window bounds when work is eligible; a project
  preference is learned from behaviour.
- **Priority scoring** (`scoreCandidate`): risk and a deadline within 24 h or
  72 h form tiers; then recent-project continuity, an actionable title, a short
  duration, importance, title overlap with recent completions, learned project
  weights, and recent self-defined / short-next-step preferences.
- **Time-window generation and conflict avoidance** (`findSlot`): walk 15-minute
  steps from now to the end of the day, skipping AI slots and fixed external
  events, and take the next window that fits.
- **Duration estimation** (`estimateDurationMinutes`): a stated estimate keeps
  the larger weight and is calibrated against the median of completed work in
  the same project; two samples or more fill a missing estimate.
- **Dependency constraints.** A commitment can wait on another; the planner
  skips it while a blocker is open, a finished blocker releases it, and cycles
  are refused (`services/dependencies.ts`).
- **A daily buffer.** Capacity is the 09:00–18:00 window minus 25%; auto-fill
  counts the minutes already on the day and stops before the day is full
  (`planCapacityMinutes`).
- **Migration for slipped flexible work.** An open, unstarted commitment with no
  deadline whose slot or window ended moves forward: the slot is cleared and the
  deferral is counted. At three deferrals it surfaces for a decision instead
  (`services/workMigration.ts`).
- **Scheduling** writes `ai_slot_start/end`, a `today_assignments` row carrying a
  human-readable reason, and an `action_log` entry.
- **Execution monitoring** (`observePlanningOutcome`): record what the user did
  next — started, completed, scheduled today, created a commitment — as a
  feedback episode (project switch, same-project switch, self-defined task,
  stopped working).
- **Replanning** is a reconcile pass keyed on a plan version, triggered by the
  plan endpoint and when a new commitment is arranged for today; it can add up to
  three items to an empty or light day, and stall detection pauses auto-fill.
- **A scored Now** (`lib/nowScore.ts`): urgency, importance, whether the work
  fits the time left and whether it continues the current context decide the
  current action, and the reason travels with it.
- **A morning plan** (`lib/dayPlan.ts`): the day is classified into core,
  optional and deferred.
- **Replanning on change** (`services/replan.ts`): finishing something
  re-derives the day; a new task and a removal already did. A planning failure
  never fails the change that triggered it.
- **The day view**: Now (exactly one thing), timeline, risks (what replaces
  overdue), unscheduled, and a rest suggestion when the day is full.
- **Adaptive limits**: automatic additions stop at 5, or 10 after a deliberate
  add; a stalled queue of 1–3 items with no completion for 24 h pauses auto-fill.
- **Light triage**: an empty day is filled preferring concrete bugs and small
  executable work, and deprioritizing research or long epics.
- **A learned behaviour model** over a rolling 15-day window, kept as reversible
  planning state — never memory, and never overriding a deadline you set
  ([ADR 0001](adr/0001-keep-adaptive-planning-state-outside-memory.md)).

`services/today.ts` · `services/planToday.ts` · `services/adaptivePlanning.ts`

### Designed

- **A fuller pipeline** — constraint analysis → priority calculation →
  time-window generation → schedule optimization → conflict resolution →
  execution monitoring → replanning, with each stage carrying more of the model.
- **Soft constraints** — preferences that trade off against each other, not only
  rules that hold or fail.
- **A blended priority score** — impact and goal alignment join urgency,
  dependencies, context and time fit.
- **Complexity in duration estimation** — read task complexity alongside the
  history, not only the stated estimate and the project median.
- **A rhythm-aware Now** — energy match and a user rhythm join priority,
  available time and context match.
- **Event-driven replanning** — react to a postponed meeting, a new task,
  finishing early, or a change in state.
- **Buffer management by user rhythm** — keep a share of the day free that
  follows energy patterns, not only a fixed ratio.
- **Migration with a richer rule set** — dependencies and goal alignment decide
  what moves, not only the slot and the window.

---

## Trust & Autonomy Engine

*Widen what the system may do on its own — safely, and only as far as it has
earned.*

### Shipped today

- **One fixed rule.** A capture lands on its own; a principle the user states
  takes effect; everything else waits for the user. The runtime writes an
  `action_log` entry for every mutation.
- **An action gate** (`services/actionGate.ts`). Every proposed agent action is
  graded against a published table: low and medium run (medium is recorded as a
  notification), high waits for one approval, critical needs two, and an
  unclassified action waits. `action_proposals` holds the trail; a revocation is
  a status change, and every step writes an `action_log` entry.
- **Durable execution.** An approved action carries an executable descriptor, an
  idempotency key and an execution status; a registered executor runs it under a
  lease, the outcome is recorded, and a succeeded action never runs twice
  (`executeApprovedAction`). Deletion is the first real one: `POST /v1/me/purge`
  proposes `user_data_purge` and approval runs it.
- **A trust score and autonomy levels 0–4.** Trust is the Laplace-smoothed
  approval rate of the decisions the user made in the last 90 days; automatic
  runs do not count, so trust grows from decisions. The level follows thresholds
  with minimum samples.
- **Permission evolution with a user ceiling.** The effective level is
  `min(max(earned, 2), ceiling)`: the published rule is the floor, the user's
  ceiling (default 2, up to 4) is the consent, and the gate applies the result
  by default. Trust rises and falls with the record; high-risk autonomy needs the
  ceiling raised. `GET /v1/autonomy` and the MCP card expose the state.

### Designed

- **Proactive rules**, judged on evidence, pattern and value.
- **Routing the capture and planning flows through the gate.** Their action
  types are graded low today, so the gate is available without changing them.

---

## Model Orchestration Engine

*Use the right model for each job, instead of one model for every call.*

### Shipped today

- **One `LLMProvider` interface** and three implementations — dev
  (deterministic, offline), OpenAI-compatible and Anthropic. Configuration is
  resolved by the caller (`resolveProviderConfig`) and passed in explicitly; the
  runtime reads no environment variables.

`providers/`

### Designed

- **Routing by task**: a fast model for classification, a reasoning model for
  planning and conflict, an embedding model for memory retrieval, and a local
  model for sensitive input.

---

## Privacy & Security Architecture

*The system touches a person's work, decisions, relationships and habits. Privacy
is the shape of it, not a feature on top.*

### Shipped today

- A **SQLite file you own**, or one Cloudflare Durable Object — no vendor cloud.
- **Single-user** runtime: one static bearer token guards the API.
- `raw_inputs` is **immutable**; the AI pass writes only derived fields.
- Model output is **validated and gated** before it reaches storage.
- Every mutation writes an **`action_log`** entry.
- A memory becomes active only through the **published gate**
  (`confidence >= 0.8` and `importance >= 0.8`); an inferred principle waits for
  the user.
- **A Privacy Gateway** (`services/privacyGateway.ts`): a cloud call is prepared
  by data level — project names, money, emails and phone numbers are replaced,
  level 4 stays local, and each call is logged without its content.
- **The gateway is a boundary** (`providers/guard.ts`): a cloud provider is only
  constructed with a message guard, which redacts user-role messages and refuses
  level 4, so a call cannot leave unredacted.
- **Progressive, fine-grained permissions** (`services/permissions.ts`): calendar
  read by default; mail, files and memory scopes on request; Memory is private
  until a memory scope is granted.
- **True deletion** (`services/dataLifecycle.ts`): `purgeUserData` deletes every
  row the user owns in one transaction, after an explicit confirmation.

`SECURITY.md` records the current posture and the threat model.

### The privacy model

**Three principles**

1. **User owns the context.** Memory, Thoughts, Decisions and project context
   belong to the user, not the platform.
2. **Minimum Data Exposure.** Send only what the task needs; never the whole
   database.
3. **Local First.** What can be processed locally is processed locally.

**Five data levels**

| Level | Data | Handling |
|---|---|---|
| 0 | public data | no protection needed |
| 1 | personal preferences | ordinary |
| 2 | work context | high |
| 3 | sensitive work data | very high |
| 4 | private cognitive data — unshared ideas, decision process, business plans, long-term Memory | highest |

**Local intelligence layer, cloud AI layer**

- *Local*: input parsing, simple classification, Memory indexing, sensitive
  detection, calendar reads, basic planning.
- *Cloud*: deep reasoning, long-text analysis, complex planning, high-quality
  generation.

**Privacy Gateway.** Every cloud call passes through:
`user input → sensitive detection → redaction → permission check → cloud AI`.
The real mapping stays local.

> "Discuss Orvia funding with Zhang tomorrow" leaves as
> "discuss [business] funding with [contact] tomorrow".

**Memory storage.** Memory is the most sensitive data, so the design stores it
encrypted on device — Keychain plus an encrypted database on macOS, Secure Enclave
plus encrypted storage on iOS. The cloud receives temporary context by default,
never the full Memory.

**Permissions are progressive and fine-grained.** Calendar first, then mail, then
advanced files. A permission is split by scope (read / create / modify events).
Memory is private by default, with optional Sync or AI Assist.

**The Action Gate.** Every action follows
`propose → risk assessment → permission check → execute → record`, with risk
graded:

| Risk | Behaviour |
|---|---|
| low | automatic |
| medium | notify |
| high | confirm |
| critical | confirm again |

The audit log is viewable and revocable.

**Data lifecycle.** Create → process → store → use → archive → delete. When the
user deletes, the deletion is real: the local database, the full-text memory
index and every derived row are all covered.

### Designed

- **Local encrypted storage** for Memory — Keychain plus an encrypted database on
  macOS, Secure Enclave plus encrypted storage on iOS.
- **A level per call** — today the guard uses one level per provider
  (`PRIVACY_LEVEL`, default 2); a capture about money could ask for a higher one
  at the call site.

## Action items

- [x] A **Local Intelligence Layer** — input parsing, classification, Memory
      indexing and planning run on the device.
- [x] A **Privacy Gateway** and redaction flow, enforced at the provider
      boundary.
- [x] **Progressive and fine-grained permissions**, with Memory private by
      default.
- [x] An **Action Gate** with risk levels, and a viewable, revocable audit log.
- [x] A **delete policy** that reaches the local database, the full-text memory
      index and every derived row.
- [ ] **Local encrypted storage** for Memory (Keychain / Secure Enclave plus an
      encrypted database).

---

## Sources

The design above condenses four essays in the
[design archive](internal/design-archive/README.md):

| Archive document | Subject |
|---|---|
| [`13__Core_Intelligence_Specification…`](internal/design-archive/13__Core_Intelligence_Specification_核心智能系统设计_.md) | the four engines |
| [`7__Memory_System_Technical_Design…`](internal/design-archive/7__Memory_System_Technical_Design_长期记忆系统技术设计_.md) | memory types, scoring, decay |
| [`8__AI_Planning_Engine_Technical_Design…`](internal/design-archive/8__AI_Planning_Engine_Technical_Design_智能规划引擎设计_.md) | constraints, priority, replanning |
| [`9__Security___Privacy_Architecture…`](internal/design-archive/9__Security___Privacy_Architecture_安全与隐私架构设计_.md) | principles, gateway, action gate |

See also [`ARCHITECTURE.md`](ARCHITECTURE.md) for what runs today and
[`ROADMAP.md`](../ROADMAP.md) for the status of each designed part.
