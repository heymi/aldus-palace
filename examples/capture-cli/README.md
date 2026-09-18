# capture-cli

The smallest possible embedder: an in-memory SQLite `SqlDatabase` implementation
(~40 lines), the offline `DevLLMProvider`, and one call to `processRawInput`.

```bash
pnpm --filter @aldus-palace/example-capture-cli start
pnpm --filter @aldus-palace/example-capture-cli start "Ship the onboarding page next week"
```

It prints the full `ActionCard`: thoughts, commitments, decisions, memory
candidates, clarifications and warnings.
