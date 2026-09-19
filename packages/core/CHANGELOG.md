# @aldus-palace/core

## 0.5.1

### Patch Changes

- README: replace "What it guarantees" and the three-row comparison with one
  "Where this makes a difference" table — nine dimensions, each stating what the
  system does, with the numbers re-verified. The single-writer constraint moves to
  DEPLOYMENT.md and the offline provider's reach to EVAL.md; the positioning
  document keeps the head-to-head table with vendor-neutral wording.

## 0.5.0

### Minor Changes

- The runtime speaks the user's language, and the offline rules work in English.

  **core**

  - `lib/locale.ts`: `localeOf(user.language)` plus `pick` / `plural` helpers.
    Capture receipts, warnings, memory contents, Today labels and action-log
    summaries follow `users.language`; machine keys stay stable.
  - The rule-based extractor now matches English and Chinese (preferences,
    principles, platform decisions, temporary states, one-off creative work,
    project briefs), and writes stored content in the user's locale.
  - `DevLLMProvider` takes a locale and shares one memory extractor with the
    capture pipeline, so the offline path and the pipeline cannot drift.
  - Conflict detection covers English: hyphenated topics, negation vocabulary, and
    a new dimension-pole check that catches two positive statements pointing at
    opposite ends ("more features" vs "keep it simple").
  - The Today focus item no longer repeats in the unscheduled preview.
  - Fixtures: the runner picks a locale from the input, and S29–S31 cover English
    capture, memory activation and a temporary state. S28 now reflects the shared
    extractor.

  **mcp**

  - Tool descriptions note that memories carry an activation note.

## 0.4.2

### Patch Changes

- README review pass: correct the suite count, make the quick start work from a
  fresh clone, replace the flagship example with behaviour the offline provider
  actually produces, and add the flow diagram, scale numbers, requirements, one
  code block per surface and a "Designed scope" section.

## 0.4.1

### Patch Changes

- An automated activation no longer records `confirmed_at`, so the memory list
  reports it as `auto` and says "stated by you" / "inferred" in place of "confirmed
  by you". Confirmation stays reserved for a human decision. Covered by tests in
  the core and MCP suites.

## 0.4.0

### Minor Changes

- Memories take effect on capture, and every activation explains itself.

  **core**

  - `lib/memoryActivation.ts` — the activation policy. A candidate with
    `confidence >= 0.8` and `importance >= 0.8` becomes active on capture;
    everything else waits for confirmation. A principle the system inferred always
    waits, per the memory-pollution rule.
  - A candidate without a confidence score waits instead of being discarded.
  - `memory_activated` action-log entries record the reason, the scores and the
    source, so a silent activation stays explainable.
  - `rejectMemory` archives an active memory as readily as a pending candidate, and
    records the prior status.
  - The memory list gains `activation` (`auto` / `confirmed`) and
    `activation_note`, so the client can explain why a memory is active.
  - Capture receipts split into `已记住 N 条` and `待确认 N 条`.
  - Fixtures gained `memory_active_min` / `memory_active_max` /
    `memory_pending_min` / `memory_pending_max`; S25 updated, S26–S28 added.

  **mcp**

  - New `reject_memory` tool in the `full` and `memory` profiles.
  - `list_memories` documents the activation note; `confirm_memory` describes
    candidates as the memories the system held back.

  **docs**

  - README rewritten around the problem each capability solves, with a capture
    session rendered as an SVG hero.
  - The memory promise is now "explains itself and archives on request" in place of
    "needs a tap for everything".

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
