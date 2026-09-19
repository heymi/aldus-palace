#!/usr/bin/env node
/**
 * Aldus Palace MCP server (stdio).
 *
 * Configuration (environment):
 *   ALDUS_PALACE_PROFILE     tool set: full | capture | today | workstreams | memory | actions
 *   ALDUS_PALACE_API_URL     talk to a running server instead of the local DB
 *   ALDUS_PALACE_API_TOKEN   bearer token for the server (DEV_AUTH_TOKEN)
 *   ALDUS_PALACE_DB          SQLite path when running locally
 *                            (default ~/.aldus-palace/aldus.db)
 *   ALDUS_PALACE_USER_NAME / _TIMEZONE / _LANGUAGE
 *   LLM_PROVIDER + provider keys (see the core README); omit for offline rules
 *
 * Focused bins (same code, different default profile):
 *   aldus-palace-mcp-capture · aldus-palace-mcp-today
 *   aldus-palace-mcp-memory  · aldus-palace-mcp-workstreams
 *   aldus-palace-mcp-actions
 *
 * Note: SQLite allows a single writer. If you run more than one server against
 * the same file, point the extra ones at ALDUS_PALACE_API_URL instead — or use
 * profiles, which run everything in one process.
 */

import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBackend } from "./backend.js";
import { isProfile, registerPrompts, registerTools, type Profile } from "./tools.js";

export { createBackend } from "./backend.js";
export type { Backend, BackendConfig, CaptureMode, ConfirmMemoryArgs } from "./backend.js";
export {
  registerTools,
  registerPrompts,
  PROFILES,
  isProfile,
  type Profile,
} from "./tools.js";

const BIN_PROFILES: Record<string, Profile> = {
  "aldus-palace-mcp": "full",
  "aldus-palace-mcp-capture": "capture",
  "aldus-palace-mcp-today": "today",
  "aldus-palace-mcp-workstreams": "workstreams",
  "aldus-palace-mcp-memory": "memory",
  "aldus-palace-mcp-actions": "actions",
};

/** Explicit env wins; otherwise the bin name decides; otherwise everything. */
export function resolveProfile(
  env: Record<string, string | undefined> = process.env,
  argv: NodeJS.Process["argv"] = process.argv
): Profile {
  const configured = env.ALDUS_PALACE_PROFILE?.trim().toLowerCase();
  if (configured && isProfile(configured)) return configured;
  const bin = path.basename(argv[1] ?? "");
  return BIN_PROFILES[bin] ?? "full";
}

async function main(): Promise<void> {
  const profile = resolveProfile();
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
    version: "0.4.0",
  });
  registerTools(server, backend, profile);
  registerPrompts(server);

  await server.connect(new StdioServerTransport());
  console.error(
    `[aldus-palace-mcp] connected — profile: ${profile} — backend: ${backend.description}`
  );
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
