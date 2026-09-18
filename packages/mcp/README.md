# @aldus-palace/mcp

Model Context Protocol server for Aldus Palace. It lets Claude Desktop, Claude
Code, or any MCP client capture thoughts into your own database and read your
Today plan — without a server process.

```bash
npm install -g @aldus-palace/mcp
# or run from source: pnpm --filter @aldus-palace/mcp start
```

## Tools

| Tool | What it does |
|---|---|
| `capture` | Sends free-form text through the capture pipeline and returns the stored ActionCard. `mode`: `progressive` (default), `local` (instant, deterministic), `sync` (wait for the model). |
| `list_today` | Today's plan: now/next timeline, risks, unscheduled work. |
| `list_commitments` | The commitment list, optionally filtered by status. |
| `list_memories` | Long-term memory; `candidate` (proposed, not active) or `active`. |
| `confirm_memory` | Promotes a candidate to active. Only call after the user agrees — memory is never activated silently. |

## Two backends

| Backend | Selected when | Notes |
|---|---|---|
| **local** | `ALDUS_PALACE_API_URL` is unset | Opens the SQLite file directly. Zero setup. |
| **http** | `ALDUS_PALACE_API_URL` is set | Uses a running Aldus Palace server (all features, same as the app). |

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "aldus-palace": {
      "command": "node",
      "args": ["/absolute/path/to/aldus-palace/packages/mcp/dist/index.js"],
      "env": {
        "ALDUS_PALACE_DB": "/Users/you/.aldus-palace/aldus.db",
        "LLM_PROVIDER": "dev"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the five tools listed for the server.

### Claude Code

```bash
claude mcp add aldus-palace -- node /absolute/path/to/aldus-palace/packages/mcp/dist/index.js
```

### Point it at a server instead

```json
{
  "command": "node",
  "args": ["/absolute/path/to/aldus-palace/packages/mcp/dist/index.js"],
  "env": {
    "ALDUS_PALACE_API_URL": "http://127.0.0.1:8787",
    "ALDUS_PALACE_API_TOKEN": "dev-local-token"
  }
}
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ALDUS_PALACE_API_URL` | — | Use the HTTP backend instead of the local database |
| `ALDUS_PALACE_API_TOKEN` | — | Bearer token for the server (`DEV_AUTH_TOKEN`) |
| `ALDUS_PALACE_DB` | `~/.aldus-palace/aldus.db` | SQLite path for the local backend |
| `ALDUS_PALACE_USER_NAME` / `_TIMEZONE` / `_LANGUAGE` | `Local User` / `UTC` / `en` | Local user defaults |
| `LLM_PROVIDER` | `auto` | `dev` runs offline rules; `deepseek` / `anthropic` / `openai-compatible` use a model |

## Design notes

- The local backend uses the **same** `@aldus-palace/core` migrations as the
  server, so a database can be moved between them.
- Captures are recorded in `raw_inputs` and the action log like any other input,
  so nothing entered through Claude is invisible to the app.
- If you run both the MCP local backend and the server against one file, SQLite
  serialises the writers — prefer the HTTP backend in that case.
