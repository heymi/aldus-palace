/**
 * Reclassify an input: correct what a capture became, and remember the
 * correction so the same words are not asked about twice.
 *
 * "bug" and "task" produce one commitment; "note" cancels any commitment the
 * input produced and keeps the thought. The choice is written to the action log
 * and to the per-user classification signals.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import { suggestWorkTitle } from "../lib/actionableWork.js";
import {
  rememberClassification,
  type ObjectChoice,
} from "../lib/classificationSignals.js";
import { newId } from "../lib/id.js";
import { pick, type Locale } from "../lib/locale.js";
import { writeActionLog } from "../repos/actionLogs.js";

/** The title a bug or task commitment gets from the raw words. */
export function commitmentTitleFor(
  content: string,
  choice: ObjectChoice,
  locale: Locale
): string {
  const base = content.trim().slice(0, 60);
  if (choice === "bug") return `${pick(locale, "Fix: ", "修复：")}${base}`;
  return suggestWorkTitle(content) || base;
}

export type ReclassifyResult = {
  ok: true;
  choice: ObjectChoice;
  commitment: Record<string, unknown> | null;
  cancelled_commitments: number;
};

export async function applyObjectChoice(
  db: SqlDatabase,
  userId: string,
  rawInputId: string,
  choice: ObjectChoice,
  options: { locale?: Locale; actor?: "user" | "agent" } = {}
): Promise<ReclassifyResult> {
  const locale = options.locale ?? "en";
  const actor = options.actor ?? "user";
  const raw = (await db
    .prepare(`SELECT id, content FROM raw_inputs WHERE id = ? AND user_id = ?`)
    .get(rawInputId, userId)) as { id: string; content: string } | undefined;
  if (!raw) {
    throw Object.assign(new Error("not_found"), { status: 404 });
  }

  const t = nowIso();
  const existing = (await db
    .prepare(
      `SELECT id, title FROM commitments
       WHERE source_input_id = ? AND user_id = ? AND status != 'cancelled'
       ORDER BY created_at ASC`
    )
    .all(rawInputId, userId)) as Array<{ id: string; title: string }>;

  let commitment: Record<string, unknown> | null = null;
  let cancelled = 0;

  if (choice === "note") {
    const result = await db
      .prepare(
        `UPDATE commitments SET status = 'cancelled', updated_at = ?
         WHERE source_input_id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
      )
      .run(t, rawInputId, userId);
    cancelled = Number(result.changes ?? 0);
    commitment = null;
  } else {
    const title = commitmentTitleFor(raw.content, choice, locale);

    if (existing.length) {
      await db
        .prepare(`UPDATE commitments SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
        .run(title, t, existing[0].id, userId);
      commitment =
        ((await db
          .prepare(`SELECT * FROM commitments WHERE id = ?`)
          .get(existing[0].id)) as Record<string, unknown> | undefined) ?? null;
    } else {
      const id = newId("cmt");
      await db
        .prepare(
          `INSERT INTO commitments
           (id, user_id, title, goal, optimized_content, project_id, status, deadline,
            window_start, window_end, duration_minutes, importance, source_thought_id,
            source_input_id, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, NULL, 'captured', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`
        )
        .run(id, userId, title, raw.content.trim(), rawInputId, t, t);
      commitment =
        ((await db
          .prepare(`SELECT * FROM commitments WHERE id = ?`)
          .get(id)) as Record<string, unknown> | undefined) ?? null;
      await writeActionLog(db, {
        user_id: userId,
        actor,
        action_type: "commitment_created",
        summary: actionSummary("commitment_created", { title }, locale),
        entity_type: "commitment",
        entity_id: id,
        payload: { title, via: "reclassify", choice },
      });
    }

    // The thought that carried the words is no longer the primary object.
    await db
      .prepare(
        `UPDATE thoughts SET status = 'converted', updated_at = ?
         WHERE source_input_id = ? AND user_id = ? AND status != 'archived'`
      )
      .run(t, rawInputId, userId);
  }

  await db
    .prepare(
      `UPDATE clarifications SET status = 'resolved', chosen_option = ?, resolved_at = ?
       WHERE raw_input_id = ? AND user_id = ? AND status = 'pending'`
    )
    .run(choice, t, rawInputId, userId);

  const terms = await rememberClassification(db, userId, raw.content, choice);

  await writeActionLog(db, {
    user_id: userId,
    actor,
    action_type: "input_reclassified",
    summary: actionSummary("input_reclassified", { choice }, locale),
    reason: raw.content.slice(0, 200),
    entity_type: "raw_input",
    entity_id: rawInputId,
    payload: { choice, terms, commitment_id: commitment?.id ?? null, cancelled },
  });

  return { ok: true, choice, commitment, cancelled_commitments: cancelled };
}
