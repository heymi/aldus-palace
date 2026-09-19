# Aldus Palace

[![CI](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml/badge.svg)](https://github.com/heymi/aldus-palace/actions/workflows/ci.yml)
[![npm core](https://img.shields.io/npm/v/%40aldus-palace%2Fcore?label=core)](https://www.npmjs.com/package/@aldus-palace/core)
[![npm mcp](https://img.shields.io/npm/v/%40aldus-palace%2Fmcp?label=mcp)](https://www.npmjs.com/package/@aldus-palace/mcp)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

> **Your todo app makes you its project manager. Your assistant's memory is a black box.**
>
> This is neither. You say what you mean. The runtime decides what it is, when it
> is due, whether you have said it before, and whether it contradicts what it
> already believes about you. And the whole thing is a file you own.

> ### Say it. It decides. You own it.

Not a todo app, not a calendar, not a note editor. Tasks and calendar entries are
*projections* of deeper objects — so the system can be wrong about structure
without ever losing what you actually said.

---

## What a capture actually looks like

This is real output, not a mock-up — run it with no API key:

```bash
pnpm --filter @aldus-palace/example-understanding-only start
```

**Four sentences. Every line below is a decision the runtime made for you:**

```
▸ 帮我规划一下下周三的客户拜访，顺便想想怎么提高转化率
  mode: commitment                    ← not a note, not two tasks: one commitment
  objects: commitments=1              ← “下周三” resolved on the server, not by the prompt

▸ 最近觉得 AI 产品都太吵了，干扰太多
  mode: thought                       ← a mood is not turned into a fake task

▸ 以后产品不要做太复杂，保持克制
  mode: memory candidate only         ← durable principle → proposed as memory, not activated

▸ 帮我规划一下下周三的客户拜访，顺便想想怎么提高转化率
  · 跳过重复要做的事（已有）：推进：帮我规划…   ← said it twice, stored it once
```

**And what happens when you change your mind** (`example-memory-gate-only`):

```
▸ confirmed: “不做移动端，保持 Mac-only”
▸ new candidate: “开始做 iOS 版，下个季度排期”
  ⚠ conflict with “不做移动端，保持 Mac-only” — opposite stance on platform scope
▸ user confirmed with replace: ok=true
  active 1 · superseded 1 · candidate 0

▸ version chain (oldest → newest):
  [superseded] 不做移动端，保持 Mac-only
  [active]     开始做 iOS 版，下个季度排期
```

It noticed you contradicted yourself. It asked. It kept both versions. **No
assistant memory does this, and no todo app does either.**

---

## What you get, and the moment it saves you

Nine capabilities. Each one is a thing you would otherwise build, get wrong, and
maintain forever.

### Understanding — *your users paste a paragraph, your database needs a decision*

> **The moment.** A meeting note arrives: half context, half work, one date buried
> mid-sentence. Your prompt output looks fine. A week later the same task exists
> three times under three titles, with a deadline nobody can explain.

One call returns typed objects — thoughts, commitments, decisions, memory
candidates — with the gates applied *after* the model, where they belong: one
object mode per capture, near-duplicates skipped, relative dates resolved
server-side, ambiguous phrases turned into a question instead of a guess, and a
malformed model response that leaves the deterministic result in place.

→ [Capability 3](docs/capabilities/03-understanding.md) · `capture` · `POST /v1/inputs`

### Memory — *a bad day never becomes a personality*

> **The moment.** You mention once that a UI felt noisy. Six weeks later the
> assistant is confident you “prefer minimalism”, you cannot find where that came
> from, and there is no way to correct it. Meanwhile the Mac-only decision you
> *actually* made is nowhere.

Candidates need your confirmation — high confidence is still not enough. Every
memory carries the evidence excerpt, a confidence value and the input id.
Temporary moods and one-off creative fragments are rejected before storage, with
the reason. Different phrasings of the same principle collapse into one.
Contradictions are flagged, and replacing a belief keeps the old version readable
with a reason attached.

→ [Capability 5](docs/capabilities/05-memory.md) · `memory` · `/v1/memories*`

### Today & planning — *delete the word “overdue” from your vocabulary*

> **The moment.** You open your task app. Twelve items are red. You close it. You
> still do not know what to do *now* — and the app made you feel worse for having
> written things down.

Time is not an attribute of a task; it is the result of scheduling. Four kinds of
time are modelled separately — a deadline, an availability window, an AI-suggested
slot, and nothing yet — and a missed date becomes a **risk**, never a guilt label.
One thing is highlighted. An empty day gets up to three suggestions. When you have
done enough, it suggests rest instead of refilling the list.

→ [Capability 6](docs/capabilities/06-today-and-planning.md) · `today` · `GET /v1/today`

### Progressive capture — *the user gets a result in 50 ms; the model gets five minutes*

> **The moment.** Support tickets: “it spun forever and I lost what I typed”,
> “the same task is in here twice”, “it's been stuck on *enriching* since
> yesterday”. Every one of them is the hand-off between your fast path and your
> smart path.

The runtime answers instantly with a deterministic result, then lets the model
replace it under a lease. Two clients enriching the same capture: one wins. A
worker crashes: the lease expires and the next attempt reclaims the work. A stale
worker wakes up: its writes match zero rows. The model times out: your input is
still there.

→ [Capability 4](docs/capabilities/04-progressive-capture.md) · `mode: progressive`

### Work streams — *tagging is a job nobody wants*

> **The moment.** Ninety commitments and no idea how they relate. You want them
> grouped by theme — but you are not maintaining tags, and you have been burned
> by a system that rewrote your data when you edited a view.

Themes are generated, a single override always wins, and the whole grouping is a
**rebuildable projection**: recomputing it never touches the commitments. With no
model configured you still get grouping — by project — because the fallback is
deterministic.

→ [Capability 7](docs/capabilities/07-work-streams.md) · `workstreams` · `GET /v1/work-streams`

### Providers — *your agent has never run in CI*

> **The moment.** Swapping the model means editing forty call sites. Nobody can
> test extraction without burning tokens, so nobody does. An upstream outage takes
> the whole feature down instead of degrading it.

A nine-line interface, three implementations (Anthropic, any OpenAI-compatible
endpoint, and a deterministic offline one), and configuration passed in
explicitly. The offline provider is why `pnpm test` and `pnpm eval` are green in a
fresh clone with no secrets.

→ [Capability 2](docs/capabilities/02-providers.md) · `@aldus-palace/core/providers`

### Schema & domain — *the hardest part isn't the AI*

> **The moment.** Week one. A user types “push the launch to Friday, and I keep
> going back and forth on pricing.” One task, two, a note, a decision? You guess.
> Three weeks later the model starts producing shapes your tables cannot hold.

Eight objects — thought, commitment, decision, memory, concept, project, raw
input, action log — with the invariants expressed in the DDL itself, plus
forward-only migrations for the databases already in the wild.

→ [Capability 1](docs/capabilities/01-schema-and-domain.md) · `spec/schema.sql`

### HTTP API — *your frontend, our brain*

> **The moment.** You want a web app. The work is not the endpoints — it is
> re-implementing the domain logic, the migrations and the gates you already
> decided on.

Forty-plus routes, one schema, two deployment targets: local SQLite in a
container, or a Cloudflare Worker with a SQLite Durable Object. Or mount the
routes on your own Hono server.

→ [Capability 8](docs/capabilities/08-http-api.md) · `docker compose up`

### MCP server — *your context shouldn't vanish when you change folders*

> **The moment.** You tell your assistant something important. It remembers — in
> its own memory, scoped to that one tool, in a format you cannot read, export or
> query. Use a different client and it is gone. Ask *why* it believes something
> and there is no answer.

Six tools over a SQLite file you own, in Claude Desktop, Claude Code, Cursor or
any MCP client. Tool sets keep the model's surface small (`capture`, `today`,
`memory`, `workstreams`), and slash commands give you a deterministic write path.

→ [Capability 9](docs/capabilities/09-mcp.md) · `npm i -g @aldus-palace/mcp`

---

## Why it's different

**Memory you can audit — and that knows when you changed your mind.**
Every other memory system is write-only: something gets stored, nobody knows why,
and it never changes. Here nothing is activated without your yes, every belief
carries its evidence, contradictions surface as a question, and replacements keep
their history. *“Why do you think that about me?” always has an answer.*

**There is no `overdue` status in the schema, because there is no such thing.**
A deadline, an availability window and an AI suggestion are three different
things, and conflating them is why task apps feel like a scolding. A missed date
is a risk you can see and rearrange.

**The raw input is never rewritten.** Everything you say is stored verbatim;
models only fill derived fields, and every write passes server-side gates. You
can always diff what you said against what the system stored — which is what makes
AI-written data auditable instead of merely plausible.

**And it runs offline.** Eleven test suites and replayable acceptance fixtures,
deterministic and key-free. An agent you cannot test is an agent you cannot trust.

→ [docs/POSITIONING.md](docs/POSITIONING.md) for the head-to-head with todo apps,
PKM tools, assistant memory and calendar schedulers.

---

## Three ways in

| | You write | Best for |
|---|---|---|
| **MCP** | a JSON config block | using it inside your assistant, no code |
| **HTTP** | `curl` / `fetch` / any language | your own frontend, or a non-JS stack |
| **Library** | TypeScript | embedding the runtime in your product |

```bash
# MCP — zero code
npm install -g @aldus-palace/mcp
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"

# HTTP — one command
cp .env.example .env && docker compose up --build
curl localhost:8787/health

# Library — offline, no key
pnpm install && pnpm test && pnpm eval
```

The module boundaries are real: every capability service depends only on the
storage port, the domain types and pure helpers — **there are no dependencies
between the services themselves**, so “use just this one” is a fact about the code
rather than a promise in a README.

→ **[docs/INTEGRATION.md](docs/INTEGRATION.md)**

---

## Try it

```bash
git clone https://github.com/heymi/aldus-palace.git && cd aldus-palace
pnpm install

pnpm test     # 11 suites — deterministic, offline, no API key
pnpm eval     # acceptance fixtures — the behaviour this project promises

pnpm --filter @aldus-palace/example-understanding-only start
pnpm --filter @aldus-palace/example-memory-gate-only start
pnpm --filter @aldus-palace/example-today-only start
```

`dev` is the default provider: deterministic rules, no network. Point
`LLM_PROVIDER` at Anthropic, DeepSeek or any OpenAI-compatible endpoint for full
understanding quality — the offline mode is what makes the runtime testable, not a
degraded fallback.

## Documentation

| Doc | What's in it |
|---|---|
| [INTEGRATION.md](docs/INTEGRATION.md) | the three levels, with copy-paste configs |
| [CAPABILITIES.md](docs/CAPABILITIES.md) | the nine capabilities and their contracts |
| [USE-CASES.md](docs/USE-CASES.md) | five things people build with this |
| [POSITIONING.md](docs/POSITIONING.md) | differentiation, and what this is not |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | the runtime, module boundaries, storage port |
| [DOMAIN-SCHEMA.md](docs/DOMAIN-SCHEMA.md) | objects, invariants, memory evolution |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | local, edge, embedded, backups |
| [EVAL.md](docs/EVAL.md) | how to run and extend the acceptance fixtures |
| [PROGRESSIVE-CAPTURE.md](docs/PROGRESSIVE-CAPTURE.md) | the enrichment-lease pattern, written to be copied |
| [adr/](docs/adr) | decisions already made, and why |

## Repository layout

```
packages/core          domain, agent runtime, storage port, migrations, providers
packages/mcp           MCP server (stdio) — profiles, local + HTTP backends
apps/server            Hono reference server (local SQLite + Cloudflare Durable Object)
examples/              five runnable examples, one per capability group
spec/schema.sql        generated, readable schema (CI-checked)
eval/fixtures          acceptance scenarios
docs/                  everything above
```

## Status

`0.x` — the API and the runtime are usable and tested, and may still change
between minor versions. Single-user and self-hosted by design; see
[SECURITY.md](SECURITY.md) before exposing an instance.

## Contributing

Fixtures, docs and focused fixes are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Commits are accepted under the DCO
(`git commit -s`).

## License

[Apache-2.0](LICENSE).
