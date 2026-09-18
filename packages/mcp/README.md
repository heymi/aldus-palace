# @aldus-palace/mcp

**Give your assistant a memory you own.** An MCP server that records thoughts,
commitments and decisions into a database on your machine — and reads your day
back — inside Claude Desktop, Claude Code, Cursor or any MCP client.

```bash
npm install -g @aldus-palace/mcp
```

## Why not the assistant's built-in memory

Built-in memory is a black box: scoped to one tool, unreadable, unexportable,
and it cannot tell you why it believes something. This puts the same context in a
SQLite file you can open, query, back up, and share across every client you use.

- **Portable** — one file, or one Worker. Change client or model freely.
- **Auditable** — every memory carries its evidence and confidence.
- **Confirmable** — nothing becomes a belief about you without your yes.
- **Queryable** — “what is planned today”, “what did I promise”, “what is at risk”.

## Tools

| Tool | What it does |
|---|---|
| `capture` | records a thought, commitment or decision — local-first, model if available |
| `list_today` | what to do now, what is next, what is at risk |
| `list_commitments` | the full list, filterable by status |
| `list_work_streams` | grouped view of the same commitments |
| `list_memories` | candidates, active memories, and what you have since replaced |
| `confirm_memory` | activates a candidate, optionally replacing an older belief |

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
| `full` (default) | all six |
| `capture` | `capture` |
| `today` | `list_today`, `list_commitments` |
| `memory` | `list_memories`, `confirm_memory` |
| `workstreams` | `list_work_streams` |

```bash
ALDUS_PALACE_PROFILE=memory aldus-palace-mcp            # via env
aldus-palace-mcp-today                                  # via a focused binary
```

Focused binaries: `aldus-palace-mcp-capture`, `-today`, `-memory`, `-workstreams`.

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
| `ALDUS_PALACE_API_URL` | — | use a running server instead of the local file |
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
