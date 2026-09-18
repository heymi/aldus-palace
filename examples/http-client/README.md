# http-client

Drive the same capabilities over HTTP — no library linking, any language.

```bash
# terminal 1
cd apps/server && cp .env.example .env && pnpm dev

# terminal 2
pnpm --filter @aldus-palace/example-http-client start "Ship the onboarding page next week"
```

The client walks the useful surface: health → capture → today → work streams,
and prints the endpoints worth knowing.

Equivalent curl:

```bash
curl -s localhost:8787/health

curl -s -X POST localhost:8787/v1/inputs \
  -H 'Authorization: Bearer dev-local-token' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Ship the onboarding page next week","mode":"sync"}'

curl -s localhost:8787/v1/today        -H 'Authorization: Bearer dev-local-token'
curl -s localhost:8787/v1/work-streams -H 'Authorization: Bearer dev-local-token'
curl -s 'localhost:8787/v1/memories?state=candidate' -H 'Authorization: Bearer dev-local-token'
```

`mode` on capture: `progressive` (default, local-first with a background AI pass),
`sync` (wait for the model), `local` (rules only). See
[../../docs/INTEGRATION.md](../../docs/INTEGRATION.md) for the full route table.
