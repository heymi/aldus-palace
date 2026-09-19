/**
 * Public API of @aldus-palace/core.
 *
 * The runtime never reads process.env and holds no global state: callers
 * provide a `SqlDatabase` (see ./db/port) and an `LLMProvider`
 * (see ./providers), then call the agent entry points below.
 */

// Domain model
export * from "./domain/types.js";

// Storage port + migrations
export type {
  SqlDatabase,
  SqlStatement,
  SqlRunResult,
} from "./db/port.js";
export { nowIso } from "./db/port.js";
export {
  applySchema,
  migrate,
  initialize,
  MIGRATIONS,
  type Migration,
} from "./db/migrate.js";
export { SCHEMA_SQL } from "./db/schema.js";

// Agent runtime
export {
  processRawInput,
  clearInputDerivatives,
  type ProcessMode,
} from "./agent/understand.js";

// Providers
export {
  createLLMProvider,
  resolveProviderConfig,
  isRealLLMProvider,
  DevLLMProvider,
  OpenAICompatibleProvider,
  AnthropicProvider,
  ProviderConfigError,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  type LLMProvider,
  type ChatMessage,
  type ProviderConfig,
  type ProviderKind,
  type OpenAICompatibleOptions,
  type AnthropicOptions,
} from "./providers/index.js";

// Repositories
export { writeActionLog, listActionLogs } from "./repos/actionLogs.js";
export { ensureDevUser, getUserById } from "./repos/users.js";

// Identifiers
export { newId } from "./lib/id.js";

// Domain services
export * from "./services/adaptivePlanning.js";
export * from "./services/commitmentClassification.js";
export * from "./services/commitments.js";
export * from "./services/enrichmentLease.js";
export * from "./services/memoryLifecycle.js";
export * from "./services/memoryEvolution.js";
export * from "./services/planToday.js";
export * from "./services/resolveClarification.js";
export * from "./services/today.js";
export * from "./services/workStreams.js";

// Pure helpers that are useful to embedders and tests
export * from "./lib/actionableWork.js";
export * from "./lib/actionMessages.js";
export * from "./lib/clarificationReply.js";
export * from "./lib/concepts.js";
export * from "./lib/inputObjectMode.js";
export * from "./lib/locale.js";
export * from "./lib/memoryActivation.js";
export * from "./lib/memoryExtract.js";
export * from "./lib/projectMatch.js";
export * from "./lib/relativeDay.js";
export * from "./lib/thoughtTitle.js";
export * from "./lib/time.js";
