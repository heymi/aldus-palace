import { DevLLMProvider } from "./dev.js";
import { OpenAICompatibleProvider } from "./openai_compatible.js";
import type { LLMProvider } from "./types.js";

export type { LLMProvider, ChatMessage } from "./types.js";
export { DevLLMProvider } from "./dev.js";
export { OpenAICompatibleProvider } from "./openai_compatible.js";
export type { OpenAICompatibleOptions } from "./openai_compatible.js";

export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "deepseek-chat";

export type ProviderKind = "dev" | "deepseek" | "openai-compatible";

export type ProviderConfig = {
  /** Backend to use. `dev` is deterministic and needs no network. */
  kind: ProviderKind;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Display name for logs/errors (defaults to the kind). */
  name?: string;
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
 */
export function createLLMProvider(config: ProviderConfig): LLMProvider {
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
  const apiKey = env.OPENAI_COMPATIBLE_API_KEY ?? env.DEEPSEEK_API_KEY;

  if (mode === "dev" || (mode === "auto" && !apiKey)) {
    return { kind: "dev" };
  }
  if (mode === "deepseek" || mode === "auto") {
    return {
      kind: apiKey ? "deepseek" : "dev",
      apiKey,
      baseUrl: env.DEEPSEEK_BASE_URL ?? env.OPENAI_COMPATIBLE_BASE_URL,
      model: env.DEEPSEEK_MODEL ?? env.OPENAI_COMPATIBLE_MODEL,
    };
  }
  return {
    kind: "openai-compatible",
    apiKey,
    baseUrl: env.OPENAI_COMPATIBLE_BASE_URL,
    model: env.OPENAI_COMPATIBLE_MODEL,
    name: env.LLM_PROVIDER,
  };
}

export function isRealLLMProvider(provider: LLMProvider): boolean {
  return provider.name !== "dev";
}
