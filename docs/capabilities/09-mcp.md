# 9. MCP server

> **Your context shouldn't live in someone else's black box — or vanish when you change folders.**

**The moment.** You tell your assistant something important. It remembers — in
its own memory, scoped to that tool, in a format you cannot read, export or
query. Use a different client and it is gone. Ask *why* it believes something and
there is no answer.

**What you get.** An MCP server that puts the context in a database you own, and
exposes it as tools any MCP client can call:

| Tool | What it does |
|---|---|
| `capture` | records a thought, commitment or decision — local-first, model if available |
| `list_today` | what to do now, what is next, what is at risk |
| `list_commitments` | the full list, filterable by status |
| `list_work_streams` | grouped view of the same commitments |
| `list_memories` | candidates, active memories, and what you have since replaced |
| `confirm_memory` | activates a candidate, optionally replacing an older belief |
| `reject_memory` | archives a memory, including one the system stored on its own |
| `list_actions` | what the Action Gate is holding, and what it decided |
| `decide_action` | approve or reject a waiting action; critical needs two approvals |
| `revoke_action` | take back a proposal or an approval |

`capture`, `list_today` and the action tools return a short human card, with the
full payload kept in `structuredContent`
([ADR 0004](../adr/0004-mcp-tool-output-cards.md)).

Two prompts ship as slash commands for deterministic writes:

```
/mcp__aldus-palace__capture 下周三前把 v0.2 的技术文发出去
/mcp__aldus-palace__today
```

**Tool sets instead of tool sprawl.** Install once; enable what you need with
`ALDUS_PALACE_PROFILE` (`full`, `capture`, `today`, `memory`, `workstreams`,
`actions`) or a focused binary such as `aldus-palace-mcp-today`. A smaller tool
surface is selected more accurately and costs fewer tokens.

**Two backends.** Local SQLite (`~/.aldus-palace/aldus.db`) with no server to run,
or HTTP against a running instance — the same data either way, so a client on
your laptop and one on your server share one context.

**Who this is for.** Anyone using more than one AI client, and anyone who wants
their assistant's context to be portable.

## See it in 30 seconds

```bash
npm install -g @aldus-palace/mcp
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"
claude mcp list          # aldus-palace: ✔ Connected
```

Then, in the session:

```bash
claude -p "/mcp__aldus-palace__capture 周五前把发布说明写完"
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ALDUS_PALACE_PROFILE` | `full` | tool set |
| `ALDUS_PALACE_API_URL` | — | use a running server instead of the local file |
| `ALDUS_PALACE_API_TOKEN` | — | bearer token for that server |
| `ALDUS_PALACE_DB` | `~/.aldus-palace/aldus.db` | local SQLite path |
| `ALDUS_PALACE_USER_*` | `Local User` / `UTC` / `en` | local user defaults |
| `LLM_PROVIDER` | `auto` | `dev` runs fully offline |

## Proof

- `packages/mcp/src/tools.ts` — the tool surface, profiles and prompts
- `packages/mcp/src/backend.ts` — local and HTTP backends behind one interface
- `packages/mcp/test/tools.test.ts` — every profile's surface asserted over an in-memory transport
- `packages/mcp/README.md` — Claude Desktop and Claude Code setup
