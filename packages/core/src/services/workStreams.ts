/**
 * Work streams — a rebuildable presentation projection over Commitments.
 *
 * A stream never owns data: it is derived from `commitment_classifications`
 * (AI, user override, or fallback) and can be rebuilt from scratch at any time
 * without touching the commitments themselves. See ADR-0002.
 */

import type { SqlDatabase } from "../db/port.js";
import {
  listCommitments,
  type CommitmentListRow,
} from "./commitments.js";

export type WorkStream = {
  key: string;
  label: string;
  /** Where the grouping came from: the model, the user, or project fallback. */
  source: "ai" | "user" | "fallback";
  reason: string | null;
  manual_override: boolean;
  /** Commitments in this stream, ordered by urgency. */
  commitments: CommitmentListRow[];
  total: number;
  open_count: number;
  risk_count: number;
};

export type WorkStreamsResult = {
  groups: WorkStream[];
  /** Commitments with no stream at all (should be rare; usually fallback covers them). */
  unassigned: CommitmentListRow[];
  total: number;
};

export type WorkStreamsOptions = {
  /** Only include commitments with this status. */
  status?: string;
  /**
   * How many commitments to surface per stream. The rest are still counted in
   * `total` — mirrors the "3 visible, N more" rule from the product spec.
   */
  limitPerGroup?: number;
  /** Include completed/cancelled work (default false). */
  includeClosed?: boolean;
};

const CLOSED = new Set(["completed", "cancelled"]);

/** Risk, then started, then nearest deadline/window — the display order from the spec. */
function urgencyRank(row: CommitmentListRow): number {
  if (row.status === "risk") return 0;
  if (typeof row.started_at === "string" && row.started_at) return 1;
  return 2;
}

function sortKey(row: CommitmentListRow): number {
  const deadlines = [
    row.deadline,
    row.window_end,
    row.window_start,
    row.ai_slot_start,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  if (deadlines.length === 0) return Number.POSITIVE_INFINITY;
  const times = deadlines
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return times.length ? Math.min(...times) : Number.POSITIVE_INFINITY;
}

function compareCommitments(a: CommitmentListRow, b: CommitmentListRow): number {
  const byUrgency = urgencyRank(a) - urgencyRank(b);
  if (byUrgency !== 0) return byUrgency;
  const byTime = sortKey(a) - sortKey(b);
  if (byTime !== 0) return byTime;
  return String(b.created_at).localeCompare(String(a.created_at));
}

function compareStreams(a: WorkStream, b: WorkStream): number {
  if (a.risk_count !== b.risk_count) return b.risk_count - a.risk_count;
  const aTime = a.commitments.length ? sortKey(a.commitments[0]!) : Number.POSITIVE_INFINITY;
  const bTime = b.commitments.length ? sortKey(b.commitments[0]!) : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  if (a.open_count !== b.open_count) return b.open_count - a.open_count;
  return a.label.localeCompare(b.label);
}

/**
 * Group the user's commitments into work streams.
 *
 * Grouping is never authoritative: `POST /v1/commitment-classifications/rebuild`
 * recomputes it, and a user override on a single commitment always wins.
 */
export async function listWorkStreams(
  db: SqlDatabase,
  userId: string,
  options: WorkStreamsOptions = {}
): Promise<WorkStreamsResult> {
  const limitPerGroup = Math.max(1, options.limitPerGroup ?? 3);
  const rows = await listCommitments(db, userId, options.status);

  const visible = options.includeClosed
    ? rows
    : rows.filter((row) => !CLOSED.has(row.status));

  const buckets = new Map<string, WorkStream>();

  for (const row of visible) {
    const key = row.work_group_key || "unassigned";
    if (key === "unassigned") continue;
    let group = buckets.get(key);
    if (!group) {
      group = {
        key,
        label: row.work_group_label || "Ungrouped",
        source: row.work_group_source ?? "fallback",
        reason: row.work_group_reason ?? null,
        manual_override: Boolean(row.work_group_manual_override),
        commitments: [],
        total: 0,
        open_count: 0,
        risk_count: 0,
      };
      buckets.set(key, group);
    }
    group.commitments.push(row);
    group.total += 1;
    if (!CLOSED.has(row.status)) group.open_count += 1;
    if (row.status === "risk") group.risk_count += 1;
    // A manual override anywhere in the stream is worth surfacing.
    if (row.work_group_manual_override) group.manual_override = true;
  }

  const groups = [...buckets.values()];
  for (const group of groups) {
    group.commitments.sort(compareCommitments);
    // `total` stays the full count; the array is trimmed for display.
    group.commitments = group.commitments.slice(0, limitPerGroup);
  }
  groups.sort(compareStreams);

  const unassigned = visible
    .filter((row) => !row.work_group_key || row.work_group_key === "unassigned")
    .sort(compareCommitments);

  return { groups, unassigned, total: visible.length };
}
