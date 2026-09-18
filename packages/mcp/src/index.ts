#!/usr/bin/env node
/**
 * Aldus Palace MCP server (stdio).
 *
 * Configuration (environment):
 *   ALDUS_PALACE_API_URL     talk to a running server instead of the local DB
 *   ALDUS_PALACE_API_TOKEN   bearer token for the server (DEV_AUTH_TOKEN)
 *   ALDUS_PALACE_DB          SQLite path when running locally
 *                            (default ~/.aldus-palace/aldus.db)
 *   ALDUS_PALACE_USER_NAME / _TIMEZONE / _LANGUAGE
 *   LLM_PROVIDER + provider keys (see the core README); omit for offline rules
 */

import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBackend } from "./backend.js";
import { registerTools } from "./tools.js";

export { createBackend } from "./backend.js";
export type { Backend, BackendConfig, CaptureMode } from "./backend.js";
export { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const backend = await createBackend({
    baseUrl: process.env.ALDUS_PALACE_API_URL,
    token: process.env.ALDUS_PALACE_API_TOKEN,
    databasePath:
      process.env.ALDUS_PALACE_DB ??
      path.join(os.homedir(), ".aldus-palace", "aldus.db"),
    user: {
      name: process.env.ALDUS_PALACE_USER_NAME ?? "Local User",
      timezone: process.env.ALDUS_PALACE_USER_TIMEZONE ?? "UTC",
      language: process.env.ALDUS_PALACE_USER_LANGUAGE ?? "en",
    },
  });

  const server = new McpServer({
    name: "aldus-palace",
    version: "0.1.0",
  });
  registerTools(server, backend);

  await server.connect(new StdioServerTransport());
  console.error(`[aldus-palace-mcp] connected — backend: ${backend.description}`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  main().catch((error) => {
    console.error("[aldus-palace-mcp] fatal:", error);
    process.exit(1);
  });
}
