---
"@aldus-palace/core": minor
---

Enforce the privacy gateway at the provider boundary. `createLLMProvider` now
requires a `MessageGuard` for every non-`dev` kind, and `createMessageGuard`
builds one from the database and the user: user-role messages are redacted by
data level, one audit row is written per call, and level 4 throws before
anything is prepared. New exports: `withMessageGuard`, `isPrivacyGuarded`,
`PrivacyBlockedError`, `MessageGuard` and `resolvePrivacyLevel`. ADR 0011.
