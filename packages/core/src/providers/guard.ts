/**
 * The message guard.
 *
 * A cloud provider is wrapped with a guard before it can send anything. The
 * guard is injected by the composition root, where the database and the user are
 * known, so the provider layer stays transport-only and never touches storage.
 *
 * Level 4 content never leaves: the guard throws and the caller falls back to
 * the deterministic rules.
 */

import type { ChatMessage, LLMProvider } from "./types.js";

/** Brand set on a provider that already carries a guard. */
export const PRIVACY_GUARDED = Symbol.for("aldus.privacy-guarded");

export class PrivacyBlockedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "PrivacyBlockedError";
  }
}

/** Inspect the outgoing messages and return what may be sent. */
export type MessageGuard = (messages: ChatMessage[]) => Promise<ChatMessage[]>;

/**
 * Wrap a provider so every call passes through the guard first. Idempotent:
 * wrapping an already-guarded provider returns it unchanged.
 */
export function withMessageGuard(
  provider: LLMProvider,
  guard: MessageGuard
): LLMProvider {
  if (isPrivacyGuarded(provider)) return provider;
  const guarded: LLMProvider = {
    name: provider.name,
    complete(messages, options) {
      return guard(messages).then((safe) => provider.complete(safe, options));
    },
  };
  Object.defineProperty(guarded, PRIVACY_GUARDED, { value: true });
  return guarded;
}

export function isPrivacyGuarded(provider: LLMProvider): boolean {
  return Boolean(
    (provider as unknown as Record<symbol, unknown>)[PRIVACY_GUARDED]
  );
}
