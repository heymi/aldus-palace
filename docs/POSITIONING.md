# Positioning

## The one-liner

> **The auditable memory layer for AI applications.**
>
> A self-hosted runtime that turns free-form input into typed, explainable
> objects — usable over MCP, over HTTP, or as a library.

## What it is

Aldus Palace turns free-form input into structured objects a program can act on —
and keeps them honest over time.

You speak or type. The runtime decides what it is (a thought, a commitment, a
decision, something worth remembering), when it is due, whether you have said it
before, and whether it contradicts something it already believes about you. It
records all of it in a database you own.

It is not a todo app, a calendar client, a note editor or a chatbot wrapper.
Tasks and calendar entries are *projections* of deeper objects.

## The three things worth telling someone about

### 1. Delete "overdue" from your vocabulary

Time is not an attribute of a task; it is the **result of scheduling**.

Most tools model one field — `dueDate` — and then punish you with a red badge
when it passes. Aldus Palace separates four different kinds of time:

| Kind | Field | Meaning |
|---|---|---|
| Deadline | `deadline` | the world imposes this |
| Availability window | `window_start` / `window_end` | it can happen any time in here |
| AI-suggested slot | `ai_slot_start` / `ai_slot_end` | a suggestion, not a promise |
| Nothing yet | — | unscheduled work, still visible |

Statuses are `captured → planned → scheduled → completed`, with `risk` and
`cancelled`. **There is no `overdue` state in the schema, because there is no
such thing.** A missed date becomes a risk you can see and rearrange.

*Proof:* `packages/core/src/db/schema.ts` (`commitments`), `services/today.ts`.

### 2. Memory you can audit — and that knows when you changed your mind

Assistant memory is usually a black box: something gets written, nobody knows
why, and it stays as written.

Here, every memory can explain itself and can be taken back:

- **High-confidence memories take effect on capture.** Rules you state, and
  inferences the system is confident about, start working at once. Everything
  else waits as a candidate until you confirm it.
- **Every row says why it is active.** `activation_note` distinguishes "stated by
  you", "confirmed by you" and "inferred during a capture", with the confidence
  and importance that decided it.
- **Evidence on every row.** Each memory carries the excerpt it came from, a
  confidence value, and the input id. Archive any of them, including one the
  system stored on its own.
- **Temporary states are rejected.** “I'm tired today” stays a mood; the gate
  drops it before it reaches your profile.
- **Duplicates collapse.** Different phrasings of the same principle normalise to
  one key and merge.
- **Contradictions surface.** Say the opposite of a confirmed belief and the
  candidate is flagged with the memory it conflicts with.
- **Replacing keeps history.** Confirming a replacement marks the old memory
  `superseded` with a pointer and a reason. Nothing is deleted, so “why do you
  think that about me?” has an answer.

*Proof:* `services/memoryLifecycle.ts`, `services/memoryEvolution.ts`,
`lib/memoryExtract.ts`, `test/memoryEvolution.test.ts`.

### 3. The raw input stays as written

Everything you say is stored verbatim in `raw_inputs`. Models
only fill *derived* fields, and every write passes server-side gates:

- one object mode per capture (a thought cannot become the same commitment twice)
- near-duplicate commitments are skipped, not duplicated
- relative dates (“next Wednesday”) are resolved on the server, not trusted to a prompt
- a failed model pass leaves the deterministic result in place instead of an empty record

That makes the AI layer **auditable**: you can diff what you said against
what the system stored.

*Proof:* `agent/understand.ts`, `eval/fixtures/`, `test/inputObjectClassification.test.ts`.

## Two more that developers feel immediately

**Background enrichment you can trust.** Waiting on a model is where products
lose people. The runtime answers in milliseconds with a deterministic result,
then lets the model replace it under a lease — so retries, concurrent clients and
crashed workers cannot corrupt or duplicate anything. See
[ADR 0003](adr/0003-progressive-capture-with-enrichment-leases.md).

**An agent you can run in CI.** A deterministic provider plus
replayable acceptance fixtures means the whole pipeline is testable offline, with
no API key. `pnpm test && pnpm eval` is green in a fresh clone.

## How it compares

| | Aldus Palace | Todoist / Things | Notion / PKM | Claude / ChatGPT memory | Motion / Reclaim |
|---|---|---|---|---|---|
| Who structures your input | the runtime decides | you do | you do | assistant, conversationally | partially |
| Time model | 4 kinds, held apart | one due date | free text | conversation only | calendar slots |
| Memory | candidates, evidence, versioning | saved views you maintain | documents you maintain | assistant memory, inside the app | learned preferences |
| Data location | your SQLite file or your Worker | vendor cloud | vendor cloud | vendor cloud | vendor cloud |
| Programmable | MCP · HTTP · library | API | API | in-app | calendar API |
| Replayable offline | 19 suites and 11 fixtures, no key | n/a | n/a | requires the service | requires the service |

## Who it is for

- **Developers building an AI product** who need commitments, memory or planning
  and would rather not invent a domain model, a memory gate and a scheduler.
- **People who want their context to be theirs** — one SQLite file, portable,
  inspectable, self-hosted, and shared across whatever assistant they happen to use.
- **Teams that need AI-written data to be auditable** — evidence, provenance and
  an action log on every change.

## Current scope

These are choices, not gaps:

- **Single-user.** One person, one database, one bearer token. Multi-tenancy is
  not a feature you can switch on; run one instance per person.
- **Self-hosted.** Your SQLite file, or Cloudflare's edge. There is no hosted
  service and no telemetry.
- **No external side effects.** The runtime records intent and plans; it sends
  no mail, posts nothing and pays nobody. It records intent and plans; acting on the world is your call.
- **MCP-level clients.** The UI is yours to build. The integration surfaces are
  MCP, HTTP and the library.
