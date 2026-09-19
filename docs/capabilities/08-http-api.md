# 8. HTTP API

> **Your frontend. Our brain.**

**The moment.** You want a web app, a mobile client or a Slack bot. The backend
work is not the endpoints — it is re-implementing the domain logic, the
migrations and the gates you already decided on.

**What you get.** The whole runtime behind a REST surface, with two deployment
targets and one schema:

```
POST   /v1/inputs                        capture (mode: progressive | sync | local)
POST   /v1/inputs/:id/enrich             run the AI pass now
POST   /v1/inputs/:id/process            retry processing
POST   /v1/inputs/:id/reclassify         correct defect | work | note, and learn it
GET    /v1/inputs/:id                    raw input + everything derived from it

GET    /v1/today                         now / next / risks / unscheduled
POST   /v1/plan/today                    plan an empty day
POST   /v1/commitments/:id/arrange-today move work into today
POST   /v1/commitments/:id/complete      complete / start / cancel / remove
GET    /v1/commitments                   list + filter, paginated
GET    /v1/work-streams                  grouped, rebuildable projection

GET    /v1/memories?state=…              candidate | active | superseded | archived
POST   /v1/memories/:id/confirm          { concept_names?, supersedes?, reason? }
POST   /v1/memories/:id/reject
GET    /v1/memories/:id/versions         the whole history of a belief
POST   /v1/memories/dedupe

GET    /v1/thoughts · /v1/concepts · /v1/projects · /v1/activity
GET    /v1/clarifications · POST /v1/clarifications/:id/resolve
GET    /v1/me · PATCH /v1/me (language) · GET /health
```

`GET /health` is public; everything under `/v1` takes a bearer token. Responses
are plain JSON, so any language works — `examples/http-client` is 60 lines of
`fetch`.

**Who this is for.** Teams with a frontend, a non-JavaScript stack, or a desire to
self-host.

## See it in 30 seconds

```bash
cp .env.example .env                     # set DEV_AUTH_TOKEN
docker compose up --build
curl localhost:8787/health
curl -X POST localhost:8787/v1/inputs \
  -H 'Authorization: Bearer dev-local-token' -H 'Content-Type: application/json' \
  -d '{"content":"Ship the onboarding page next week","mode":"sync"}'
```

## Use it as

- **Local** — `docker compose up`, SQLite in a volume, backups are file copies.
- **Edge** — `cd apps/server && pnpm cf:deploy`: the same API on a Cloudflare
  Worker backed by a SQLite Durable Object.
- **In your process** — `createApp({ db, llm, config })` mounts the routes on your
  own Hono server.

→ [Deployment](../DEPLOYMENT.md)

## Proof

- `apps/server/src/routes/` — the route surface
- `apps/server/src/db/{local,durableObject}.ts` — two storage adapters, one port
- `apps/server/src/app.ts` — the factory; no globals, everything injected
- `apps/server/CLOUDFLARE_DEPLOYMENT.md` — edge deployment notes
