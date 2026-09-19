import { AnthropicProvider } from "./anthropic.js";
import { DevLLMProvider } from "./dev.js";
import { withMessageGuard, type MessageGuard } from "./guard.js";
import { OpenAICompatibleProvider } from "./openai_compatible.js";
import type { LLMProvider } from "./types.js";

export type { LLMProvider, ChatMessage } from "./types.js";
export { DevLLMProvider } from "./dev.js";
export { OpenAICompatibleProvider } from "./openai_compatible.js";
export type { OpenAICompatibleOptions } from "./openai_compatible.js";
export { AnthropicProvider } from "./anthropic.js";
export type { AnthropicOptions } from "./anthropic.js";
export {
  PRIVACY_GUARDED,
  PrivacyBlockedError,
  isPrivacyGuarded,
  withMessageGuard,
  type MessageGuard,
} from "./guard.js";

export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "deepseek-chat";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

export type ProviderKind =
  | "dev"
  | "deepseek"
  | "openai-compatible"
  | "anthropic";

export type ProviderConfig = {
  /** Backend to use. `dev` is deterministic and needs no network. */
  kind: ProviderKind;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Display name for logs/errors (defaults to the kind). */
  name?: string;
  /** Anthropic API version header (anthropic only). */
  version?: string;
  /** Max output tokens (anthropic only). */
  maxTokens?: number;
  /** Sink for diagnostics; defaults to `console`. */
  log?: (message: string) => void;
};

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

/**
 * Build an LLM provider from explicit configuration.
 *
 * The library never reads `process.env`; callers (servers, CLIs, tests) own
 * configuration and can construct as many providers as they need.
 *
 * A cloud provider must be built with a `guard`: the provider layer refuses to
 * create one without it, so a cloud call cannot leave the device unredacted.
 * `dev` runs on the device and needs no guard.
 */
export function createLLMProvider(
  config: ProviderConfig,
  guard?: MessageGuard
): LLMProvider {
  const log = config.log ?? ((message: string) => console.log(message));

  if (config.kind === "dev") {
    log("[llm] provider=dev (local rules)");
    return new DevLLMProvider();
  }

  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new ProviderConfigError(
      `provider "${config.kind}" requires an apiKey (set the corresponding env var or fall back to kind="dev")`
    );
  }

  const provider = buildCloudProvider(config, apiKey, log);

  if (!guard) {
    throw new ProviderConfigError(
      `provider "${config.kind}" requires a privacy guard (build one with createMessageGuard and pass it to createLLMProvider)`
    );
  }
  return withMessageGuard(provider, guard);
}

function buildCloudProvider(
  config: ProviderConfig,
  apiKey: string,
  log: (message: string) => void
): LLMProvider {
  if (config.kind === "anthropic") {
    const model = config.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
    log(`[llm] provider=anthropic model=${model}`);
    return new AnthropicProvider({
      apiKey,
      model,
      baseUrl: config.baseUrl,
      version: config.version,
      maxTokens: config.maxTokens,
      name: config.name ?? "anthropic",
    });
  }

  const baseUrl =
    config.baseUrl?.trim() ||
    (config.kind === "deepseek"
      ? "https://api.deepseek.com"
      : undefined);

  if (!baseUrl) {
    throw new ProviderConfigError(
      `provider "${config.kind}" requires a baseUrl (OpenAI-compatible endpoint)`
    );
  }

  const model =
    config.model?.trim() ||
    (config.kind === "deepseek"
      ? DEFAULT_OPENAI_COMPATIBLE_MODEL
      : undefined);

  if (!model) {
    throw new ProviderConfigError(
      `provider "${config.kind}" requires a model`
    );
  }

  log(`[llm] provider=${config.kind} model=${model}`);
  return new OpenAICompatibleProvider({
    apiKey,
    baseUrl,
    model,
    name: config.name ?? config.kind,
  });
}

/**
 * Resolve provider configuration from environment variables.
 * Kept in the library so servers share one documented precedence rule.
 */
export function resolveProviderConfig(
  env: Record<string, string | undefined>
): ProviderConfig {
  const mode = (env.LLM_PROVIDER ?? "auto").toLowerCase();
  const anthropicKey = env.ANTHROPIC_API_KEY;
  const compatibleKey = env.OPENAI_COMPATIBLE_API_KEY ?? env.DEEPSEEK_API_KEY;

  if (mode === "dev") return { kind: "dev" };

  if (mode === "anthropic") {
    return {
      kind: anthropicKey ? "anthropic" : "dev",
      apiKey: anthropicKey,
      baseUrl: env.ANTHROPIC_BASE_URL,
      model: env.ANTHROPIC_MODEL,
      maxTokens: env.ANTHROPIC_MAX_TOKENS
        ? Number(env.ANTHROPIC_MAX_TOKENS)
        : undefined,
    };
  }

  if (mode === "openai-compatible") {
    return {
      kind: compatibleKey ? "openai-compatible" : "dev",
      apiKey: compatibleKey,
      baseUrl: env.OPENAI_COMPATIBLE_BASE_URL,
      model: env.OPENAI_COMPATIBLE_MODEL,
      name: env.LLM_PROVIDER,
    };
  }

  if (mode === "deepseek") {
    return {
      kind: compatibleKey ? "deepseek" : "dev",
      apiKey: compatibleKey,
      baseUrl: env.DEEPSEEK_BASE_URL ?? env.OPENAI_COMPATIBLE_BASE_URL,
      model: env.DEEPSEEK_MODEL ?? env.OPENAI_COMPATIBLE_MODEL,
    };
  }

  // auto: prefer whichever key is configured, otherwise run offline.
  if (anthropicKey) {
    return {
      kind: "anthropic",
      apiKey: anthropicKey,
      model: env.ANTHROPIC_MODEL,
    };
  }
  if (compatibleKey) {
    return {
      kind: "deepseek",
      apiKey: compatibleKey,
      baseUrl: env.DEEPSEEK_BASE_URL ?? env.OPENAI_COMPATIBLE_BASE_URL,
      model: env.DEEPSEEK_MODEL ?? env.OPENAI_COMPATIBLE_MODEL,
    };
  }
  return { kind: "dev" };
}

export function isRealLLMProvider(provider: LLMProvider): boolean {
  return provider.name !== "dev";
}
