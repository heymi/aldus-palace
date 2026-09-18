# @aldus-palace/mcp

## 0.4.1

### Patch Changes

- Add a `default` export condition so CommonJS consumers can `require()` the
  packages on Node ≥ 22.12 (`require(esm)`), not just `import` them.
- Updated dependencies
  - @aldus-palace/core@0.3.1

## 0.4.0

### Minor Changes

- Ecosystem release: memory evolution, work streams, and a capability-oriented
  integration surface.

  **core**

  - Memory evolution: `supersedes_id` / `superseded_by_id` / `supersede_reason` and
    `conflicts_with_id` / `conflict_reason`, with `detectMemoryConflict`,
    `supersedeMemory`, `listMemoryVersions` and a derived `memoryState()`. A memory
    is never overwritten: replacing one keeps the previous version readable.
  - Conflict detection runs on rules offline (topic + polarity) and can be upgraded
    to a model judge; capture reports `memory_conflicts` on the ActionCard.
  - `listWorkStreams()` — grouping over commitments with urgency ordering and a
    visible/total split.
  - SQLite adapter: prepared-statement cache, `busy_timeout`, and a
    `preparedStatementCount` diagnostic.
  - `better-sqlite3` bumped to `^12.11.1` (fixes a Node 24 teardown abort).

  **mcp**

  - Tool sets via `ALDUS_PALACE_PROFILE` (`full` / `capture` / `today` /
    `workstreams` / `memory`) and matching focused binaries.
  - New `list_work_streams` tool; `list_memories` gains `state`; `confirm_memory`
    gains `supersedes` + `reason`.
  - `Backend.close()` so embedders and tests can release the database.

  **docs**

  - A capability-oriented documentation set: `INTEGRATION`, `CAPABILITIES`, nine
    capability pages, `USE-CASES`, `POSITIONING`, `DEPLOYMENT`.

### Patch Changes

- Updated dependencies
  - @aldus-palace/core@0.3.0

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
