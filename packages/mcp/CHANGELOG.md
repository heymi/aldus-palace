# @aldus-palace/mcp

## 0.3.0

### Minor Changes

- Make the MCP surface actually get used.

  - `capture` and the other tools now say _when_ to call them, and `capture`
    explicitly claims the "remember this" intent — including "do not answer from
    your built-in memory instead" and "only claim something was remembered if this
    tool returned successfully".
  - New user-invokable prompts, surfaced by clients as slash commands
    (`/mcp__aldus-palace__capture`, `/mcp__aldus-palace__today`), so writing into
    Aldus Palace is deterministic even when the client's own memory would win.
  - Tests cover the prompt surface and its arguments.

## 0.2.2

### Patch Changes

- Depend on `@aldus-palace/core` with a caret range (`workspace:^`) instead of a
  pinned exact version, so a core patch release no longer forces an MCP release.

## 0.2.1

### Patch Changes

- Updated dependencies
  - @aldus-palace/core@0.2.1

## 0.2.0

### Minor Changes

- 9c2ebec: v0.2 — ecosystem release.

  - `@aldus-palace/core`: Anthropic provider (Messages API), SQLite adapter
    published as `@aldus-palace/core/db/sqlite`, memory lifecycle services
    (`confirmMemory`, `rejectMemory`, `listMemoriesByStatus`) extracted out of the
    HTTP layer, and an explicit `close()` on the SQLite adapter.
  - `@aldus-palace/mcp`: new Model Context Protocol server with `capture`,
    `list_today`, `list_commitments`, `list_memories` and `confirm_memory`, for
    Claude Desktop / Claude Code, over local SQLite or an HTTP server.

### Patch Changes

- Updated dependencies [9c2ebec]
  - @aldus-palace/core@0.2.0
