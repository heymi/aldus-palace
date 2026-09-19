---
"@aldus-palace/core": minor
---

The runtime writes in the user's language.

- The deterministic provider follows the input's script when no locale was
  configured, so a Chinese sentence produces Chinese wording and an English one
  produces English (an explicit `locale` still wins). `DevLLMProvider.locale` is
  now optional.
- Rule-based memories follow `user.language`, and `setUserLanguage` updates it,
  so a client can switch the language of what the system writes.
