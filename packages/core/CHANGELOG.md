# @aldus-palace/core

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
