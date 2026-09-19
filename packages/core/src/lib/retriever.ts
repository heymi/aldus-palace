/**
 * Memory retrieval over FTS5.
 *
 * The runtime writes the segmented form of a memory (lib/search.ts) into
 * `memories.search_text`; this module keeps `memory_search` in step with it and
 * answers a query with ranked ids. The design and its portability findings are
 * in docs/RETRIEVER.md.
 */

import type { SqlDatabase } from "../db/port.js";
import { segmentForSearch, toMatchQuery } from "./search.js";

export type RetrieverOptions = { limit?: number };

/** A port: callers ask for ranked memory ids, not for a search strategy. */
export type MemoryRetriever = (
  db: SqlDatabase,
  userId: string,
  query: string,
  options?: RetrieverOptions
) => Promise<string[]>;

/**
 * Refresh a memory's search row.
 *
 * Update when a row exists, insert guarded by NOT EXISTS otherwise: delete then
 * insert could leave two rows for one memory if two flows interleave, and the
 * index has no unique key to stop it. Empty text means nothing to index, so the
 * row is removed instead.
 */
async function upsertSearchRow(
  db: SqlDatabase,
  memoryId: string,
  segmented: string
): Promise<void> {
  if (!segmented) {
    await db.prepare(`DELETE FROM memory_search WHERE memory_id = ?`).run(memoryId);
    return;
  }
  const updated = await db
    .prepare(`UPDATE memory_search SET search_text = ? WHERE memory_id = ?`)
    .run(segmented, memoryId);
  if (Number(updated.changes ?? 0) > 0) return;
  await db
    .prepare(
      `INSERT INTO memory_search(memory_id, search_text)
       SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM memory_search WHERE memory_id = ?)`
    )
    .run(memoryId, segmented, memoryId);
}

/**
 * Index one memory: refresh its search row, then record the segmented text.
 *
 * The search row goes first so a failure between the two writes leaves
 * `search_text` NULL, which the backfill treats as "needs indexing" and repairs.
 * The reverse order could mark a memory indexed with no search row, which
 * nothing would ever revisit.
 */
export async function indexMemory(
  db: SqlDatabase,
  memoryId: string,
  content: string
): Promise<void> {
  const segmented = segmentForSearch(content);
  await upsertSearchRow(db, memoryId, segmented);
  await db
    .prepare(`UPDATE memories SET search_text = ? WHERE id = ?`)
    .run(segmented, memoryId);
}

/**
 * Drop a memory's search row. The stored text is cleared to an empty marker, so
 * the backfill can tell a deliberate removal from a row that went missing and
 * needs repair.
 */
export async function removeMemoryFromIndex(
  db: SqlDatabase,
  memoryId: string
): Promise<void> {
  await db.prepare(`DELETE FROM memory_search WHERE memory_id = ?`).run(memoryId);
  await db.prepare(`UPDATE memories SET search_text = '' WHERE id = ?`).run(memoryId);
}

/**
 * Backfill memories written before the index existed, or by raw SQL, and repair
 * any that lost their search row. Returns how many rows it indexed, so a caller
 * can log the work. Empty text is indexed as '' with no search row, so it is not
 * mistaken for a missing one.
 */
export async function ensureMemoryIndex(
  db: SqlDatabase,
  userId: string
): Promise<number> {
  const rows = (await db
    .prepare(
      `SELECT m.id, m.content FROM memories m
       LEFT JOIN memory_search ms ON ms.memory_id = m.id
       WHERE m.user_id = ?
         AND (m.search_text IS NULL OR (m.search_text <> '' AND ms.memory_id IS NULL))`
    )
    .all(userId)) as Array<{ id: string; content: string }>;
  for (const row of rows) {
    await indexMemory(db, row.id, row.content);
  }
  return rows.length;
}

/** The default retriever: FTS5, portable across both runtimes. */
export const ftsRetriever: MemoryRetriever = async (
  db,
  userId,
  query,
  options = {}
) => {
  const match = toMatchQuery(query);
  if (!match) return [];
  const rows = (await db
    .prepare(
      `SELECT memory_search.memory_id AS id
       FROM memory_search
       INNER JOIN memories m ON m.id = memory_search.memory_id
       WHERE memory_search MATCH ? AND m.user_id = ? AND m.status = 'active'
       ORDER BY bm25(memory_search)
       LIMIT ?`
    )
    .all(match, userId, options.limit ?? 40)) as Array<{ id: string }>;
  return rows.map((row) => row.id);
};

/** Backfill, then search. The entry point for callers. */
export async function retrieveMemoryIds(
  db: SqlDatabase,
  userId: string,
  query: string,
  options?: RetrieverOptions
): Promise<string[]> {
  await ensureMemoryIndex(db, userId);
  return ftsRetriever(db, userId, query, options);
}
