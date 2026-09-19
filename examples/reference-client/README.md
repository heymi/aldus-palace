# reference-client

A minimal browser client for the HTTP API.

**Online demo:** <https://aldus-palace-demo.iheymi.workers.dev> — each visitor
gets a private context, so what you capture is yours alone.

One page, five reads of the same context:

| Panel | Route | What it shows |
|---|---|---|
| Capture | `POST /v1/inputs`, `POST /v1/inputs/:id/enrich` | the sentence you wrote and what it became |
| Now | `GET /v1/today` | the one thing to do now, the day's plan, what is at risk |
| Memory | `GET /v1/memories?state=active` | what the system remembers, with level and decay |
| Evidence | `GET /v1/inputs/:id` | the original sentence behind a memory |
| Waiting for you | `GET /v1/actions?status=proposed`, `POST /v1/actions/:id/decide` | proposed actions, and approve / reject |

No framework, no build step, no dependencies: a static page plus a small host
that proxies `/api/*` with the bearer token, so the token never reaches the
browser. Node 18+ is required (for `fetch`).

## Run it

In one terminal, the API:

```bash
pnpm --filter @aldus-palace/server start      # http://127.0.0.1:8787
```

In another, the client:

```bash
pnpm --filter @aldus-palace/example-reference-client start
# Reference client on http://localhost:5173  →  http://127.0.0.1:8787
```

Open http://localhost:5173. With no model key the capture is handled by the
offline rules and the page still fills; with a real provider the card arrives
local-first and is replaced when the model reading lands.

Two sentences show every panel:

- `Ship the onboarding page today.` → a commitment in Now and the timeline
- `I prefer simple tools and fewer settings.` → a memory; click it for Evidence

## Configure

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | interface the host listens on; loopback, since it holds the token |
| `PORT` | `5173` | port the client is served on |
| `ALDUS_API_URL` | `http://127.0.0.1:8787` | where the API runs |
| `ALDUS_API_TOKEN` | `dev-local-token` | bearer token the host sends upstream |

`⌘↵` (or `Ctrl↵`) files the current sentence. Clicking a memory shows the raw
input it came from.

## Deploy the online demo

The same page runs on Cloudflare Workers with a private Durable Object per
visitor. The Worker serves these files and proxies `/api/*`, so the token never
reaches the browser:

```bash
cd apps/server
printf '%s' "$(openssl rand -hex 32)" | wrangler secret put DEV_AUTH_TOKEN -c wrangler.demo.jsonc
pnpm cf:deploy:demo
```

`wrangler.demo.jsonc` points the assets binding at this directory and sets
`DEMO_MODE=true` and `LLM_PROVIDER=dev`, so the demo needs no model key and costs
nothing to run. To use a real model, add its key as a secret and set
`LLM_PROVIDER` in that config.

For a local run of the same demo: `pnpm cf:dev:demo`.
