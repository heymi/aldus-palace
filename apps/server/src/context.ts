import type { LLMProvider, SqlDatabase } from "@aldus-palace/core";

export type ServerUserDefaults = {
  name: string;
  timezone: string;
  language: string;
};

export type ServerConfig = {
  /**
   * Bearer token required on `/v1/*`. Aldus Palace is a single-user,
   * self-hosted service today — see SECURITY.md before exposing it.
   */
  devAuthToken: string;
  user: ServerUserDefaults;
  /** Reported by `GET /health`; defaults to the process environment. */
  runtime?: string;
};

export type AppDeps = {
  db: SqlDatabase;
  llm: LLMProvider;
  config: ServerConfig;
};
