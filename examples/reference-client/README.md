# reference-client

A minimal browser client for the HTTP API.

**Online demo:** <https://aldus-palace-demo.iheymi.workers.dev> — each visitor
gets a private context, so what you capture is yours alone.

One page, four sections. Capture is the primary act; Today and Memory are its
two consequences, and decisions wait at the end:

| Section | Route | What it shows |
|---|---|---|
| Capture | `POST /v1/inputs`, `POST /v1/inputs/:id/enrich` | the sentence you wrote, and a receipt of what it became |
| Today | `GET /v1/today` | the one thing to do now, the day's plan, what is at risk |
| Memory | `GET /v1/memories` | what the system remembers, active or candidate; open one to see its source inline (`GET /v1/inputs/:id`) |
| Needs a decision | `GET /v1/actions?status=all`, `POST /v1/actions/:id/decide` | proposed and half-approved actions, with approve / reject |

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

`⌘↵` (or `Ctrl↵`) files the current sentence. Clicking a memory opens the raw
input it came from, in place. The nav counts what is scheduled, remembered and
waiting.

## Language

The page starts in the browser's language (Chinese for `zh-*`, English
otherwise) and switches from the EN / 中文 control in the header; the choice is
kept in `localStorage`. On load and on every switch the client aligns the server
with `PATCH /v1/me`, so the text the runtime writes — capture cards, action
summaries, rule-based memory wording — follows the same language. The deterministic provider follows the input script
on its own, so a Chinese sentence reads back in Chinese even before a switch.

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
