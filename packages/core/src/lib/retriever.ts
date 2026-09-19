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

async function upsertSearchRow(
  db: SqlDatabase,
  memoryId: string,
  segmented: string
): Promise<void> {
  await db.prepare(`DELETE FROM memory_search WHERE memory_id = ?`).run(memoryId);
  if (segmented) {
    await db
      .prepare(`INSERT INTO memory_search(memory_id, search_text) VALUES (?, ?)`)
      .run(memoryId, segmented);
  }
}

/** Index one memory: store the segmented text and refresh its search row. */
export async function indexMemory(
  db: SqlDatabase,
  memoryId: string,
  content: string
): Promise<void> {
  const segmented = segmentForSearch(content);
  await db
    .prepare(`UPDATE memories SET search_text = ? WHERE id = ?`)
    .run(segmented, memoryId);
  await upsertSearchRow(db, memoryId, segmented);
}

/** Drop a memory's search row. */
export async function removeMemoryFromIndex(
  db: SqlDatabase,
  memoryId: string
): Promise<void> {
  await db.prepare(`DELETE FROM memory_search WHERE memory_id = ?`).run(memoryId);
}

/**
 * Backfill memories written before the index existed, or by raw SQL. Returns
 * how many rows it indexed, so a caller can log the work.
 */
export async function ensureMemoryIndex(
  db: SqlDatabase,
  userId: string
): Promise<number> {
  const rows = (await db
    .prepare(
      `SELECT id, content FROM memories
       WHERE user_id = ? AND search_text IS NULL`
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
