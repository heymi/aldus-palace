# Contributing

Thanks for helping. Aldus Palace is a small project with a deliberately narrow
surface — the fastest way to get a change merged is to keep it focused.

## Before you start

- **Bugs and behaviour**: open an issue first if the change is non-obvious.
- **Fixtures**: adding an `eval/fixtures/*.json` case is the best first
  contribution. See [docs/EVAL.md](docs/EVAL.md#adding-a-fixture).
- **Dependencies**: `packages/core` is runtime-agnostic and dependency-light. New
  runtime dependencies need a strong justification.
- **Architecture changes**: read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
  the [ADRs](docs/adr), and expect a discussion before code.

## Development

```bash
pnpm install
pnpm typecheck       # all packages
pnpm test            # deterministic suites (offline, no API key)
pnpm eval            # acceptance fixtures (offline)
pnpm build           # build @aldus-palace/core to dist/
pnpm gen:spec        # regenerate spec/schema.sql after schema edits
```

Run the reference server with `pnpm dev` (see `apps/server/README.md`).

## What CI checks

Every pull request runs, with **no secrets**:

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm eval`
4. `pnpm build`
5. `pnpm spec:check` — `spec/schema.sql` matches the canonical schema

## Pull requests

- Keep the diff focused; one concern per PR.
- Add or extend a deterministic test for logic changes.
- Add a fixture if user-visible understanding behaviour changes.
- If the change is a durable design decision, add an ADR under `docs/adr/`
  (`NNNN-short-title.md`, status `proposed` or `accepted`).
- Update `docs/` when the change makes it stale.

## Commit sign-off (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/)
instead of a CLA. Sign off every commit:

```bash
git commit -s -m "fix: resolve relative dates before midnight"
```

which appends:

```
Signed-off-by: Your Name <you@example.com>
```

By signing off you certify that you wrote the contribution or have the right to
submit it under the Apache-2.0 license. PRs whose commits are not signed off
cannot be merged.

## Code of conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

Do not open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
