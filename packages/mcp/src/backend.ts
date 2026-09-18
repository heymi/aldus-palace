/**
 * Backends for the MCP server.
 *
 * Two transports, one tool surface:
 *  - `local`  — opens the SQLite file directly (no server process required)
 *  - `http`   — talks to a running Aldus Palace server (`ALDUS_PALACE_API_URL`)
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildToday,
  createLLMProvider,
  ensureDevUser,
  listCommitments,
  listMemoriesByStatus,
  newId,
  nowIso,
  processRawInput,
  resolveProviderConfig,
  writeActionLog,
  confirmMemory as confirmMemoryCandidate,
  type SqlDatabase,
  type User,
} from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

export type CaptureMode = "progressive" | "local" | "sync";

export type CaptureOutcome = {
  id: string;
  processing_status: string;
  stage: string;
  action_card: unknown;
};

export interface Backend {
  /** Human-readable description used in tool output/errors. */
  readonly description: string;
  capture(content: string, mode: CaptureMode): Promise<CaptureOutcome>;
  listToday(): Promise<unknown>;
  listCommitments(status?: string): Promise<unknown>;
  listMemories(status: "candidate" | "active"): Promise<unknown>;
  confirmMemory(memoryId: string, conceptNames?: string[]): Promise<unknown>;
}

// --------------------------------------------------------------------------
// local
// --------------------------------------------------------------------------

export type LocalBackendOptions = {
  databasePath: string;
  user: { name: string; timezone: string; language: string };
  provider?: Record<string, string | undefined>;
};

export class LocalBackend implements Backend {
  readonly description: string;
  private constructor(
    private readonly db: SqlDatabase,
    private readonly user: User,
    private readonly llm: ReturnType<typeof createLLMProvider>,
    databasePath: string
  ) {
    this.description = `local SQLite (${databasePath})`;
  }

  static async open(options: LocalBackendOptions): Promise<LocalBackend> {
    if (options.databasePath !== ":memory:") {
      fs.mkdirSync(path.dirname(options.databasePath), { recursive: true });
    }
    const db = await openSqliteDatabase(options.databasePath);
    const user = await ensureDevUser(db, options.user);
    const llm = createLLMProvider(
      resolveProviderConfig(options.provider ?? process.env)
    );
    return new LocalBackend(db, user, llm, options.databasePath);
  }

  async capture(content: string, mode: CaptureMode): Promise<CaptureOutcome> {
    const id = newId("inp");
    const t = nowIso();

    await this.db
      .prepare(
        `INSERT INTO raw_inputs
         (id, user_id, content, source, client_context, processing_status, created_at, updated_at)
         VALUES (?, ?, ?, 'shortcut', ?, 'pending', ?, ?)`
      )
      .run(
        id,
        this.user.id,
        content,
        JSON.stringify({ kind: "mcp" }),
        t,
        t
      );

    await writeActionLog(this.db, {
      user_id: this.user.id,
      actor: "user",
      action_type: "input_captured",
      summary: "captured via MCP",
      entity_type: "raw_input",
      entity_id: id,
      payload: { via: "mcp", mode },
    });

    const pass = mode === "sync" ? "full" : "local";
    const action_card = await processRawInput(
      this.db,
      this.llm,
      this.user,
      id,
      pass
    );

    return {
      id,
      processing_status: mode === "sync" ? "processed" : "local",
      stage: mode === "sync" ? "enriched" : "local",
      action_card,
    };
  }

  async listToday(): Promise<unknown> {
    return buildToday(this.db, this.user.id, this.user.timezone, new Date());
  }

  async listCommitments(status?: string): Promise<unknown> {
    return listCommitments(this.db, this.user.id, status);
  }

  async listMemories(status: "candidate" | "active"): Promise<unknown> {
    return listMemoriesByStatus(this.db, this.user.id, status);
  }

  async confirmMemory(memoryId: string, conceptNames?: string[]): Promise<unknown> {
    const result = await confirmMemoryCandidate(
      this.db,
      this.user.id,
      memoryId,
      conceptNames
    );
    if (!result.ok) throw new Error(`memory ${memoryId}: ${result.error}`);
    return result.memory;
  }
}

// --------------------------------------------------------------------------
// http
// --------------------------------------------------------------------------

export type HttpBackendOptions = {
  baseUrl: string;
  token: string;
};

export class HttpBackend implements Backend {
  readonly description: string;
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: HttpBackendOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.description = `HTTP (${this.baseUrl})`;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      throw new Error(
        `${this.baseUrl}${path} failed (${res.status}): ${text.slice(0, 300)}`
      );
    }
    return parsed as T;
  }

  async capture(content: string, mode: CaptureMode): Promise<CaptureOutcome> {
    return this.request<CaptureOutcome>("/v1/inputs", {
      method: "POST",
      body: { content, mode, process: true },
    });
  }

  async listToday(): Promise<unknown> {
    return this.request("/v1/today");
  }

  async listCommitments(status?: string): Promise<unknown> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request(`/v1/commitments${query}`);
  }

  async listMemories(status: "candidate" | "active"): Promise<unknown> {
    return this.request(`/v1/memories?status=${status}`);
  }

  async confirmMemory(memoryId: string, conceptNames?: string[]): Promise<unknown> {
    const result = await this.request<{ memory: unknown }>(
      `/v1/memories/${encodeURIComponent(memoryId)}/confirm`,
      { method: "POST", body: conceptNames ? { concept_names: conceptNames } : {} }
    );
    return result.memory;
  }
}

export type BackendConfig = {
  baseUrl?: string;
  token?: string;
  databasePath?: string;
  user: { name: string; timezone: string; language: string };
  provider?: Record<string, string | undefined>;
};

/** HTTP when a base URL is configured, otherwise local SQLite. */
export async function createBackend(config: BackendConfig): Promise<Backend> {
  if (config.baseUrl) {
    return new HttpBackend({
      baseUrl: config.baseUrl,
      token: config.token ?? "",
    });
  }
  return LocalBackend.open({
    databasePath: config.databasePath ?? "./data/aldus.db",
    user: config.user,
    provider: config.provider,
  });
}
