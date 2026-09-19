import { DEFAULT_LOCALE, type Locale } from "../lib/locale.js";
/**
 * Memory lifecycle: candidates become active only through explicit confirmation.
 *
 * Kept here (not in an HTTP handler) so every surface — the reference server,
 * the MCP server, embedders — applies exactly the same rules.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import {
  conceptsForMemory,
  linkMemoryToConcepts,
  suggestConceptNamesForMemory,
} from "../lib/concepts.js";
import { writeActionLog } from "../repos/actionLogs.js";

export type MemoryRow = Record<string, unknown>;

export type ConfirmMemoryResult =
  | {
      ok: true;
      memory: MemoryRow;
      /** Present when this confirmation replaced an older memory. */
      superseded?: MemoryRow;
      /** Set when a requested supersede could not be applied. */
      supersede_error?: string;
    }
  | { ok: false; error: "not_found" | "not_candidate" };

export type ConfirmMemoryOptions = {
  /** Language for the action-log entry. */
  locale?: Locale;
  /** Id of a confirmed memory this one replaces (memory evolution). */
  supersedes?: string;
  reason?: string;
};

export async function getMemory(
  db: SqlDatabase,
  userId: string,
  memoryId: string
): Promise<MemoryRow | undefined> {
  return (await db
    .prepare(`SELECT * FROM memories WHERE id = ? AND user_id = ?`)
    .get(memoryId, userId)) as MemoryRow | undefined;
}

/**
 * Promote a candidate memory to active and link it to concepts.
 * Never overwrites an already-active memory.
 */
export async function confirmMemory(
  db: SqlDatabase,
  userId: string,
  memoryId: string,
  conceptNames?: string[],
  options: ConfirmMemoryOptions = {}
): Promise<ConfirmMemoryResult> {
  const existing = await getMemory(db, userId, memoryId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status !== "candidate") return { ok: false, error: "not_candidate" };

  const t = nowIso();
  // Confirming a memory resolves any conflict flag it carried: the user has
  // looked at the contradiction and made a call.
  await db
    .prepare(
      `UPDATE memories
       SET status = 'active', confirmed_at = ?, updated_at = ?,
           conflicts_with_id = NULL, conflict_reason = NULL
       WHERE id = ? AND user_id = ?`
    )
    .run(t, t, memoryId, userId);

  const locale = options.locale ?? DEFAULT_LOCALE;
  const names =
    conceptNames?.length
      ? conceptNames
      : suggestConceptNamesForMemory(String(existing.type), String(existing.content));
  const linked = await linkMemoryToConcepts(db, userId, memoryId, names);

  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "memory_confirmed",
    summary: actionSummary("memory_confirmed", { concept_count: linked.length }, locale),
    entity_type: "memory",
    entity_id: memoryId,
    payload: { concepts: linked, concept_count: linked.length },
  });

  let superseded: MemoryRow | undefined;
  let supersede_error: string | undefined;
  if (options.supersedes) {
    const { supersedeMemory } = await import("./memoryEvolution.js");
    const result = await supersedeMemory(db, userId, {
      oldId: options.supersedes,
      newId: memoryId,
      reason: options.reason,
    });
    if (result.ok) superseded = result.superseded;
    else supersede_error = result.error;
  }

  const row = await getMemory(db, userId, memoryId);
  return {
    ok: true,
    memory: { ...(row ?? {}), concepts: await conceptsForMemory(db, memoryId) },
    ...(superseded ? { superseded } : {}),
    ...(supersede_error ? { supersede_error } : {}),
  };
}

/**
 * Archive a candidate the user does not want remembered.
 * Active memories are never archived by this path.
 */
export async function rejectMemory(
  db: SqlDatabase,
  userId: string,
  memoryId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<{ ok: boolean; previous_status?: string }> {
  const existing = await getMemory(db, userId, memoryId);
  if (!existing) return { ok: false };

  // Reverse an automated activation as readily as a pending candidate: the
  // user keeps the final say over what the system remembers.
  const previous = String(existing.status);
  const superseded = existing.superseded_by_id;
  if ((previous !== "candidate" && previous !== "active") || superseded) {
    return { ok: false };
  }

  const t = nowIso();
  const result = await db
    .prepare(
      `UPDATE memories SET status = 'archived', updated_at = ?
       WHERE id = ? AND user_id = ? AND status = ?`
    )
    .run(t, memoryId, userId, previous);

  if (result.changes === 0) return { ok: false };

  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "memory_archived",
    summary: actionSummary("memory_archived", undefined, locale),
    entity_type: "memory",
    entity_id: memoryId,
    payload: { previous_status: previous },
  });
  return { ok: true, previous_status: previous };
}

export type MemoryListStatus = "candidate" | "active" | "archived";

export async function listMemoriesByStatus(
  db: SqlDatabase,
  userId: string,
  status: MemoryListStatus = "candidate",
  limit = 50
): Promise<MemoryRow[]> {
  const rows = (await db
    .prepare(
      `SELECT * FROM memories WHERE user_id = ? AND status = ?
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, status, limit)) as MemoryRow[];
  return rows;
}
