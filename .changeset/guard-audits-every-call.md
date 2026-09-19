---
"@aldus-palace/core": patch
---

The privacy guard writes its per-call audit row for every outcome. Level 0 and a
blocked level 4 now leave a `privacy_gateway_redacted` entry, as ADR 0011 states,
instead of only levels 1–3.
