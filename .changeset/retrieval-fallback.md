---
"@aldus-palace/core": patch
---

Fix the memory retrieval fallback. The keyword pass filtered on a score that has
a positive floor, so when nothing matched it injected arbitrary memories. It now
matches on the keyword hit and falls back to principles and preferences.
