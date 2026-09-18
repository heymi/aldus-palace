# Use cases

Five concrete things people build with this, shortest path first.

---

## 1 · Give my assistant a memory I own

**Situation.** You use Claude Desktop at your desk and Claude Code in the
terminal. Neither knows what the other was told, and neither lets you read or
export its memory.

**Path.** MCP, profile `full`, one database file.

```bash
npm install -g @aldus-palace/mcp
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"
```

Now both clients read and write `~/.aldus-palace/aldus.db`. Ask *what do you know
about me* (`list_memories`), correct it (`confirm_memory`), or open the file with
any SQLite tool.

**Why not the built-in memory.** This one is portable, queryable, auditable, and
survives a change of client, model or machine.

→ [Capability 9](capabilities/09-mcp.md)

---

## 2 · Meeting notes into tracked commitments

**Situation.** You paste a messy note. Half of it is context, half is work, and
one date is buried in the middle. You want the work tracked, the context
searchable, and nothing invented.

**Path.** Library, ~60 lines.

```bash
pnpm --filter @aldus-palace/example-capture-cli start "客户要我们周五前给出迁移方案，顺便记一下他们对定价的顾虑"
```

The runtime returns a card: a commitment with the deadline resolved, a thought
holding the context, and any memory candidate it proposes. Re-capturing the same
intent surfaces the existing commitment instead of duplicating it.

**Why not a prompt.** Prompt output is unstructured and unvalidated. Here the
model proposes and the runtime decides: dates are computed server-side,
duplicates are skipped, and a bad response leaves the deterministic result in
place.

→ [Capabilities 3](capabilities/03-understanding.md) · [4](capabilities/04-progressive-capture.md)

---

## 3 · A daily focus that doesn't manufacture guilt

**Situation.** Your task app shows twelve red items every morning. You have
stopped opening it. What you actually want is one answer: what now?

**Path.** Run the server, read `GET /v1/today` — or point your assistant at it.

```bash
curl -s localhost:8787/v1/today -H 'Authorization: Bearer dev-local-token'
```

`now`, `next`, `risks`, `unscheduled`. Missed dates are risks, not failures. A
genuinely empty day gets up to three suggestions. When you have done enough, it
suggests rest instead of refilling the list.

**Why not a todo app.** Four kinds of time instead of one due date, and an
adaptive cap that knows the difference between a productive day and a treadmill.

→ [Capability 6](capabilities/06-today-and-planning.md)

---

## 4 · An assistant that remembers, without believing nonsense

**Situation.** Your assistant inferred a preference from one offhand remark,
wrote it into your profile, and now behaves accordingly. You cannot find it, and
you cannot delete it. Meanwhile a decision you *did* make was never stored.

**Path.** Library, using the memory gate directly.

```bash
pnpm --filter @aldus-palace/example-memory-gate-only start
```

Candidates need confirmation; every memory carries its evidence; temporary moods
and one-off creative fragments are rejected with a reason; contradictory beliefs
are flagged and replaced with history kept.

**Why not assistant memory.** Because “why do you think that about me?” has an
answer here, and the answer is a row you can read, amend or delete.

→ [Capability 5](capabilities/05-memory.md)

---

## 5 · Add commitments to a product you already ship

**Situation.** You have a product with its own frontend. Users keep telling it
what they intend to do, and you keep storing that as text in a notes table.

**Path.** Library for the pipeline, or HTTP if your backend is not JavaScript.

```ts
import { processRawInput, claimEnrichment } from "@aldus-palace/core";

const card = await processRawInput(db, llm, user, rawInputId, "local");   // instant
const generation = await claimEnrichment(db, rawInputId, user.id);       // then the model
if (generation) {
  await processRawInput(db, llm, user, rawInputId, "full", generation);
}
```

You get the domain model, the gates, the memory lifecycle and the scheduling
projection — and you keep your own UI, auth and database.

→ [INTEGRATION.md](INTEGRATION.md) · [Capability 1](capabilities/01-schema-and-domain.md)

---

## Anti-patterns

Being clear about what this is *not* saves everyone time:

- **Not a calendar.** It models deadlines and availability windows, and it reads
  fixed events. It does not negotiate meetings or invite people.
- **Not a team task manager.** Single user, no assignments, no shared boards.
- **Not a note editor.** Thoughts are stored objects, not documents you type into.
- **Not a hosted service.** You run it; there is no account to create.
