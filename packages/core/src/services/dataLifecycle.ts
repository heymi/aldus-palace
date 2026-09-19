/**
 * Data lifecycle and true deletion.
 *
 * Deleting is real: every row the user owns goes, in foreign-key order, in one
 * transaction. The purge record is written first and goes with the data; a
 * caller that needs to keep proof should record it outside this database.
 */

import type { SqlDatabase } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import type { Locale } from "../lib/locale.js";
import { writeActionLog } from "../repos/actionLogs.js";

/**
 * Children first, so foreign keys stay satisfied while rows disappear. The
 * join table without a user column is reached through the memories it links.
 */
export const PURGE_TABLES: Array<{ table: string; where: string }> = [
  // FTS5 virtual tables have no foreign key and no user column: reach the search
  // index through the memories it was built from, before those rows go.
  { table: "memory_search", where: "memory_id IN (SELECT id FROM memories WHERE user_id = ?)" },
  { table: "memory_concepts", where: "memory_id IN (SELECT id FROM memories WHERE user_id = ?)" },
  { table: "concept_links", where: "user_id = ?" },
  { table: "commitment_classifications", where: "user_id = ?" },
  { table: "commitment_classification_runs", where: "user_id = ?" },
  { table: "today_assignments", where: "user_id = ?" },
  { table: "commitment_dependencies", where: "user_id = ?" },
  { table: "planning_feedback_episodes", where: "user_id = ?" },
  { table: "planning_day_states", where: "user_id = ?" },
  { table: "planning_profiles", where: "user_id = ?" },
  { table: "clarifications", where: "user_id = ?" },
  { table: "action_logs", where: "user_id = ?" },
  { table: "action_proposals", where: "user_id = ?" },
  { table: "autonomy_settings", where: "user_id = ?" },
  { table: "permission_grants", where: "user_id = ?" },
  { table: "memories", where: "user_id = ?" },
  { table: "concepts", where: "user_id = ?" },
  { table: "events", where: "user_id = ?" },
  { table: "decisions", where: "user_id = ?" },
  { table: "thoughts", where: "user_id = ?" },
  { table: "commitments", where: "user_id = ?" },
  { table: "projects", where: "user_id = ?" },
  { table: "raw_inputs", where: "user_id = ?" },
  { table: "users", where: "id = ?" },
];

export type PurgeResult = {
  purged: Record<string, number>;
  total: number;
};

/**
 * Delete every row the user owns. Requires an explicit `confirm: true`, because
 * there is no undo.
 */
export async function purgeUserData(
  db: SqlDatabase,
  userId: string,
  options: { confirm: boolean; locale?: Locale }
): Promise<{ ok: true; result: PurgeResult } | { ok: false; error: string }> {
  if (options.confirm !== true) return { ok: false, error: "confirmation_required" };

  const run = db.transaction(async () => {
    // The record of the purge is written before the logs are removed, so the
    // deletion is complete rather than leaving a trace behind.
    await writeActionLog(db, {
      user_id: userId,
      actor: "user",
      action_type: "user_data_purged",
      summary: actionSummary("user_data_purged", undefined, options.locale ?? "en"),
    });

    const purged: Record<string, number> = {};
    let total = 0;
    for (const { table, where } of PURGE_TABLES) {
      const result = await db
        .prepare(`DELETE FROM ${table} WHERE ${where}`)
        .run(userId);
      const changes = Number(result.changes ?? 0);
      if (changes > 0) purged[table] = changes;
      total += changes;
    }
    return { purged, total };
  });

  return { ok: true, result: await run() };
}
