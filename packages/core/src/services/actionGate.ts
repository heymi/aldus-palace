/**
 * The Action Gate.
 *
 * An agent action is proposed, risk-graded, and either runs (low, medium) or
 * waits for a decision (high, critical). Every proposal is a row, so the audit
 * trail is readable and a decision is revocable — nothing is deleted.
 *
 * This module does not intercept the existing capture and planning flows; it is
 * the gate those flows can be routed through. `runGatedAction` is the intended
 * entry point: the callback runs only when the risk allows it.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import { newId } from "../lib/id.js";
import type { Locale } from "../lib/locale.js";
import { writeActionLog } from "../repos/actionLogs.js";

export type ActionRisk = "low" | "medium" | "high" | "critical";
export type ActionStatus =
  | "approved"
  | "notified"
  | "proposed"
  | "pending_second"
  | "rejected"
  | "revoked";
export type ActionActor = "user" | "agent";
export type ActionProposalRow = Record<string, unknown>;

/**
 * The published risk table. An action that is not listed is graded `high`, so a
 * new agent capability waits for a decision until it is classified.
 */
const RISK_TABLE: Record<string, { risk: ActionRisk; reason: string }> = {
  // Low: capture and planning already run on their own by product rule.
  capture: { risk: "low", reason: "capture_is_the_product_rule" },
  input_captured: { risk: "low", reason: "capture_is_the_product_rule" },
  thought_created: { risk: "low", reason: "derived_from_capture" },
  commitment_created: { risk: "low", reason: "derived_from_capture" },
  decision_created: { risk: "low", reason: "derived_from_capture" },
  memory_candidate_created: { risk: "low", reason: "candidate_only" },
  memory_activated: { risk: "low", reason: "passed_the_published_gate" },
  ai_slot_assigned: { risk: "low", reason: "suggestion_only" },
  auto_fill_paused: { risk: "low", reason: "protective_pause" },
  auto_fill_resumed: { risk: "low", reason: "resumes_after_three_completions" },
  planning_feedback_observed: { risk: "low", reason: "observation_only" },
  work_classification_rebuilt: { risk: "low", reason: "rebuildable_projection" },
  commitment_titles_rewritten: { risk: "low", reason: "derived_from_capture" },
  // High: the record changes meaning, or disappears.
  memory_superseded: { risk: "high", reason: "replaces_a_belief" },
  memory_archived: { risk: "high", reason: "removes_a_belief_from_use" },
  memory_deleted: { risk: "high", reason: "deletes_a_belief" },
  commitment_deleted: { risk: "high", reason: "deletes_work" },
  thought_deleted: { risk: "high", reason: "deletes_a_record" },
  project_deleted: { risk: "high", reason: "deletes_a_container" },
  // Critical: leaves the device or becomes permanent.
  external_communication: { risk: "critical", reason: "leaves_the_device" },
  payment: { risk: "critical", reason: "moves_money" },
  permanent_memory_write: { risk: "critical", reason: "cannot_be_taken_back" },
};

export function assessActionRisk(actionType: string): {
  risk: ActionRisk;
  reason: string;
} {
  const known = RISK_TABLE[actionType];
  if (known) return known;
  return { risk: "high", reason: "unclassified_action" };
}

export function initialStatus(risk: ActionRisk): ActionStatus {
  if (risk === "low") return "approved";
  if (risk === "medium") return "notified";
  return "proposed";
}

// --------------------------------------------------------------------------
// Trust and autonomy
// --------------------------------------------------------------------------

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export type TrustScore = {
  /** Laplace-smoothed approval rate, 0..1. No history starts at 0.5. */
  score: number;
  approvals: number;
  rejections: number;
  samples: number;
};

export type AutonomyState = TrustScore & {
  /** The level the record has earned. */
  level: AutonomyLevel;
  /** How far the user lets earned trust widen autonomy. Default 2. */
  ceiling: AutonomyLevel;
  /** `min(max(level, baseline), ceiling)` — what the gate applies. */
  effective_level: AutonomyLevel;
};

/** The published rule: low runs, medium runs as a notification. */
export const AUTONOMY_BASELINE: AutonomyLevel = 2;

const AUTONOMY_THRESHOLDS: Array<{ level: AutonomyLevel; minSamples: number; minScore: number }> = [
  { level: 4, minSamples: 20, minScore: 0.95 },
  { level: 3, minSamples: 10, minScore: 0.85 },
  { level: 2, minSamples: 5, minScore: 0.7 },
  { level: 1, minSamples: 3, minScore: 0.5 },
];

/** The trust score from explicit decisions: approvals against rejections. */
export function trustScoreFrom(approvals: number, rejections: number): TrustScore {
  const samples = approvals + rejections;
  return {
    score: (approvals + 1) / (samples + 2),
    approvals,
    rejections,
    samples,
  };
}

/** Level 0 until there is evidence; each level needs more of it. */
export function autonomyLevelFor(score: number, samples: number): AutonomyLevel {
  for (const threshold of AUTONOMY_THRESHOLDS) {
    if (samples >= threshold.minSamples && score >= threshold.minScore) {
      return threshold.level;
    }
  }
  return 0;
}

/** What runs without asking at a given autonomy level. */
export function effectiveStatusFor(risk: ActionRisk, level: AutonomyLevel): ActionStatus {
  const rank: Record<ActionRisk, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const allowed = level === 0 ? -1 : level === 1 ? 0 : level === 2 ? 1 : level === 3 ? 2 : 3;
  if (rank[risk] > allowed) return "proposed";
  if (risk === "medium" || (risk === "critical" && level >= 4)) return "notified";
  return "approved";
}

/**
 * Read the trust score from the proposals the user decided in the window.
 * Automatic (low and medium) runs carry no `decided_at`, so they do not count:
 * trust grows from decisions, not from silence.
 */
export async function computeTrustScore(
  db: SqlDatabase,
  userId: string,
  options: { days?: number; at?: Date } = {}
): Promise<TrustScore> {
  const at = options.at ?? new Date();
  const days = options.days ?? 90;
  const since = new Date(at.getTime() - days * 24 * 3600 * 1000).toISOString();
  const rows = (await db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM action_proposals
       WHERE user_id = ? AND decided_at IS NOT NULL AND decided_at >= ?
       GROUP BY status`
    )
    .all(userId, since)) as Array<{ status: string; count: number }>;

  let approvals = 0;
  let rejections = 0;
  for (const row of rows) {
    if (row.status === "approved") approvals += Number(row.count);
    else if (row.status === "rejected" || row.status === "revoked") {
      rejections += Number(row.count);
    }
  }
  return trustScoreFrom(approvals, rejections);
}

async function getAutonomyCeiling(
  db: SqlDatabase,
  userId: string
): Promise<AutonomyLevel> {
  const row = (await db
    .prepare(`SELECT ceiling FROM autonomy_settings WHERE user_id = ?`)
    .get(userId)) as { ceiling: number } | undefined;
  return (row?.ceiling ?? AUTONOMY_BASELINE) as AutonomyLevel;
}

export async function getAutonomyState(
  db: SqlDatabase,
  userId: string,
  options: { days?: number; at?: Date } = {}
): Promise<AutonomyState> {
  const trust = await computeTrustScore(db, userId, options);
  const level = autonomyLevelFor(trust.score, trust.samples);
  const ceiling = await getAutonomyCeiling(db, userId);
  const effective = Math.min(
    Math.max(level, AUTONOMY_BASELINE),
    ceiling
  ) as AutonomyLevel;
  return { ...trust, level, ceiling, effective_level: effective };
}

/**
 * Set how far earned trust may widen autonomy. The ceiling never goes below the
 * published baseline; raising it is the user's explicit consent.
 */
export async function setAutonomyCeiling(
  db: SqlDatabase,
  userId: string,
  ceiling: number,
  options: { locale?: Locale; at?: Date } = {}
): Promise<{ ok: true; state: AutonomyState } | { ok: false; error: string }> {
  if (ceiling !== 2 && ceiling !== 3 && ceiling !== 4) {
    return { ok: false, error: "ceiling_must_be_2_3_or_4" };
  }
  const t = (options.at ?? new Date()).toISOString();
  await db
    .prepare(
      `INSERT INTO autonomy_settings (user_id, ceiling, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET ceiling = excluded.ceiling, updated_at = excluded.updated_at`
    )
    .run(userId, ceiling, t, t);
  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "autonomy_ceiling_changed",
    summary: actionSummary(
      "autonomy_ceiling_changed",
      { ceiling },
      options.locale ?? "en"
    ),
    reason: `ceiling=${ceiling}`,
    entity_type: "autonomy_settings",
    entity_id: userId,
    payload: { ceiling },
    reversible: true,
  });
  return { ok: true, state: await getAutonomyState(db, userId, { at: options.at }) };
}

async function getProposal(
  db: SqlDatabase,
  userId: string,
  proposalId: string
): Promise<ActionProposalRow | undefined> {
  return (await db
    .prepare(`SELECT * FROM action_proposals WHERE id = ? AND user_id = ?`)
    .get(proposalId, userId)) as ActionProposalRow | undefined;
}

async function log(
  db: SqlDatabase,
  userId: string,
  proposalId: string,
  actionType: string,
  risk: ActionRisk,
  status: ActionStatus,
  reason: string,
  locale?: Locale
): Promise<void> {
  const logType =
    status === "proposed" || status === "pending_second"
      ? "action_proposed"
      : status === "rejected"
        ? "action_rejected"
        : status === "revoked"
          ? "action_revoked"
          : status === "notified"
            ? "action_notified"
            : "action_approved";
  await writeActionLog(db, {
    user_id: userId,
    actor: "agent",
    action_type: logType,
    summary: actionSummary(logType, { action_type: actionType, risk }, locale ?? "en"),
    reason,
    entity_type: "action_proposal",
    entity_id: proposalId,
    payload: { action_type: actionType, risk, status },
    reversible: status !== "pending_second" && status !== "proposed",
  });
}

export type ProposeActionResult = {
  proposal: ActionProposalRow;
  risk: ActionRisk;
  status: ActionStatus;
};

/**
 * Record an action. Low risk runs, medium risk runs and is recorded as a
 * notification, high and critical wait for a decision.
 */
export async function proposeAction(
  db: SqlDatabase,
  userId: string,
  input: {
    action_type: string;
    payload?: Record<string, unknown>;
    actor?: ActionActor;
    reason?: string;
    locale?: Locale;
    /** When provided, this autonomy level decides what runs without asking. */
    autonomyLevel?: AutonomyLevel;
  }
): Promise<ProposeActionResult> {
  const actor = input.actor ?? "agent";
  const { risk, reason } = assessActionRisk(input.action_type);
  // Earned trust widens the gate up to the user's ceiling; the baseline keeps
  // the published rule, so a fresh user behaves exactly as before.
  const level =
    input.autonomyLevel ?? (await getAutonomyState(db, userId)).effective_level;
  const status = effectiveStatusFor(risk, level);
  const id = newId("act");
  const t = nowIso();

  await db
    .prepare(
      `INSERT INTO action_proposals
       (id, user_id, action_type, payload, risk, status, actor, reason,
        decided_by, decided_at, confirmations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?)`
    )
    .run(
      id,
      userId,
      input.action_type,
      JSON.stringify(input.payload ?? {}),
      risk,
      status,
      actor,
      input.reason ?? reason,
      t,
      t
    );

  await log(db, userId, id, input.action_type, risk, status, input.reason ?? reason, input.locale);
  return { proposal: (await getProposal(db, userId, id))!, risk, status };
}

export type DecideActionResult =
  | { ok: true; proposal: ActionProposalRow }
  | { ok: false; error: string };

/**
 * Approve or reject a waiting action. A critical action needs two approvals:
 * the first moves it to `pending_second`, the second approves it.
 */
export async function decideAction(
  db: SqlDatabase,
  userId: string,
  proposalId: string,
  decision: "approve" | "reject",
  options: { reason?: string; actor?: ActionActor; locale?: Locale } = {}
): Promise<DecideActionResult> {
  const row = await getProposal(db, userId, proposalId);
  if (!row) return { ok: false, error: "not_found" };

  const status = String(row.status) as ActionStatus;
  if (status !== "proposed" && status !== "pending_second") {
    return { ok: false, error: "not_pending" };
  }

  const risk = String(row.risk) as ActionRisk;
  const actionType = String(row.action_type);
  const actor = options.actor ?? "user";
  let confirmations = Number(row.confirmations ?? 0);
  let next: ActionStatus;

  if (decision === "reject") {
    next = "rejected";
  } else if (risk === "critical" && confirmations < 1) {
    next = "pending_second";
    confirmations = 1;
  } else {
    next = "approved";
    confirmations += 1;
  }

  const t = nowIso();
  await db
    .prepare(
      `UPDATE action_proposals
       SET status = ?, confirmations = ?, decided_by = ?, decided_at = ?,
           reason = COALESCE(?, reason), updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(next, confirmations, actor, t, options.reason ?? null, t, proposalId, userId);

  const reason =
    options.reason ??
    (next === "pending_second" ? "awaiting_second_confirmation" : String(row.reason ?? ""));
  await log(db, userId, proposalId, actionType, risk, next, reason, options.locale);
  return { ok: true, proposal: (await getProposal(db, userId, proposalId))! };
}

/** Revoke a proposal or an approval. Nothing is deleted. */
export async function revokeAction(
  db: SqlDatabase,
  userId: string,
  proposalId: string,
  options: { reason?: string; locale?: Locale } = {}
): Promise<DecideActionResult> {
  const row = await getProposal(db, userId, proposalId);
  if (!row) return { ok: false, error: "not_found" };

  const status = String(row.status) as ActionStatus;
  if (status === "rejected" || status === "revoked") {
    return { ok: false, error: "not_revocable" };
  }

  const t = nowIso();
  await db
    .prepare(
      `UPDATE action_proposals
       SET status = 'revoked', reason = COALESCE(?, reason), updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(options.reason ?? null, t, proposalId, userId);

  await log(
    db,
    userId,
    proposalId,
    String(row.action_type),
    String(row.risk) as ActionRisk,
    "revoked",
    options.reason ?? String(row.reason ?? ""),
    options.locale
  );
  return { ok: true, proposal: (await getProposal(db, userId, proposalId))! };
}

export async function listActionProposals(
  db: SqlDatabase,
  userId: string,
  status?: ActionStatus | "all",
  limit = 100
): Promise<ActionProposalRow[]> {
  if (!status || status === "all") {
    return (await db
      .prepare(
        `SELECT * FROM action_proposals WHERE user_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(userId, limit)) as ActionProposalRow[];
  }
  return (await db
    .prepare(
      `SELECT * FROM action_proposals WHERE user_id = ? AND status = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, status, limit)) as ActionProposalRow[];
}

/**
 * Propose and, when the risk allows, run. The callback never runs for a
 * proposal that waits on a decision.
 */
export async function runGatedAction<T>(
  db: SqlDatabase,
  userId: string,
  action: {
    action_type: string;
    payload?: Record<string, unknown>;
    actor?: ActionActor;
    reason?: string;
    locale?: Locale;
    autonomyLevel?: AutonomyLevel;
  },
  execute: () => Promise<T>
): Promise<ProposeActionResult & { ran: boolean; result?: T }> {
  const proposed = await proposeAction(db, userId, action);
  if (proposed.status === "approved" || proposed.status === "notified") {
    const result = await execute();
    return { ...proposed, ran: true, result };
  }
  return { ...proposed, ran: false };
}
