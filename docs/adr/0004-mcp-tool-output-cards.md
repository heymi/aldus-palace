---
status: accepted
---

# MCP tool output carries a card and a structured payload

## Context

The MCP tools returned `JSON.stringify(payload, null, 2)` as their only text
content. A model reads that; a person screenshots it. Both see a JSON wall,
which hides the product's point: a sentence becomes typed objects, and a memory
says why it is active.

MCP clients show `content` to the model and can carry `structuredContent` for
programmatic consumers. The SDK validates `structuredContent` against
`outputSchema` when one is declared.

## Decision

`capture` and `list_today` return both:

- `content` — a short, locale-aware text card, built by `formatActionCard` and
  `formatTodayText` in `packages/core/src/lib/format.ts`.
- `structuredContent` — the full payload, unchanged, with an `outputSchema` so
  clients can validate it.

The card follows `users.language` through the backend locale: the local backend
reads the user row, the HTTP backend defaults to English. The five remaining
tools keep their JSON text until they get the same treatment, so the change
stays reviewable.

## Consequences

- The model quotes a receipt (`Captured · 1 commitment`, `memory · active`)
  instead of parsing a wall, and a screenshot tells the whole story.
- Programmatic consumers read `structuredContent`; the text-JSON contract of
  these two tools changes, which is why the release is a minor version.
- `packages/mcp/test/tools.test.ts` reads `structuredContent` for assertions and
  asserts the card text.
- `formatActionCard` and `formatTodayText` are pure functions in core, covered by
  `packages/core/test/format.test.ts`, and shared with the examples.
