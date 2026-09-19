/**
 * Task migration.
 *
 * Flexible, unstarted work whose suggested slot or availability window slipped
 * moves forward on its own: the slot is cleared so the planner can place it
 * again, and the deferral is counted. A commitment with a deadline never
 * migrates silently — a missed deadline is a risk the user moves. After three
 * deferrals the item surfaces for a decision instead of moving again.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import type { Locale } from "../lib/locale.js";
import { writeActionLog } from "../repos/actionLogs.js";

export const MIGRATION_CONFIRMATION_THRESHOLD = 3;

export type MigratedItem = {
  id: string;
  title: string;
  deferral_count: number;
  reason: string;
};

export type MigrationResult = {
  migrated: MigratedItem[];
  needs_confirmation: MigratedItem[];
};

/**
 * Move slipped, flexible, unstarted work forward and count the deferral.
 * Idempotent: once migrated, the slot is empty, so a second run finds nothing.
 */
export async function migrateStaleWork(
  db: SqlDatabase,
  userId: string,
  options: { at?: Date; locale?: Locale } = {}
): Promise<MigrationResult> {
  const at = options.at ?? new Date();
  const now = at.toISOString();
  const rows = (await db
    .prepare(
      `SELECT * FROM commitments
       WHERE user_id = ? AND status NOT IN ('completed', 'cancelled')
         AND started_at IS NULL AND deadline IS NULL
       ORDER BY created_at ASC`
    )
    .all(userId)) as Array<Record<string, unknown>>;

  const migrated: MigratedItem[] = [];
  const needs: MigratedItem[] = [];

  for (const row of rows) {
    const slotEnd = row.ai_slot_end ? Date.parse(String(row.ai_slot_end)) : Number.NaN;
    const windowEnd = row.window_end ? Date.parse(String(row.window_end)) : Number.NaN;
    const slotSlipped = Number.isFinite(slotEnd) && slotEnd < at.getTime();
    const windowSlipped = Number.isFinite(windowEnd) && windowEnd < at.getTime();
    if (!slotSlipped && !windowSlipped) continue;

    const count = Number(row.deferral_count ?? 0);
    if (count >= MIGRATION_CONFIRMATION_THRESHOLD) {
      needs.push({
        id: String(row.id),
        title: String(row.title),
        deferral_count: count,
        reason: "deferral_limit_reached",
      });
      if (row.migration_surfaced_at == null) {
        await db
          .prepare(
            `UPDATE commitments SET migration_surfaced_at = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          )
          .run(now, now, row.id, userId);
        await writeActionLog(db, {
          user_id: userId,
          actor: "agent",
          action_type: "work_needs_confirmation",
          summary: actionSummary(
            "work_needs_confirmation",
            { title: String(row.title) },
            options.locale ?? "en"
          ),
          reason: "deferral_limit_reached",
          entity_type: "commitment",
          entity_id: String(row.id),
          payload: { deferral_count: count },
        });
      }
      continue;
    }

    const nextCount = count + 1;
    const reason = slotSlipped ? "slot_slipped" : "window_slipped";
    await db
      .prepare(
        `UPDATE commitments
         SET ai_slot_start = NULL, ai_slot_end = NULL,
             status = CASE WHEN status = 'scheduled' THEN 'planned' ELSE status END,
             deferral_count = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
      )
      .run(nextCount, now, row.id, userId);

    migrated.push({
      id: String(row.id),
      title: String(row.title),
      deferral_count: nextCount,
      reason,
    });
  }

  for (const item of migrated) {
    await writeActionLog(db, {
      user_id: userId,
      actor: "agent",
      action_type: "work_migrated",
      summary: actionSummary(
        "work_migrated",
        { title: item.title },
        options.locale ?? "en"
      ),
      reason: item.reason,
      entity_type: "commitment",
      entity_id: item.id,
      payload: { deferral_count: item.deferral_count },
      reversible: true,
    });
  }

  return { migrated, needs_confirmation: needs };
}
