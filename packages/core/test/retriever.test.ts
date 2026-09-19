/**
 * FTS5 portability guard for the Retriever design (docs/RETRIEVER.md).
 *
 * Proves the adapter supports FTS5, that unigram segmentation makes CJK
 * substring search work, and that bm25 ranks a stronger match first. SQL
 * triggers cannot segment CJK, so the runtime writes segmented text into the
 * index; the mechanics below mirror what the migration and indexer will do.
 */

import { segmentForSearch, toMatchQuery } from "../src/lib/search.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- segmentation -----------------------------------------------------------

assert(
  segmentForSearch("保持克制") === "保 持 克 制",
  `CJK is split into characters, got ${segmentForSearch("保持克制")}`
);
assert(
  segmentForSearch("simple  tools") === "simple tools",
  "spacing is collapsed"
);
assert(toMatchQuery("克制") === '"克 制"', "a CJK query is a character phrase");
assert(toMatchQuery("simple tools") === "simple* AND tools*", "a Latin query is prefix terms");
assert(toMatchQuery('say "hi"') === 'say* AND hi*', "quotes are stripped");

// --- FTS5 mechanics ---------------------------------------------------------

const db = await createTestDb();
await db.exec(`
  CREATE VIRTUAL TABLE memory_search USING fts5(
    memory_id UNINDEXED,
    content,
    tokenize = 'unicode61'
  );
`);

async function index(id: string, content: string): Promise<void> {
  await db
    .prepare(`INSERT INTO memory_search(memory_id, content) VALUES (?, ?)`)
    .run(id, segmentForSearch(content));
}

async function matches(query: string): Promise<string[]> {
  const rows = (await db
    .prepare(
      `SELECT memory_id FROM memory_search WHERE memory_search MATCH ?
       ORDER BY bm25(memory_search)`
    )
    .all(toMatchQuery(query))) as Array<{ memory_id: string }>;
  return rows.map((row) => row.memory_id);
}

await index("m-en", "Prefers simplicity and minimal tools");
await index("m-zh", "保持克制，产品不要做太复杂");

assert((await matches("simplicity")).includes("m-en"), "FTS5 finds an English term");
assert((await matches("simpl")).includes("m-en"), "a prefix query matches");
assert((await matches("克制")).includes("m-zh"), "FTS5 finds a Chinese substring");
assert((await matches("复杂")).includes("m-zh"), "FTS5 finds a second Chinese substring");
assert(!(await matches("无关")).includes("m-zh"), "an absent term does not match");

// Re-indexing replaces the row (the runtime does this on an update).
await db.prepare(`DELETE FROM memory_search WHERE memory_id = 'm-en'`).run();
await index("m-en", "Prefers dense interfaces");
assert(!(await matches("simplicity")).includes("m-en"), "an update removes the old term");
assert((await matches("dense")).includes("m-en"), "an update adds the new term");
await db.prepare(`DELETE FROM memory_search WHERE memory_id = 'm-en'`).run();
assert(!(await matches("dense")).includes("m-en"), "a delete removes the row");

// bm25 ranks a stronger match first (lower is better).
await index("m-once", "simple");
await index("m-twice", "simple simple tools");
const ranked = await matches("simple");
assert(
  ranked.indexOf("m-twice") < ranked.indexOf("m-once"),
  `bm25 ranks the stronger match first, got ${JSON.stringify(ranked)}`
);

finish("retriever FTS5 tests passed.");
