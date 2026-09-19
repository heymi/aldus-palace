---
"@aldus-palace/core": minor
---

A cloud provider now requires its privacy guard at construction.

`AnthropicProvider` and `OpenAICompatibleProvider` throw
`PrivacyGuardRequiredError` without a `guard`, and apply it inside `complete`.
The guarantee no longer depends on going through `createLLMProvider`, which
still takes the guard the same way. Constructing a provider directly now means
passing `guard`.
