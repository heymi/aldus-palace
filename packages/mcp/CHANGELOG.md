# @aldus-palace/mcp

## 0.7.5

### Patch Changes

- Updated dependencies [b74a164]
- Updated dependencies [9b144f2]
- Updated dependencies [e18d505]
- Updated dependencies [0234daa]
  - @aldus-palace/core@0.11.0

## 0.7.4

### Patch Changes

- Updated dependencies [d3c2d19]
- Updated dependencies [eedbd5a]
- Updated dependencies [e5254cd]
- Updated dependencies [3d87708]
- Updated dependencies [f9332f7]
  - @aldus-palace/core@0.10.0

## 0.7.3

### Patch Changes

- Updated dependencies [8e1c285]
- Updated dependencies [118f319]
  - @aldus-palace/core@0.9.0

## 0.7.2

### Patch Changes

- Updated dependencies [d0d813e]
- Updated dependencies [bde8de8]
  - @aldus-palace/core@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [28a9586]
  - @aldus-palace/core@0.7.0

## 0.7.0

### Minor Changes

- ccff588: Expose the Action Gate: `list_actions`, `decide_action` and `revoke_action`,
  with an `actions` profile and the `aldus-palace-mcp-actions` binary. The tools
  return a human card with the full payload in `structuredContent`.
- 04d25f0: `list_actions` returns the trust score and autonomy level alongside the queue,
  in the card footer and in `structuredContent`.
- 7e481cb: `capture` and `list_today` return a short human card as text content, with the
  full payload in `structuredContent` and an output schema. The model quotes a
  receipt instead of reading a JSON wall.

### Patch Changes

- Updated dependencies [747243d]
- Updated dependencies [4ea1c06]
- Updated dependencies [60768cf]
- Updated dependencies [1c253c9]
- Updated dependencies [ccff588]
- Updated dependencies [93201b4]
- Updated dependencies [dbe23fc]
- Updated dependencies [120bd72]
- Updated dependencies [8bdc95c]
- Updated dependencies [9a4d5e0]
- Updated dependencies [5bcbd6b]
- Updated dependencies [04d25f0]
  - @aldus-palace/core@0.6.0

## 0.6.3

### Patch Changes

- README: add "The system behind it" — the four engines, the memory pipeline and
  the three rules that keep memory honest. Every line describes shipped behaviour;
  the parts of the design that are not built yet (graded memory levels, decay, the
  value score, trust and autonomy, model orchestration) moved to ROADMAP.md with a
  note on what exists today.
- Updated dependencies
  - @aldus-palace/core@0.5.3

## 0.6.2

### Patch Changes

- README: the comparison table comes back with a "What you use today" column, so
  each of the nine dimensions shows the contrast side by side with what the system
  does.
- Updated dependencies
  - @aldus-palace/core@0.5.2

## 0.6.1

### Patch Changes

- README: replace "What it guarantees" and the three-row comparison with one
  "Where this makes a difference" table — nine dimensions, each stating what the
  system does, with the numbers re-verified. The single-writer constraint moves to
  DEPLOYMENT.md and the offline provider's reach to EVAL.md; the positioning
  document keeps the head-to-head table with vendor-neutral wording.
- Updated dependencies
  - @aldus-palace/core@0.5.1

## 0.6.0

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

### Patch Changes

- Updated dependencies
  - @aldus-palace/core@0.5.0

## 0.5.1

### Patch Changes

- README review pass: correct the suite count, make the quick start work from a
  fresh clone, replace the flagship example with behaviour the offline provider
  actually produces, and add the flow diagram, scale numbers, requirements, one
  code block per surface and a "Designed scope" section.
- Updated dependencies
  - @aldus-palace/core@0.4.2

## 0.5.0

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

### Patch Changes

- Updated dependencies
  - @aldus-palace/core@0.4.0

## 0.4.3

### Patch Changes

- Rewrite the package READMEs around the problem each capability solves, with the
  concrete moment it saves you from, instead of a feature list.
- Updated dependencies
  - @aldus-palace/core@0.3.3

## 0.4.2

### Patch Changes

- Expose `./package.json` from the export map so tooling can read package metadata
  without tripping over `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- Updated dependencies
  - @aldus-palace/core@0.3.2

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
