# Positioning

## The one-liner

> **Drop in the capabilities you'd otherwise build yourself.**
>
> A self-hosted commitment, memory and planning runtime — usable over MCP, over
> HTTP, or as a library.

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
why, and it never changes.

Here, memory has a lifecycle you can inspect:

- **Candidates, not facts.** A capture proposes; only a human confirmation makes
  a memory active. High confidence is still not enough.
- **Evidence on every row.** Each memory carries the excerpt it came from, a
  confidence value, and the input id.
- **Temporary states are rejected.** “I'm tired today” never becomes a
  personality trait — the gate drops it before it is stored.
- **Duplicates collapse.** Different phrasings of the same principle normalise to
  one key and merge.
- **Contradictions surface.** Say the opposite of a confirmed belief and the
  candidate is flagged with the memory it conflicts with.
- **Replacing keeps history.** Confirming a replacement marks the old memory
  `superseded` with a pointer and a reason. Nothing is deleted, so “why do you
  think that about me?” always has an answer.

*Proof:* `services/memoryLifecycle.ts`, `services/memoryEvolution.ts`,
`lib/memoryExtract.ts`, `test/memoryEvolution.test.ts`.

### 3. The raw input is never rewritten

Everything you say is stored verbatim in `raw_inputs` and never modified. Models
only fill *derived* fields, and every write passes server-side gates:

- one object mode per capture (a thought cannot become the same commitment twice)
- near-duplicate commitments are skipped, not duplicated
- relative dates (“next Wednesday”) are resolved on the server, not trusted to a prompt
- a failed model pass leaves the deterministic result in place instead of an empty record

That makes the AI layer **auditable**: you can always diff what you said against
what the system stored.

*Proof:* `agent/understand.ts`, `eval/fixtures/`, `test/inputObjectClassification.test.ts`.

## Two more that developers feel immediately

**Background enrichment you can trust.** Waiting on a model is where products
lose people. The runtime answers in milliseconds with a deterministic result,
then lets the model replace it under a lease — so retries, concurrent clients and
crashed workers cannot corrupt or duplicate anything. See
[ADR 0003](adr/0003-progressive-capture-with-enrichment-leases.md).

**Your agent has never run in CI. This one has.** A deterministic provider plus
replayable acceptance fixtures means the whole pipeline is testable offline, with
no API key. `pnpm test && pnpm eval` is green in a fresh clone.

## How it compares

| | Aldus Palace | Todoist / Things | Notion / PKM | Claude / ChatGPT memory | Motion / Reclaim |
|---|---|---|---|---|---|
| Who structures your input | the runtime decides | you do | you do | assistant, conversationally | partially |
| Time model | 4 kinds, no “overdue” | one due date | free text | none | calendar slots |
| Memory | candidates + evidence + versioning | none | documents you maintain | opaque, not portable | preferences, opaque |
| Data location | your SQLite file or your Worker | their cloud | their cloud | their cloud | their cloud |
| Programmable | MCP · HTTP · library | API | API | limited | calendar API |
| Testable offline | yes, by design | n/a | n/a | no | no |

It is **not** a replacement for a calendar (it reads fixed events, it does not
negotiate meetings), not a collaborative task manager, and not a document editor.

## Who it is for

- **Developers building an AI product** who need commitments, memory or planning
  and would rather not invent a domain model, a memory gate and a scheduler.
- **People who want their context to be theirs** — one SQLite file, portable,
  inspectable, self-hosted, and shared across whatever assistant they happen to use.
- **Teams that need AI-written data to be auditable** — evidence, provenance and
  an action log on every change.

## Designed scope

These are choices, not gaps:

- **Single-user.** One person, one database, one bearer token. Multi-tenancy is
  not a feature you can switch on; run one instance per person.
- **Self-hosted.** Your SQLite file, or Cloudflare's edge. There is no hosted
  service and no telemetry.
- **No external side effects.** The runtime never sends mail, never posts, never
  pays. It records intent and plans; acting on the world is your call.
- **MCP-level clients.** The UI is yours to build. The integration surfaces are
  MCP, HTTP and the library.
