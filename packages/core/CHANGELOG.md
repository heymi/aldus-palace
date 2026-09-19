# @aldus-palace/core

## 0.13.0

### Minor Changes

- 41ec277: The grey zone asks, and corrections are learned.

  - An input with a work signal below the action bar is no longer guessed into a
    thought: the capture records a pending `object_mode` clarification with three
    options — defect, work, note — and warns with the question.
  - `applyObjectChoice` resolves the answer (defect/work become one commitment,
    note cancels any and keeps the thought), and the new
    `POST /v1/inputs/:id/reclassify` applies the same correction by hand.
  - Corrections are stored per user in `classification_signals` (new table and
    migration, purged with the rest) and applied before asking, so the same words
    are not asked twice. Matching needs two term hits: one shared word is not
    enough.

## 0.12.0

### Minor Changes

- 62a5eac: The runtime writes in the user's language.

  - The deterministic provider follows the input's script when no locale was
    configured, so a Chinese sentence produces Chinese wording and an English one
    produces English (an explicit `locale` still wins). `DevLLMProvider.locale` is
    now optional.
  - Rule-based memories follow `user.language`, and `setUserLanguage` updates it,
    so a client can switch the language of what the system writes.

## 0.11.0

### Minor Changes

- 9b144f2: Classify permanent deletion, and look up action types case-insensitively.

  `user_data_purge` was unlisted, so the gate graded it `high` (one approval). It is
  permanent, so it is now `critical` and takes two approvals, like the other
  irreversible action. The risk table is also matched case-insensitively, so
  `Payment` grades the same as `payment`.

### Patch Changes

- b74a164: The privacy guard writes its per-call audit row for every outcome. Level 0 and a
  blocked level 4 now leave a `privacy_gateway_redacted` entry, as ADR 0011 states,
  instead of only levels 1–3.
- e18d505: Bound the FTS5 query expression: the input is capped at 512 characters and 24
  terms, so a long capture cannot turn retrieval into an unbounded OR chain.
- 0234daa: Resolve more relative phrases a model returns, and fill a deadline from the right
  edge of the window.

  "下个月", every weekday ("周一", "Wednesday") and "next Monday" now resolve
  instead of being dropped, and a window phrase fills a deadline with the window's
  end rather than its start, so "next week" does not become the first day.

## 0.10.0

### Minor Changes

- eedbd5a: A cloud provider now requires its privacy guard at construction.

  `AnthropicProvider` and `OpenAICompatibleProvider` throw
  `PrivacyGuardRequiredError` without a `guard`, and apply it inside `complete`.
  The guarantee no longer depends on going through `createLLMProvider`, which
  still takes the guard the same way. Constructing a provider directly now means
  passing `guard`.

### Patch Changes

- d3c2d19: Make the Action Gate's decisions and execution linearizable.

  - `runGatedAction` records its inline run, so a later durable execute sees
    `already_succeeded` instead of running the effect twice.
  - A decision or a revocation is written only if the row still has the status that
    was read, so two racing decisions cannot both apply and a confirmation is
    never lost.
  - The execution lease is claimed only while the proposal is approved, closing the
    window where a revoke between the check and the claim could still run it.
  - Executor bookkeeping is separate from the effect: a failed write no longer
    marks a completed action failed and invites a second run.

- e5254cd: Read a model's date-only value as the user's local day, and scope the future-date
  check to the commitment's clause. A `YYYY-MM-DD` deadline is no longer parsed as
  UTC midnight (which shifted the day for users west of UTC), and a future word in
  one clause no longer drops a real past date that belongs to another.
- 3d87708: Fix the memory retrieval fallback. The keyword pass filtered on a score that has
  a positive floor, so when nothing matched it injected arbitrary memories. It now
  matches on the keyword hit and falls back to principles and preferences.
- f9332f7: Keep the memory search index consistent.

  - `indexMemory` writes the search row before `search_text`, so an interrupted
    write is repaired by the next backfill instead of leaving a memory marked
    indexed with no row.
  - A search row is updated in place, or inserted only if absent, so two flows for
    one memory cannot leave duplicate rows.
  - The backfill repairs a memory whose search row went missing, distinguishes an
    empty body from a missing row, and removal drops the row with the memory.

## 0.9.2

### Patch Changes

- 38175b8: Harden the FTS5 retriever and true deletion.

  - A query that contains an emoji or a punctuation-only word (`"? hello"`,
    `"😀 hello"`) no longer produces a dangling `OR`; the expression stays valid,
    so a capture never fails on such input.
  - Context retrieval falls back to the keyword pass when the FTS query errors,
    instead of failing the whole capture.
  - `purgeUserData` now also deletes the `memory_search` rows, so a purged memory
    leaves nothing behind in the full-text index.

## 0.9.1

### Patch Changes

- 106c281: `toMatchQuery` OR-joins the words of a query (each Latin word a prefix term,
  each CJK word a character phrase) so a memory that matches any word is a
  candidate and bm25 ranks the rest. The retrieval benchmark now measures
  Recall@K and MRR (`pnpm bench:retrieval`).

## 0.9.0

### Minor Changes

- 8e1c285: Add the FTS5 memory retriever: `lib/retriever.ts` indexes a memory
  (`indexMemory`), backfills on first search (`ensureMemoryIndex`) and answers
  with ranked ids (`retrieveMemoryIds`); `memory_search` and
  `memories.search_text` ship in the schema, and `lib/search.ts` segments CJK so
  substring search works. Context retrieval uses it before the keyword fallback.
  See `docs/RETRIEVER.md`.
- 118f319: Add `lib/search.ts`: `segmentForSearch` and `toMatchQuery` prepare text and
  queries for FTS5 so CJK substring search works on both runtimes. The Retriever
  spike that motivated it is in `docs/RETRIEVER.md`.

## 0.8.0

### Minor Changes

- d0d813e: Add durable action execution. An approved proposal carries an executable
  descriptor, an idempotency key, an execution status and the result or error;
  `executeApprovedAction` claims a lease, runs the executor registered for the
  action type, records the outcome, skips when the permission was revoked, and
  never runs a succeeded action twice. New exports: `executeApprovedAction`,
  `ActionExecutor`, `ActionExecutorContext`, `ActionExecutorRegistry`,
  `ActionExecutionStatus` and `EXECUTION_LEASE_MS`.

### Patch Changes

- bde8de8: Normalise the dates a model returns. `normalizeModelDate` resolves free-text
  dates ("next week", "Friday") with the server rules and drops a past date when
  the words point at the future, so a model cannot store "next week" or a
  hallucinated past date as a commitment window. Found by the new LLM benchmark
  (`pnpm bench:llm`, see `docs/BENCHMARKS-LLM.md`).

## 0.7.0

### Minor Changes

- 28a9586: Enforce the privacy gateway at the provider boundary. `createLLMProvider` now
  requires a `MessageGuard` for every non-`dev` kind, and `createMessageGuard`
  builds one from the database and the user: user-role messages are redacted by
  data level, one audit row is written per call, and level 4 throws before
  anything is prepared. New exports: `withMessageGuard`, `isPrivacyGuarded`,
  `PrivacyBlockedError`, `MessageGuard` and `resolvePrivacyLevel`. ADR 0011.

## 0.6.0

### Minor Changes

- 747243d: Add the Action Gate: `assessActionRisk`, `proposeAction`, `decideAction`,
  `revokeAction`, `listActionProposals` and `runGatedAction`. Low-risk actions run,
  medium-risk actions run and are recorded, high-risk actions wait for one
  approval and critical actions need two. Every proposal, decision and revocation
  writes an action-log entry. ADR 0005.
- 4ea1c06: Add the daily buffer and task migration. `planCapacityMinutes` keeps a quarter
  of the daytime window free and auto-fill respects it; `migrateStaleWork` moves
  slipped, flexible, unstarted work forward, counts the deferral, and surfaces an
  item after three deferrals instead of moving it again. A commitment with a
  deadline never migrates silently. ADR 0008.
- 60768cf: Add dependency constraints: `addDependency`, `removeDependency`,
  `listDependencies` and `blockedCommitmentIds`. The planner skips a commitment
  while a blocker is open, a finished blocker releases it, and cycles are refused.
  ADR 0009.
- 1c253c9: Size Today slots from project history. `estimateDurationMinutes` keeps a stated
  estimate, calibrates it against the median of completed work in the same project,
  and fills a missing estimate from that median. The planner uses the result for
  slot length and records the reason.
- ccff588: Add `formatActionProposals`: a locale-aware card for the Action Gate queue,
  shared with the MCP tools.
- 93201b4: Add `formatActionCard` and `formatTodayText`: locale-aware text projections of
  the ActionCard and the Today payload. Pure functions, shared by the examples and
  the MCP tool returns.
- dbe23fc: Add the memory value model: `memoryLevelFor`, `decayWeight`,
  `memoryValueScore` and `memoryRetrievalScore`. Retrieval now weighs the keyword
  match by level, decay and value, so a fresh principle outranks an old
  experience. The memory list exposes `level` and `decay`.
- 120bd72: Permission evolution: `getAutonomyState` returns the earned level, the user's
  ceiling and the effective level (`min(max(earned, 2), ceiling)`), the gate
  applies it by default, and `setAutonomyCeiling` accepts 2, 3 or 4 and logs the
  change. High-risk autonomy needs the ceiling raised. ADR 0007.
- 8bdc95c: Add the scored Now and the morning plan. `scoreNow` weighs urgency, importance,
  time fit and context match, and the reason travels with the Now item;
  `classifyDay` splits the day into core, optional and deferred and the Today
  payload carries it.
- 9a4d5e0: Add the privacy mechanisms: `redactText`, `prepareCloudPayload` (redaction by
  data level, level 4 stays local), permission scopes with Memory private by
  default (`grantScope`, `revokeScope`, `memoryPermission`), and `purgeUserData`
  for true deletion. ADR 0010.
- 5bcbd6b: Add `replanAfterChange`: finishing a commitment re-derives the Today plan, and
  a planning failure never fails the change that triggered it. `POST
/v1/commitments/:id/complete` returns the replan result.
- 04d25f0: Add the trust score and autonomy levels: `computeTrustScore`,
  `autonomyLevelFor`, `effectiveStatusFor` and `getAutonomyState`. Trust is the
  Laplace-smoothed approval rate of decided actions; a level passed to
  `proposeAction` widens what runs without asking. `formatActionProposals` takes
  an optional autonomy footer. ADR 0006.

## 0.5.3

### Patch Changes

- README: add "The system behind it" — the four engines, the memory pipeline and
  the three rules that keep memory honest. Every line describes shipped behaviour;
  the parts of the design that are not built yet (graded memory levels, decay, the
  value score, trust and autonomy, model orchestration) moved to ROADMAP.md with a
  note on what exists today.

## 0.5.2

### Patch Changes

- README: the comparison table comes back with a "What you use today" column, so
  each of the nine dimensions shows the contrast side by side with what the system
  does.

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
