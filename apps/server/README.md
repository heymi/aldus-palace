# @aldus-palace/server

Reference HTTP server for [Aldus Palace](../../README.md): a [Hono](https://hono.dev)
app that exposes the capture → understand → structure → today loop, with two
interchangeable storage adapters.

| Adapter | File | Runtime |
|---|---|---|
| Local SQLite (`better-sqlite3`) | `src/db/local.ts` | Node, `pnpm dev` |
| Cloudflare Durable Object SQLite | `src/db/durableObject.ts` | Workers, `wrangler dev` / `deploy` |

## Run locally

```bash
cd apps/server
cp .env.example .env
pnpm install          # from the repo root once
pnpm dev              # http://127.0.0.1:8787
```

```bash
curl http://127.0.0.1:8787/health
# {"ok":true,"service":"aldus-palace-api","runtime":"local","llm":"dev"}

curl -X POST http://127.0.0.1:8787/v1/inputs \
  -H 'Authorization: Bearer dev-local-token' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Ship the onboarding page next week","mode":"sync"}'
```

No API key is required: `LLM_PROVIDER=dev` runs the deterministic rule engine
(see [`docs/EVAL.md`](../../docs/EVAL.md)).

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | public |
| GET | `/v1/me` | user |
| POST | `/v1/inputs` | `{ content, source?, process?, mode? }`; `mode` is `progressive` \| `sync` \| `local` |
| POST | `/v1/inputs/:id/enrich` | AI pass that replaces local derivatives |
| POST | `/v1/inputs/:id/process` | retry processing |
| GET | `/v1/inputs/:id` | raw input + linked objects |
| GET | `/v1/thoughts`, `/v1/commitments`, `/v1/memories`, `/v1/concepts` | lists |
| GET | `/v1/work-streams` | grouped, rebuildable projection over commitments |
| POST | `/v1/memories/:id/confirm` \| `/reject` | one-tap confirmation; `{ supersedes? }` replaces an older memory |
| GET | `/v1/memories/:id/versions` | the history of a belief |
| GET | `/v1/today` | Today projection |
| GET | `/v1/activity` | action log |
| GET/POST | `/v1/projects` | context containers |

## Cloudflare Workers

```bash
pnpm cf:types     # regenerate worker-configuration.d.ts
pnpm cf:dev
pnpm cf:deploy
```

Secrets (`DEV_AUTH_TOKEN`, `DEEPSEEK_API_KEY`, `OPENAI_COMPATIBLE_API_KEY`) are
declared in `wrangler.jsonc` and must be set with `wrangler secret put` — never
in `vars`. See [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md).

## Security

This is a **single-user, self-hosted** service with one static bearer token and
no multi-tenant isolation. Do not expose it to the public internet. See
[SECURITY.md](../../SECURITY.md).
