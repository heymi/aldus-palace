import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { writeActionLog } from "../repos/actionLogs.js";
import { actionSummary } from "../lib/actionMessages.js";

export async function resolveClarificationByOption(
  db: SqlDatabase,
  userId: string,
  clarificationId: string,
  optionId: string
): Promise<{
  ok: true;
  clarification_id: string;
  chosen: { id: string; label: string };
  commitment: Record<string, unknown> | null;
}> {
  const row = await db
    .prepare(
      `SELECT * FROM clarifications WHERE id = ? AND user_id = ? AND status = 'pending'`
    )
    .get(clarificationId, userId) as Record<string, unknown> | undefined;
  if (!row) {
    throw Object.assign(new Error("not_found_or_resolved"), { status: 404 });
  }

  const options = JSON.parse(row.options_json as string) as Array<{
    id: string;
    label: string;
    window_start: string;
    window_end: string;
  }>;
  const chosen = options.find((o) => o.id === optionId);
  if (!chosen) {
    throw Object.assign(new Error("invalid_option"), { status: 400 });
  }

  const t = nowIso();
  const commitmentId = row.commitment_id as string | null;

  if (commitmentId) {
    await db.prepare(
      `UPDATE commitments
       SET window_start = ?, window_end = ?, status = 'planned', updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(chosen.window_start, chosen.window_end, t, commitmentId, userId);
  }

  await db.prepare(
    `UPDATE clarifications
     SET status = 'resolved', chosen_option = ?, resolved_at = ?
     WHERE id = ?`
  ).run(optionId, t, clarificationId);

  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "clarification_resolved",
    summary: actionSummary("clarification_resolved", { label: chosen.label }),
    entity_type: "clarification",
    entity_id: clarificationId,
    payload: {
      option_id: optionId,
      commitment_id: commitmentId,
      window_start: chosen.window_start,
      window_end: chosen.window_end,
      label: chosen.label,
    },
  });

  const commitment = commitmentId
    ? (await db.prepare(`SELECT * FROM commitments WHERE id = ?`).get(commitmentId) as
        | Record<string, unknown>
        | undefined) ?? null
    : null;

  return {
    ok: true,
    clarification_id: clarificationId,
    chosen: { id: chosen.id, label: chosen.label },
    commitment,
  };
}

export async function getLatestPendingClarification(
  db: SqlDatabase,
  userId: string
): Promise<Record<string, unknown> | null> {
  const row = await db
    .prepare(
      `SELECT * FROM clarifications WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId) as Record<string, unknown> | undefined;
  return row ?? null;
}
