import type { ChatMessage, LLMProvider } from "./types.js";

export type AnthropicOptions = {
  apiKey: string;
  model: string;
  /** Defaults to https://api.anthropic.com */
  baseUrl?: string;
  /** Defaults to 2023-06-01 */
  version?: string;
  maxTokens?: number;
  name?: string;
};

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic Messages API provider.
 *
 * Two shape differences from the OpenAI-compatible format are handled here:
 * `system` is a top-level parameter, and `messages` contain only user/assistant
 * turns. Callers keep using the provider-neutral `ChatMessage[]`.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly version: string;
  private readonly maxTokens: number;

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = options.model;
    this.version = options.version ?? DEFAULT_VERSION;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.name = options.name ?? "anthropic";
  }

  async complete(
    messages: ChatMessage[],
    options?: { json?: boolean }
  ): Promise<string> {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const turns = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));

    // The Messages API rejects an empty `messages` array.
    if (turns.length === 0) {
      turns.push({ role: "user", content: system || "(empty)" });
    }

    // The Messages API has no `response_format`; ask for JSON in-band instead.
    const systemPrompt = options?.json
      ? [system, "Respond with a single JSON object and nothing else."]
          .filter(Boolean)
          .join("\n\n")
      : system;

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": this.version,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: turns,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${this.name} error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim();

    if (!text) throw new Error(`${this.name} returned empty content`);
    return text;
  }
}
