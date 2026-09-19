---
"@aldus-palace/core": patch
---

Read a model's date-only value as the user's local day, and scope the future-date
check to the commitment's clause. A `YYYY-MM-DD` deadline is no longer parsed as
UTC midnight (which shifted the day for users west of UTC), and a future word in
one clause no longer drops a real past date that belongs to another.
