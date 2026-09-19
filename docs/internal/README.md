# Internal / historical documents

Everything under `docs/internal/` is **not part of the product contract**.

- `design-archive/` — the original Chinese design documents this project was
  built from: MVP scope decisions, the object schema, acceptance scenarios, the
  engineering breakdown, and the longer vision essays. They explain *why* the
  domain model looks the way it does; they are not the specification.
- Where they disagree with the code or with [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md),
  [`docs/DOMAIN-SCHEMA.md`](../DOMAIN-SCHEMA.md) or `spec/schema.sql`, the code
  and the English docs win.

Translations are not maintained.

## What is normative

| Priority | Source |
|---|---|
| 1 | `packages/core/src/db/schema.ts` + `spec/schema.sql` |
| 2 | `docs/ARCHITECTURE.md`, `docs/DOMAIN-SCHEMA.md` (the capability map is `docs/CAPABILITIES.md`) |
| 3 | `eval/fixtures/*.json` — behaviour the product promises |
| 4 | `docs/adr/*` — decisions already made |
