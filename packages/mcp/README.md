# @aldus-palace/mcp

> **You told your assistant something important. It remembered — in a place you
> cannot read, scoped to that one tool, and gone the moment you switch client.**

```bash
npm install -g @aldus-palace/mcp
```

---

**The moment.** You use Claude Desktop at your desk and Claude Code in the
terminal. Neither knows what the other was told. You mention, once, that a UI felt
noisy — six weeks later the assistant is confident you *prefer minimalism*, and
there is no way to see where that came from or correct it. Meanwhile the decision
you actually made is nowhere.

**This puts the same context in a file you own** — and gives you the tools to
inspect it: what it remembers, why, and what you replaced. It works in Claude
Desktop, Claude Code, Cursor or any MCP client, and every client shares one
database.

## Why not the assistant's built-in memory

Built-in memory is a black box: scoped to one tool, unreadable, unexportable,
and it cannot tell you why it believes something. Here every memory says where it
came from, contradictions surface as a question, replacing a belief keeps the old
version readable, and any memory can be archived.

- **Portable** — one file, or one Worker. Change client or model freely.
- **Auditable** — every memory carries its evidence, its confidence, and a note
  that says whether you stated it, confirmed it, or the system inferred it.
- **Reversible** — archive any memory from the list, including one the system
  stored on its own.
- **Queryable** — “what is planned today”, “what did I promise”, “what is at risk”.

## Tools

| Tool | What it does |
|---|---|
| `capture` | records a thought, commitment or decision — local-first, model if available |
| `list_today` | what to do now, what is next, what is at risk |
| `list_commitments` | the full list, filterable by status |
| `list_work_streams` | grouped view of the same commitments |
| `list_memories` | active memories, pending candidates, and what you have replaced — each with a note on why it is active |
| `confirm_memory` | activates a candidate, optionally replacing an older belief |
| `reject_memory` | archives a memory, including one the system stored on its own |
| `list_actions` | what the Action Gate is holding, and what it decided |
| `decide_action` | approve or reject a waiting action; critical needs two approvals |
| `revoke_action` | take back a proposal or an approval |

`capture`, `list_today` and the action tools return a short card, with the full
payload kept in `structuredContent`:

```
capture  "Ship the onboarding page next week"

Captured · 1 commitment
  commitment  Ship the onboarding page next week  ·  window 2026-09-19 → 2026-09-26

list_actions

Actions · 1 waiting
  high      memory_deleted  ·  waiting  ·  replaces_a_belief
```

Two prompts ship as slash commands:

```
/mcp__aldus-palace__capture 下周三前把 v0.2 的技术文发出去
/mcp__aldus-palace__today
```

## Tool sets

Install once, enable what you need. A smaller tool surface is selected more
accurately and costs fewer tokens.

| Profile | Tools |
|---|---|
| `full` (default) | all ten |
| `capture` | `capture` |
| `today` | `list_today`, `list_commitments` |
| `memory` | `list_memories`, `confirm_memory`, `reject_memory` |
| `workstreams` | `list_work_streams` |
| `actions` | `list_actions`, `decide_action`, `revoke_action` |

```bash
ALDUS_PALACE_PROFILE=memory aldus-palace-mcp            # via env
aldus-palace-mcp-today                                  # via a focused binary
```

Focused binaries: `aldus-palace-mcp-capture`, `-today`, `-memory`, `-workstreams`,
`-actions`.

## Claude Desktop

Settings → Developer → Edit Config:

```json
{
  "mcpServers": {
    "aldus-palace": {
      "command": "npx",
      "args": ["-y", "@aldus-palace/mcp"],
      "env": { "ALDUS_PALACE_PROFILE": "full" }
    }
  }
}
```

Restart, then check that the tools are listed.

## Claude Code

```bash
claude mcp add aldus-palace -- node "$(npm root -g)/@aldus-palace/mcp/dist/index.js"
claude mcp list          # aldus-palace: ✔ Connected
claude -p "/mcp__aldus-palace__capture 周五前把发布说明写完"
```

## Point it at a server instead

Local SQLite needs no server. If you already run one (Docker or Cloudflare), use
it so every client shares one database:

```json
{
  "command": "npx",
  "args": ["-y", "@aldus-palace/mcp"],
  "env": {
    "ALDUS_PALACE_API_URL": "http://127.0.0.1:8787",
    "ALDUS_PALACE_API_TOKEN": "your-token"
  }
}
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ALDUS_PALACE_PROFILE` | `full` | tool set |
| `ALDUS_PALACE_API_URL` | — | point at a running server, using its database |
| `ALDUS_PALACE_API_TOKEN` | — | bearer token for that server |
| `ALDUS_PALACE_DB` | `~/.aldus-palace/aldus.db` | local SQLite path |
| `ALDUS_PALACE_USER_NAME` / `_TIMEZONE` / `_LANGUAGE` | `Local User` / `UTC` / `en` | local user defaults |
| `LLM_PROVIDER` | `auto` | `dev` runs fully offline; `anthropic` / `deepseek` / `openai-compatible` for full quality |

## Notes

- **One writer per file.** SQLite allows a single writer, so run one server per
  database — use profiles to expose a subset of tools from the same process. If
  you need several processes, point the extra ones at `ALDUS_PALACE_API_URL`.
- **Everything is logged.** Captures made through MCP appear in the action log
  exactly like captures made anywhere else.
- **Databases are interchangeable.** The MCP server applies the same migrations
  as the reference server, so a file can move between them.

## Documentation

- [Capability 9: MCP server](../../docs/capabilities/09-mcp.md)
- [Integration](../../docs/INTEGRATION.md) · [Deployment](../../docs/DEPLOYMENT.md)

Apache-2.0.
