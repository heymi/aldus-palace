/**
 * Dependency constraints.
 *
 * A commitment can wait on another: the planner never schedules a commitment
 * while a blocker is open. A completed or cancelled blocker stops blocking, and
 * cycles are rejected before they reach the table.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import type { Locale } from "../lib/locale.js";
import { writeActionLog } from "../repos/actionLogs.js";

export type DependencyResult =
  | { ok: true; blocked_by: string[] }
  | { ok: false; error: string };

async function commitmentExists(
  db: SqlDatabase,
  userId: string,
  commitmentId: string
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM commitments WHERE id = ? AND user_id = ?`)
    .get(commitmentId, userId);
  return Boolean(row);
}

/** Every blocker recorded for a commitment, open or not. */
export async function listDependencies(
  db: SqlDatabase,
  userId: string,
  commitmentId: string
): Promise<string[]> {
  const rows = (await db
    .prepare(
      `SELECT blocked_by_id FROM commitment_dependencies
       WHERE user_id = ? AND commitment_id = ? ORDER BY created_at ASC`
    )
    .all(userId, commitmentId)) as Array<{ blocked_by_id: string }>;
  return rows.map((row) => row.blocked_by_id);
}

/**
 * Commitments the planner must skip: those with at least one blocker that is
 * not completed or cancelled.
 */
export async function blockedCommitmentIds(
  db: SqlDatabase,
  userId: string
): Promise<Set<string>> {
  const rows = (await db
    .prepare(
      `SELECT DISTINCT d.commitment_id AS id
       FROM commitment_dependencies d
       INNER JOIN commitments b ON b.id = d.blocked_by_id
       WHERE d.user_id = ?
         AND b.status NOT IN ('completed', 'cancelled')`
    )
    .all(userId)) as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

/** Would adding `commitmentId` blocked by `blockedById` close a cycle? */
async function wouldCycle(
  db: SqlDatabase,
  userId: string,
  commitmentId: string,
  blockedById: string
): Promise<boolean> {
  const rows = (await db
    .prepare(
      `SELECT commitment_id, blocked_by_id FROM commitment_dependencies
       WHERE user_id = ?`
    )
    .all(userId)) as Array<{ commitment_id: string; blocked_by_id: string }>;

  const edges = new Map<string, string[]>();
  for (const row of rows) {
    const list = edges.get(row.commitment_id) ?? [];
    list.push(row.blocked_by_id);
    edges.set(row.commitment_id, list);
  }
  edges.set(commitmentId, [...(edges.get(commitmentId) ?? []), blockedById]);

  // Walk from the new blocker; reaching the commitment means a cycle.
  const seen = new Set<string>();
  const stack = [blockedById];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === commitmentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) ?? []) stack.push(next);
  }
  return false;
}

export async function addDependency(
  db: SqlDatabase,
  userId: string,
  commitmentId: string,
  blockedById: string,
  options: { locale?: Locale } = {}
): Promise<DependencyResult> {
  if (commitmentId === blockedById) return { ok: false, error: "self_dependency" };
  if (!(await commitmentExists(db, userId, commitmentId))) {
    return { ok: false, error: "not_found" };
  }
  if (!(await commitmentExists(db, userId, blockedById))) {
    return { ok: false, error: "blocker_not_found" };
  }
  if (await wouldCycle(db, userId, commitmentId, blockedById)) {
    return { ok: false, error: "cycle_detected" };
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO commitment_dependencies
       (commitment_id, blocked_by_id, user_id, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(commitmentId, blockedById, userId, nowIso());

  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "dependency_added",
    summary: actionSummary(
      "dependency_added",
      { blocked_by: blockedById },
      options.locale ?? "en"
    ),
    entity_type: "commitment",
    entity_id: commitmentId,
    payload: { blocked_by_id: blockedById },
    reversible: true,
  });

  return { ok: true, blocked_by: await listDependencies(db, userId, commitmentId) };
}

export async function removeDependency(
  db: SqlDatabase,
  userId: string,
  commitmentId: string,
  blockedById: string,
  options: { locale?: Locale } = {}
): Promise<DependencyResult> {
  const result = await db
    .prepare(
      `DELETE FROM commitment_dependencies
       WHERE user_id = ? AND commitment_id = ? AND blocked_by_id = ?`
    )
    .run(userId, commitmentId, blockedById);
  if (result.changes === 0) return { ok: false, error: "not_found" };

  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "dependency_removed",
    summary: actionSummary(
      "dependency_removed",
      { blocked_by: blockedById },
      options.locale ?? "en"
    ),
    entity_type: "commitment",
    entity_id: commitmentId,
    payload: { blocked_by_id: blockedById },
    reversible: true,
  });

  return { ok: true, blocked_by: await listDependencies(db, userId, commitmentId) };
}
