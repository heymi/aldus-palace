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
| **Designed** | recorded and not built yet; tracked in [`ROADMAP.md`](../ROADMAP.md) |

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
| **Memory** | understand a person over years, not store a chat log | extraction, pollution gate, activation rule, evidence, dedupe, conflict, versioning, retrieval | graded levels, decay, value score, more kinds and signals |
| **Planning** | keep what matters happening while the environment changes | four kinds of time, Today, risk, adaptive limits | constraints, priority, scheduling, replanning, delay model |
| **Trust & autonomy** | widen what the system may do on its own, safely | one fixed rule | risk model, autonomy levels, trust score, permission evolution |
| **Model orchestration** | use the right model for each job | one provider interface, three implementations | routing by task |

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

`lib/memoryExtract.ts` · `lib/memoryActivation.ts` ·
`services/memoryLifecycle.ts` · `services/memoryEvolution.ts`

### Designed

- **A graded model.** Five levels, where a higher level carries more weight in
  future decisions:

  | Level | Name | What it holds |
  |---|---|---|
  | 0 | Raw experience | what happened |
  | 1 | Observation | a pattern noticed once |
  | 2 | Preference | a recurring choice |
  | 3 | Principle | a value that shapes decisions |
  | 4 | Identity model | who the person is |

- **The full formation pipeline** — user experience → extraction → candidate →
  evaluation → conflict check → storage → activation → retrieval. Most stages
  ship; the candidate lifecycle is the part that keeps growing.
- **Four extraction signals.** Two ship (a long-term phrase, repeated
  behaviour). Two do not: **impact** on future decisions and **scope** across
  projects.
- **A value score** — explicitness + frequency + impact + scope + future
  relevance — gating on the total, where today importance follows the memory kind
  and confidence follows the extraction rule.
- **Pollution prevention** stays three rules: a mood is not a trait, one
  inference is not a principle, every memory carries evidence.
- **Decay by kind.** Identity does not decay; principle decays slowly;
  preference over months; habit over weeks; a current state over days. Today no
  memory weakens with time.
- **The remaining kinds.** Goal, relationship, knowledge, habit and episode, each
  with its own lifetime and evidence rules.
- **Decision memory keeps the *why*** — What, Why, When, Status — not only what
  was chosen.
- **A three-layer store, a memory graph, retrieval ranking, context assembly and
  a user memory control centre.** Today retrieval is one injection step.

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
- **Priority scoring** (`scoreCandidate`): risk and a deadline within 24 h or
  72 h form tiers; then recent-project continuity, an actionable title, a short
  duration, importance, title overlap with recent completions, learned project
  weights, and recent self-defined / short-next-step preferences.
- **Time-window generation** (`findSlot`): walk 15-minute steps from now to the
  end of the day, skipping AI slots and fixed external events, until a real slot
  fits.
- **Scheduling** writes `ai_slot_start/end`, a `today_assignments` row carrying a
  human-readable reason, and an `action_log` entry.
- **Execution monitoring** (`observePlanningOutcome`): record what the user did
  next — started, completed, scheduled today, created a commitment — as a
  feedback episode (project switch, same-project switch, self-defined task,
  stopped working).
- **Replanning** is a reconcile pass keyed on a plan version; it can add up to
  three items to an empty or light day.
- **The day view**: Now (exactly one thing), timeline, risks (what replaces
  overdue), unscheduled, and a rest suggestion when the day is full.
- **Adaptive limits**: automatic additions stop at 5, or 10 after a deliberate
  add; a stalled queue of 1–3 items with no completion for 24 h pauses auto-fill.
- **A learned behaviour model** over a rolling 15-day window, kept as reversible
  planning state — never memory, and never overriding a deadline you set
  ([ADR 0001](adr/0001-keep-adaptive-planning-state-outside-memory.md)).

`services/today.ts` · `services/planToday.ts` · `services/adaptivePlanning.ts`

### Designed

- **The full pipeline** — commitments → constraint analysis → priority
  calculation → time-window generation → schedule optimization → conflict
  resolution → execution monitoring → replanning. Monitoring and replanning
  ship; constraint analysis and schedule optimization are partial.
- **A constraint model** — hard, soft, preference and dependency constraints. A
  deadline is treated as hard today and project preference is learned, but
  dependencies are not modelled.
- **A dynamic priority score** — impact × urgency × dependency × goal alignment ×
  risk, replacing a manual priority field.
- **Duration estimation** — today a commitment uses the user's estimate or a
  45-minute default. The design blends the user's estimate with historical
  similar tasks and complexity.
- **Schedule optimization** — maximize important work completed, minimize
  switching, fit the user's rhythm, lower stress, with an explicit
  context-switching cost. Project weighting is the first piece of it.
- **A morning day plan** — classify the day into core, optional and deferred.
- **Now selection** — the Now slot is not the highest-priority task but the best
  current action: priority × available time × energy match × context match.
- **Dynamic replanning triggers** — a postponed meeting, a new task, finishing
  early, a change in state.
- **Buffer management** — keep 20–30% of the day free, so eight hours of work is
  planned as 5.5.
- **Task migration** — a flexible, unstarted task with a future window can move
  on its own; three consecutive deferrals ask for confirmation.

---

## Trust & Autonomy Engine

*Widen what the system may do on its own — safely, and only as far as it has
earned.*

### Shipped today

- **One fixed rule.** A capture lands on its own; a principle the user states
  takes effect; everything else waits for the user. The runtime writes an
  `action_log` entry for every mutation.

### Designed

- **An action risk model** — risk, reversibility and visibility of each proposed
  action.
- **Autonomy levels 0–4** — from "propose only" to "act and report".
- **A trust score** accumulated from outcomes, not assumed.
- **Permission evolution** — authority grows with demonstrated reliability.
- **Proactive rules**, judged on evidence, pattern and value.

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
- **Single-user** runtime: one static bearer token, no accounts, no multi-tenant
  isolation.
- `raw_inputs` is **immutable**; the AI pass writes only derived fields.
- Model output is **validated and gated** before it reaches storage.
- Every mutation writes an **`action_log`** entry.
- A memory becomes active only through the **published gate**
  (`confidence >= 0.8` and `importance >= 0.8`); an inferred principle waits for
  the user.

`SECURITY.md` records the current posture and the threat model, including what is
explicitly out of scope today: at-rest encryption, multi-tenant isolation, and
protecting against a compromised host.

### Designed

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
> "discuss [business matter] with [contact] tomorrow".

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
user deletes, the deletion is real: local database, cloud sync and vector indexes
are all covered.

---

## Action items

These are the concrete pieces the privacy design adds on top of today's runtime:

- [ ] A **Local Intelligence Layer** — input parsing, sensitive detection, Memory
      indexing, basic planning.
- [ ] A **Privacy Gateway** and redaction flow, so the cloud receives only
      temporary context.
- [ ] **Local encrypted storage** for Memory (Keychain / Secure Enclave plus an
      encrypted database).
- [ ] **Progressive and fine-grained permissions**, with Memory private by
      default.
- [ ] An **Action Gate** with risk levels, and a viewable, revocable audit log.
- [ ] A **delete policy** that reaches the local database, cloud sync and vector
      indexes.

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
