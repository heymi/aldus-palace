import {
  PRIVACY_GUARDED,
  PrivacyGuardRequiredError,
  type MessageGuard,
} from "./guard.js";
import type { ChatMessage, LLMProvider } from "./types.js";

export type OpenAICompatibleOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Redacts outgoing messages before they leave; required for a cloud call. */
  guard: MessageGuard;
  /** Display name reported by the provider (defaults to "openai-compatible"). */
  name?: string;
};

/**
 * Provider for any OpenAI-compatible chat-completions endpoint
 * (DeepSeek, OpenAI, local servers, gateways…).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly guard: MessageGuard;

  constructor(options: OpenAICompatibleOptions) {
    if (!options.guard) throw new PrivacyGuardRequiredError("openai-compatible");
    this.guard = options.guard;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.name = options.name ?? "openai-compatible";
    Object.defineProperty(this, PRIVACY_GUARDED, { value: true });
  }

  async complete(
    messages: ChatMessage[],
    options?: { json?: boolean }
  ): Promise<string> {
    const guarded = await this.guard(messages);
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: guarded,
        temperature: 0.2,
        response_format: options?.json ? { type: "json_object" } : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${this.name} error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.name} returned empty content`);
    return content;
  }
}
