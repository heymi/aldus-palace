---
"@aldus-palace/core": patch
---

Resolve more relative phrases a model returns, and fill a deadline from the right
edge of the window.

"下个月", every weekday ("周一", "Wednesday") and "next Monday" now resolve
instead of being dropped, and a window phrase fills a deadline with the window's
end rather than its start, so "next week" does not become the first day.
