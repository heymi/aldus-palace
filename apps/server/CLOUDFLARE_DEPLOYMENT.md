# Cloudflare deployment

The production topology is one **named** Durable Object backed by SQLite. That
preserves the synchronous SQL transactions the planner relies on, while moving
storage, coordination and observability to Cloudflare.

## One-time setup

```bash
cd apps/server
pnpm install
pnpm cf:types
wrangler login

# required secrets — never put these in wrangler.jsonc `vars`
wrangler secret put DEV_AUTH_TOKEN
wrangler secret put DEEPSEEK_API_KEY          # optional: LLM_PROVIDER=dev works without it
```

## Deploy

```bash
pnpm cf:deploy
```

Then point a client at the worker URL and use the same `DEV_AUTH_TOKEN` as a
bearer token.

## Operational notes

- **All data lives in a single Durable Object instance** named `primary`. This is
  intentional for a single-user product; it is not horizontally partitioned.
- Schema and migrations run automatically the first time the object is
  constructed (`blockConcurrencyWhile`), using the same `@aldus-palace/core`
  migrations as the local adapter.
- `wrangler.jsonc` declares the required secrets so that `pnpm cf:types` keeps
  `env.DEV_AUTH_TOKEN` typed.
- Point-in-time recovery and observability are handled by the platform
  (`observability.enabled`).
