/**
 * Typed HTTP client for the Aldus Palace server.
 *
 * One method per route, no runtime dependencies, and a fetch you can replace in
 * tests. `createClient({ baseUrl, token })` is all it takes.
 */

export type ClientOptions = {
  baseUrl: string;
  token: string;
  /** Replaceable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
};

export type CaptureMode = "progressive" | "local" | "sync";
export type MemoryListState = "candidate" | "active" | "superseded" | "archived" | "all";
export type ActionStatus =
  | "approved"
  | "notified"
  | "proposed"
  | "pending_second"
  | "rejected"
  | "revoked"
  | "all";
export type DataLevel = 0 | 1 | 2 | 3 | 4;

export type ActionCard = {
  summary: string;
  thoughts: Array<Record<string, unknown>>;
  commitments: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  memory_candidates: Array<Record<string, unknown>>;
  clarifications: Array<Record<string, unknown>>;
  warnings: string[];
};

export type CaptureOutcome = {
  id: string;
  processing_status: string;
  stage: string;
  action_card: ActionCard;
};

export type Today = {
  date_key: string;
  timezone: string;
  now: Record<string, unknown> | null;
  timeline: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  unscheduled: Array<Record<string, unknown>>;
  unscheduled_total: number;
  summary: string;
  plan?: { core: string[]; optional: string[]; deferred: string[] };
};

export type ReconcileResult = {
  date_key: string;
  mode: "balanced" | "high_capacity" | "paused";
  effective_cap: number;
  completed_today: number;
  remaining_today: number;
  picked: Array<{ id: string; title: string; reason: string }>;
  tip: string | null;
  auto_fill_paused: boolean;
};

export type MigrationResult = {
  migrated: Array<{ id: string; title: string; deferral_count: number; reason: string }>;
  needs_confirmation: Array<{ id: string; title: string; deferral_count: number; reason: string }>;
};

export type AutonomyState = {
  score: number;
  approvals: number;
  rejections: number;
  samples: number;
  level: number;
  ceiling: number;
  effective_level: number;
};

export type ActionProposal = Record<string, unknown>;
export type Memory = Record<string, unknown>;
export type Commitment = Record<string, unknown>;

export type CloudPayload = {
  allowed: boolean;
  text: string;
  redactions: string[];
  reason: "clean" | "redacted" | "level_4_stays_local";
};

export type PurgeResult = { purged: Record<string, number>; total: number };

export type PermissionState = {
  scopes: string[];
  memory_permission?: "private" | "sync" | "ai_assist";
};

export class AldusApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Aldus Palace request failed (${status})`
    );
    this.name = "AldusApiError";
    this.status = status;
    this.body = body;
  }
}

export class AldusClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    if (!response.ok) throw new AldusApiError(response.status, parsed);
    return parsed as T;
  }

  // --- account and permissions ---------------------------------------------

  me(): Promise<{ user: Record<string, unknown> }> {
    return this.request("/v1/me");
  }

  /** The language the runtime writes in (capture cards, memory wording). */
  updateMe(patch: { language: "en" | "zh-CN" }): Promise<{ user: Record<string, unknown> }> {
    return this.request("/v1/me", { method: "PATCH", body: patch });
  }

  permissions(): Promise<PermissionState> {
    return this.request("/v1/permissions");
  }

  grantScope(scope: string): Promise<{ scopes: string[] }> {
    return this.request("/v1/permissions", { method: "POST", body: { scope } });
  }

  revokeScope(scope: string): Promise<{ scopes: string[] }> {
    return this.request(`/v1/permissions/${encodeURIComponent(scope)}`, {
      method: "DELETE",
    });
  }

  redact(text: string, level: DataLevel, contacts?: string[]): Promise<CloudPayload> {
    return this.request("/v1/privacy/redact", {
      method: "POST",
      body: { text, level, contacts },
    });
  }

  /**
   * True deletion goes through the Action Gate: propose, then approve. The
   * approval runs the purge executor and returns its result.
   */
  async purge(): Promise<PurgeResult> {
    const proposed = await this.request<{ proposal: { id: string } }>(
      "/v1/me/purge",
      { method: "POST", body: { confirm: true } }
    );
    const decide = (id: string) =>
      this.request<{
        proposal: ActionProposal;
        execution?: { ok: boolean; status: string; result?: PurgeResult };
      }>(`/v1/actions/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        body: { decision: "approve" },
      });
    // Permanent deletion is critical: the first approval asks again.
    const first = await decide(proposed.proposal.id);
    const decided =
      first.proposal?.status === "pending_second"
        ? await decide(proposed.proposal.id)
        : first;
    const result = decided.execution?.result;
    if (!result) throw new Error("purge_did_not_execute");
    return result;
  }

  // --- capture and understanding -------------------------------------------

  capture(content: string, mode: CaptureMode = "progressive"): Promise<CaptureOutcome> {
    return this.request("/v1/inputs", { method: "POST", body: { content, mode, process: true } });
  }

  input(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/inputs/${encodeURIComponent(id)}`);
  }

  enrich(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/inputs/${encodeURIComponent(id)}/enrich`, { method: "POST" });
  }

  processInput(id: string): Promise<CaptureOutcome> {
    return this.request(`/v1/inputs/${encodeURIComponent(id)}/process`, { method: "POST" });
  }

  /** Correct what an input became; the choice is learned for similar inputs. */
  reclassifyInput(
    id: string,
    mode: "bug" | "task" | "note"
  ): Promise<{ ok: boolean; choice: string; commitment: Record<string, unknown> | null }> {
    return this.request(`/v1/inputs/${encodeURIComponent(id)}/reclassify`, {
      method: "POST",
      body: { mode },
    });
  }

  // --- thoughts ---------------------------------------------------------------

  thoughts(): Promise<Record<string, unknown>> {
    return this.request("/v1/thoughts");
  }

  thought(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/thoughts/${encodeURIComponent(id)}`);
  }

  updateThought(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`/v1/thoughts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    });
  }

  deleteThought(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/thoughts/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  convertThought(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/thoughts/${encodeURIComponent(id)}/convert-to-commitment`, {
      method: "POST",
    });
  }

  rewriteThoughtSummaries(): Promise<Record<string, unknown>> {
    return this.request("/v1/thoughts/rewrite-summaries", { method: "POST" });
  }

  // --- commitments ------------------------------------------------------------

  updateCommitment(
    id: string,
    patch: Record<string, unknown>
  ): Promise<{ commitment: Commitment }> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    });
  }

  deleteCommitment(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  rewriteCommitmentTitles(): Promise<Record<string, unknown>> {
    return this.request("/v1/commitments/rewrite-titles", { method: "POST" });
  }

  dedupeCommitments(): Promise<Record<string, unknown>> {
    return this.request("/v1/commitments/dedupe", { method: "POST" });
  }

  rebuildClassifications(): Promise<Record<string, unknown>> {
    return this.request("/v1/commitment-classifications/rebuild", { method: "POST" });
  }

  moveClassification(id: string, groupKey: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/classification`, {
      method: "PATCH",
      body: { group_key: groupKey },
    });
  }

  // --- projects and concepts --------------------------------------------------

  projects(): Promise<Record<string, unknown>> {
    return this.request("/v1/projects");
  }

  project(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/projects/${encodeURIComponent(id)}`);
  }

  createProject(input: { name: string; description?: string }): Promise<Record<string, unknown>> {
    return this.request("/v1/projects", { method: "POST", body: input });
  }

  updateProject(
    id: string,
    patch: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request(`/v1/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    });
  }

  deleteProject(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  relinkProject(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/projects/${encodeURIComponent(id)}/relink`, { method: "POST" });
  }

  concepts(): Promise<Record<string, unknown>> {
    return this.request("/v1/concepts");
  }

  concept(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/concepts/${encodeURIComponent(id)}`);
  }

  createConcept(name: string, description?: string): Promise<Record<string, unknown>> {
    return this.request("/v1/concepts", { method: "POST", body: { name, description } });
  }

  // --- clarifications ---------------------------------------------------------

  clarifications(): Promise<Record<string, unknown>> {
    return this.request("/v1/clarifications");
  }

  resolveClarification(
    id: string,
    input: { option_id?: string; label?: string }
  ): Promise<Record<string, unknown>> {
    return this.request(`/v1/clarifications/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: input,
    });
  }

  // --- planning ---------------------------------------------------------------

  today(): Promise<Today> {
    return this.request("/v1/today");
  }

  planToday(planVersion?: string): Promise<ReconcileResult & { migration: MigrationResult }> {
    return this.request("/v1/plan/today", {
      method: "POST",
      body: planVersion ? { plan_version: planVersion } : {},
    });
  }

  migrate(): Promise<MigrationResult> {
    return this.request("/v1/plan/migrate", { method: "POST" });
  }

  commitments(
    options: { status?: string; limit?: number; cursor?: string } = {}
  ): Promise<{ items: Commitment[]; next_cursor: string | null }> {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.cursor) params.set("cursor", options.cursor);
    const query = params.size ? `?${params.toString()}` : "";
    return this.request(`/v1/commitments${query}`);
  }

  completeCommitment(id: string): Promise<{ commitment: Commitment; replan: unknown }> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/complete`, {
      method: "POST",
    });
  }

  startCommitment(id: string): Promise<{ commitment: Commitment }> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/start`, {
      method: "POST",
    });
  }

  cancelCommitment(id: string): Promise<{ commitment: Commitment }> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    });
  }

  arrangeToday(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/arrange-today`, {
      method: "POST",
    });
  }

  removeFromToday(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/remove-from-today`, {
      method: "POST",
    });
  }

  dependencies(id: string): Promise<{ blocked_by: string[] }> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/dependencies`);
  }

  addDependency(id: string, blockedById: string): Promise<{ blocked_by: string[] }> {
    return this.request(`/v1/commitments/${encodeURIComponent(id)}/dependencies`, {
      method: "POST",
      body: { blocked_by_id: blockedById },
    });
  }

  removeDependency(id: string, blockedById: string): Promise<{ blocked_by: string[] }> {
    return this.request(
      `/v1/commitments/${encodeURIComponent(id)}/dependencies/${encodeURIComponent(blockedById)}`,
      { method: "DELETE" }
    );
  }

  workStreams(options: { limitPerGroup?: number } = {}): Promise<Record<string, unknown>> {
    const query = options.limitPerGroup ? `?limit=${options.limitPerGroup}` : "";
    return this.request(`/v1/work-streams${query}`);
  }

  // --- memory -----------------------------------------------------------------

  memories(state: MemoryListState = "candidate"): Promise<{ items: Memory[] }> {
    return this.request(`/v1/memories?state=${state}`);
  }

  confirmMemory(
    id: string,
    options: { conceptNames?: string[]; supersedes?: string; reason?: string } = {}
  ): Promise<{ memory: Memory }> {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
      body: {
        concept_names: options.conceptNames,
        supersedes: options.supersedes,
        reason: options.reason,
      },
    });
  }

  rejectMemory(id: string): Promise<{ success: boolean }> {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/reject`, {
      method: "POST",
    });
  }

  memoryVersions(id: string): Promise<{ versions: Memory[] }> {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/versions`);
  }

  updateMemory(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    });
  }

  deleteMemory(id: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  dedupeMemories(): Promise<Record<string, unknown>> {
    return this.request("/v1/memories/dedupe", { method: "POST" });
  }

  // --- the action gate --------------------------------------------------------

  actions(status: ActionStatus = "all"): Promise<{ items: ActionProposal[] }> {
    const query = status === "all" ? "" : `?status=${status}`;
    return this.request(`/v1/actions${query}`);
  }

  decideAction(
    id: string,
    decision: "approve" | "reject",
    reason?: string
  ): Promise<{ proposal: ActionProposal }> {
    return this.request(`/v1/actions/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      body: { decision, reason },
    });
  }

  revokeAction(id: string, reason?: string): Promise<{ proposal: ActionProposal }> {
    return this.request(`/v1/actions/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
      body: { reason },
    });
  }

  autonomy(): Promise<AutonomyState> {
    return this.request("/v1/autonomy");
  }

  setAutonomyCeiling(ceiling: 2 | 3 | 4): Promise<AutonomyState> {
    return this.request("/v1/autonomy", { method: "POST", body: { ceiling } });
  }

  // --- activity ---------------------------------------------------------------

  activity(): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.request("/v1/activity");
  }
}

export function createClient(options: ClientOptions): AldusClient {
  return new AldusClient(options);
}
