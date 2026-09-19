---
"@aldus-palace/core": minor
---

Permission evolution: `getAutonomyState` returns the earned level, the user's
ceiling and the effective level (`min(max(earned, 2), ceiling)`), the gate
applies it by default, and `setAutonomyCeiling` accepts 2, 3 or 4 and logs the
change. High-risk autonomy needs the ceiling raised. ADR 0007.
