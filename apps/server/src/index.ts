import "dotenv/config";
import { serve } from "@hono/node-server";
import {
  createLLMProvider,
  resolveProviderConfig,
} from "@aldus-palace/core/providers";
import { createApp } from "./app.js";
import { openLocalDb } from "./db/local.js";

const db = await openLocalDb();
const llm = createLLMProvider(resolveProviderConfig(process.env));
const app = createApp({
  db,
  llm,
  config: {
    devAuthToken: process.env.DEV_AUTH_TOKEN ?? "",
    user: {
      name: process.env.DEV_USER_NAME ?? "Local User",
      timezone: process.env.DEV_USER_TIMEZONE ?? "Asia/Tokyo",
      language: process.env.DEV_USER_LANGUAGE ?? "en",
    },
    runtime: "local",
  },
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

console.log(`Aldus Palace API listening on http://${host}:${port}`);
console.log(`LLM provider: ${llm.name}`);

serve({ fetch: app.fetch, port, hostname: host });
