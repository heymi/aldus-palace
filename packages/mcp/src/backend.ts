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
  rejectMemory as rejectMemoryRow,
  listActionProposals,
  listMemoriesByState,
  listWorkStreams,
  localeOf,
  newId,
  nowIso,
  processRawInput,
  resolveProviderConfig,
  writeActionLog,
  confirmMemory as confirmMemoryCandidate,
  decideAction as decideActionProposal,
  revokeAction as revokeActionProposal,
  type ActionStatus,
  type Locale,
  type MemoryListState,
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

export type ConfirmMemoryArgs = {
  conceptNames?: string[];
  /** Id of a confirmed memory this one replaces (memory evolution). */
  supersedes?: string;
  reason?: string;
};

export interface Backend {
  /** Human-readable description used in tool output/errors. */
  readonly description: string;
  /** Locale for the human-readable tool cards. */
  readonly locale: Locale;
  capture(content: string, mode: CaptureMode): Promise<CaptureOutcome>;
  listToday(): Promise<unknown>;
  listCommitments(status?: string): Promise<unknown>;
  listWorkStreams(options?: { limitPerGroup?: number }): Promise<unknown>;
  listMemories(state: MemoryListState): Promise<unknown>;
  confirmMemory(memoryId: string, args?: ConfirmMemoryArgs): Promise<unknown>;
  /** Archive a memory the user does not want kept. */
  rejectMemory(memoryId: string): Promise<unknown>;
  /** The Action Gate queue. */
  listActions(status?: ActionStatus | "all"): Promise<unknown>;
  decideAction(
    proposalId: string,
    decision: "approve" | "reject",
    reason?: string
  ): Promise<unknown>;
  revokeAction(proposalId: string, reason?: string): Promise<unknown>;
  /** Release any resources the backend owns (a no-op for HTTP). */
  close(): void;
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
  readonly locale: Locale;
  private constructor(
    private readonly db: SqlDatabase,
    private readonly user: User,
    private readonly llm: ReturnType<typeof createLLMProvider>,
    databasePath: string
  ) {
    this.description = `local SQLite (${databasePath})`;
    this.locale = localeOf(user.language);
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

  async listWorkStreams(options?: { limitPerGroup?: number }): Promise<unknown> {
    return listWorkStreams(this.db, this.user.id, {
      limitPerGroup: options?.limitPerGroup ?? 3,
    });
  }

  async listMemories(state: MemoryListState): Promise<unknown> {
    return listMemoriesByState(this.db, this.user.id, state, 100);
  }

  async confirmMemory(memoryId: string, args: ConfirmMemoryArgs = {}): Promise<unknown> {
    const result = await confirmMemoryCandidate(
      this.db,
      this.user.id,
      memoryId,
      args.conceptNames,
      { supersedes: args.supersedes, reason: args.reason }
    );
    if (!result.ok) throw new Error(`memory ${memoryId}: ${result.error}`);
    return {
      memory: result.memory,
      ...(result.superseded ? { superseded: result.superseded } : {}),
      ...(result.supersede_error ? { supersede_error: result.supersede_error } : {}),
    };
  }

  async rejectMemory(memoryId: string): Promise<unknown> {
    const result = await rejectMemoryRow(this.db, this.user.id, memoryId);
    if (!result.ok) throw new Error(`memory ${memoryId}: not found or not active`);
    return { archived: memoryId, previous_status: result.previous_status };
  }

  async listActions(status?: ActionStatus | "all"): Promise<unknown> {
    return await listActionProposals(this.db, this.user.id, status ?? "all");
  }

  async decideAction(
    proposalId: string,
    decision: "approve" | "reject",
    reason?: string
  ): Promise<unknown> {
    const result = await decideActionProposal(this.db, this.user.id, proposalId, decision, {
      reason,
      locale: this.locale,
    });
    if (!result.ok) throw new Error(`action ${proposalId}: ${result.error}`);
    return { proposal: result.proposal };
  }

  async revokeAction(proposalId: string, reason?: string): Promise<unknown> {
    const result = await revokeActionProposal(this.db, this.user.id, proposalId, {
      reason,
      locale: this.locale,
    });
    if (!result.ok) throw new Error(`action ${proposalId}: ${result.error}`);
    return { proposal: result.proposal };
  }

  close(): void {
    (this.db as unknown as { close?: () => void }).close?.();
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
  readonly locale: Locale = "en";
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

  async listWorkStreams(options?: { limitPerGroup?: number }): Promise<unknown> {
    const query = options?.limitPerGroup ? `?limit=${options.limitPerGroup}` : "";
    return this.request(`/v1/work-streams${query}`);
  }

  async listMemories(state: MemoryListState): Promise<unknown> {
    return this.request(`/v1/memories?state=${state}`);
  }

  async rejectMemory(memoryId: string): Promise<unknown> {
    return this.request(`/v1/memories/${encodeURIComponent(memoryId)}/reject`, {
      method: "POST",
      body: {},
    });
  }

  close(): void {
    // HTTP backends own no local resources.
  }

  async confirmMemory(memoryId: string, args: ConfirmMemoryArgs = {}): Promise<unknown> {
    const body: Record<string, unknown> = {};
    if (args.conceptNames?.length) body.concept_names = args.conceptNames;
    if (args.supersedes) body.supersedes = args.supersedes;
    if (args.reason) body.reason = args.reason;
    return this.request(`/v1/memories/${encodeURIComponent(memoryId)}/confirm`, {
      method: "POST",
      body,
    });
  }

  async listActions(status?: ActionStatus | "all"): Promise<unknown> {
    const query = status && status !== "all" ? `?status=${status}` : "";
    return this.request(`/v1/actions${query}`);
  }

  async decideAction(
    proposalId: string,
    decision: "approve" | "reject",
    reason?: string
  ): Promise<unknown> {
    return this.request(`/v1/actions/${encodeURIComponent(proposalId)}/decide`, {
      method: "POST",
      body: { decision, reason },
    });
  }

  async revokeAction(proposalId: string, reason?: string): Promise<unknown> {
    return this.request(`/v1/actions/${encodeURIComponent(proposalId)}/revoke`, {
      method: "POST",
      body: { reason },
    });
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
