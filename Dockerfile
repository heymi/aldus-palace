# Self-host Aldus Palace.
#
#   docker compose up --build
#   curl localhost:8787/health
#
# Runtime: Node + the reference server, with SQLite in a named volume.
FROM node:22-bookworm-slim

# better-sqlite3 ships prebuilds for common platforms; keep the toolchain for
# the ones it does not.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy the workspace and install everything (the server runs TypeScript through
# tsx, which is a dev dependency).
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm build \
    && pnpm store prune

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATABASE_PATH=/data/aldus.db \
    LLM_PROVIDER=dev

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
