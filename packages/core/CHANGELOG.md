# @aldus-palace/core

## 0.3.3

### Patch Changes

- Rewrite the package READMEs around the problem each capability solves, with the
  concrete moment it saves you from, instead of a feature list.

## 0.3.2

### Patch Changes

- Expose `./package.json` from the export map so tooling can read package metadata
  without tripping over `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## 0.3.1

### Patch Changes

- Add a `default` export condition so CommonJS consumers can `require()` the
  packages on Node ≥ 22.12 (`require(esm)`), not just `import` them.

## 0.3.0

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

## 0.2.2

### Patch Changes

- Recognise English imperative captures in the deterministic provider.

  `Write the architecture doc`, `Review the pull request`, `Migrate the database`,
  `Set up the CI pipeline` and similar commands now produce commitments instead of
  being filed as thoughts, while noun uses (`I took a test yesterday`) and bare
  research (`Research X`) stay thoughts — research aimed at a concrete artifact
  (`Research the notification API`) is work. Covered by the new
  `actionableWork` suite.

## 0.2.1

### Patch Changes

- Export `AnthropicProvider`, `AnthropicOptions` and `DEFAULT_ANTHROPIC_MODEL`
  from the package root as well as `@aldus-palace/core/providers`, matching the
  existing OpenAI-compatible exports.

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
