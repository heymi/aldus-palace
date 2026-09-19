---
status: accepted
---

# The privacy gateway is a provider boundary

## Context

The Privacy Gateway (ADR 0010) could redact a cloud call, but nothing made a
caller use it: the runtime's model calls went straight to the provider, and the
documents described redaction as a protection that was in place. A protection
that can be skipped is a convention, not architecture.

## Decision

- **The guard is a port in the provider layer.** `providers/guard.ts` defines
  `MessageGuard`, `withMessageGuard`, `isPrivacyGuarded` and
  `PrivacyBlockedError`. The provider layer stays transport-only: it never
  imports the database.
- **The implementation lives where the database is.**
  `services/privacyGateway.ts` exports `createMessageGuard(db, userId, { level,
  contacts, locale })`, built by the composition root (the server, the Worker,
  the MCP backend).
- **A cloud provider is only built with a guard.** `createLLMProvider(config,
  guard)` refuses a non-`dev` kind without one, and wraps the provider with
  `withMessageGuard`. `dev` runs on the device and needs no guard.
- **Only user-role messages are redacted.** The system prompt is instructions and
  is left untouched, so a project name that overlaps a schema word cannot change
  the prompt.
- **One audit row per call.** The guard writes a single
  `privacy_gateway_redacted` entry per `complete()`, not one per message.
- **Level 4 refuses.** The guard throws `PrivacyBlockedError` before any content
  is prepared; callers fall back to the deterministic rules.
- **The level is configuration.** `PRIVACY_LEVEL` (0–4, default 2) is resolved by
  `resolvePrivacyLevel(env)` and passed in; the library never reads
  `process.env`.

## Consequences

- A cloud call made through the factory cannot leave unredacted, and level 4
  never leaves at all.
- The provider layer keeps its dependency rule (`providers/` imports only its own
  types), so provider tests stay pure.
- The exported low-level classes (`AnthropicProvider`,
  `OpenAICompatibleProvider`) remain available for advanced use; direct use
  bypasses the guard and is outside the supported path.
- One level applies per provider; a level per call is a follow-up (see
  `docs/INTELLIGENCE.md`, "Designed").
- Covered by `packages/core/test/privacy.test.ts` (the guard) and
  `packages/core/test/providers.test.ts` (the factory).
