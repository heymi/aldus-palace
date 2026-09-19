# Governance

## Current model

Aldus Palace is maintained by a **single maintainer**
([@heymi](https://github.com/heymi)) with AI-agent assistance. That is a bus
factor of one, stated here deliberately so contributors can plan around it.

Decisions are recorded as ADRs in [`docs/adr`](docs/adr). The schema, the
acceptance fixtures and the ADRs are the contract; opinions in issues are not.

## Roles

| Role | Who | Can |
|---|---|---|
| Maintainer | @heymi | merge, release, change scope, appoint maintainers |
| Contributors | anyone | issues, PRs, fixtures, docs, reviews |

There is no formal committer tier yet. When there are two or more people
reviewing regularly, this file will define one.

## How decisions are made

1. **Small, reversible changes** (bug fixes, tests, docs, fixtures): lazy
   consensus — open a PR, get one review, merge.
2. **Durable design decisions** (schema, storage port, model contract, public
   API shape): an ADR in `docs/adr` with status `proposed`, discussed in the PR,
   merged only when the maintainer marks it `accepted`.
3. **Scope changes**: must cite why the change reduces the amount of management
   the user has to do (see [AGENTS.md](AGENTS.md)). “Other products have it” is
   not a reason.

## Merge rules

- CI must be green. `pnpm verify` is the full list: typecheck, test, eval, bench,
  build, spec:check, openapi:check, llms:check, check:docs.
- Commits must carry a DCO sign-off (`git commit -s`).
- One maintainer approval is required today.

## Releases

- `@aldus-palace/core` follows semver; `0.x` means the API may still change in a
  minor release, and changes are documented in the changelog.
- Releases are cut from `main` with changesets; artifacts are published from CI.
- Migrations are forward-only. A release that changes the schema must ship the
  migration in the same commit as the code that depends on it.

## Becoming a maintainer

Sustained contribution — reviews, fixtures, docs, code — is the path. When it
happens, this file and `.github/CODEOWNERS` will be updated with the new
maintainer's areas.
