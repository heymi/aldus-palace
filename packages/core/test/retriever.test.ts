/**
 * The FTS5 retriever (docs/RETRIEVER.md).
 *
 * Uses the real schema: `memory_search` ships with it, and the runtime keeps it
 * in step through `indexMemory` / `ensureMemoryIndex`. Proves CJK substring
 * search, re-index on edit, removal, and bm25 ordering.
 */

import { nowIso } from "../src/db/port.js";
import {
  ensureMemoryIndex,
  indexMemory,
  removeMemoryFromIndex,
  retrieveMemoryIds,
} from "../src/lib/retriever.js";
import { segmentForSearch, toMatchQuery } from "../src/lib/search.js";
import { clearInputDerivatives } from "../src/agent/understand.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- segmentation -----------------------------------------------------------

assert(
  segmentForSearch("保持克制") === "保 持 克 制",
  `CJK is split into characters, got ${segmentForSearch("保持克制")}`
);
assert(segmentForSearch("simple  tools") === "simple tools", "spacing is collapsed");
assert(toMatchQuery("克制") === '"克 制"', "a CJK query word is a character phrase");
assert(
  toMatchQuery("克制 复杂") === '"克 制" OR "复 杂"',
  "each CJK word is its own phrase"
);
assert(toMatchQuery("simple tools") === "simple* OR tools*", "Latin words are prefix terms");
assert(
  toMatchQuery("Mac-only") === "mac* OR only*",
  "a hyphen breaks into terms, so FTS5 does not read a column"
);
assert(toMatchQuery('say "hi"') === "say* OR hi*", "quotes are stripped");
assert(
  toMatchQuery("? hello") === "hello*",
  `punctuation-only words leave no dangling OR, got ${toMatchQuery("? hello")}`
);
assert(
  toMatchQuery("hello ()") === "hello*",
  `a trailing punctuation word is dropped, got ${toMatchQuery("hello ()")}`
);
assert(toMatchQuery("😀 hello") === "hello*", "an emoji word is dropped");
assert(toMatchQuery("😀") === "", "a query of only emoji has no expression");

// --- the retriever over the real schema -------------------------------------

const db = await createTestDb();
const now = nowIso();
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'UTC', 'en', ?, ?)`
  )
  .run(now, now);

async function addMemory(id: string, content: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO memories
       (id, user_id, type, content, status, source, confidence, importance, created_at, updated_at)
       VALUES (?, 'u1', 'preference', ?, 'active', 'user_explicit', 0.9, 0.8, ?, ?)`
    )
    .run(id, content, now, now);
}

await addMemory("m-en", "Prefers simplicity and minimal tools");
await addMemory("m-zh", "保持克制，产品不要做太复杂");

// Rows written without an index are backfilled on the first search.
assert((await ensureMemoryIndex(db, "u1")) === 2, "both rows are backfilled");

assert(
  (await retrieveMemoryIds(db, "u1", "simplicity")).includes("m-en"),
  "an English term is found"
);
assert(
  (await retrieveMemoryIds(db, "u1", "simpl")).includes("m-en"),
  "a prefix query matches"
);
assert(
  (await retrieveMemoryIds(db, "u1", "克制")).includes("m-zh"),
  "a Chinese substring is found"
);
assert(
  (await retrieveMemoryIds(db, "u1", "复杂")).includes("m-zh"),
  "a second Chinese substring is found"
);
assert(
  !(await retrieveMemoryIds(db, "u1", "无关")).includes("m-zh"),
  "an absent term does not match"
);

// An edit re-indexes; the old term leaves and the new one arrives.
await indexMemory(db, "m-en", "Prefers dense interfaces");
assert(
  !(await retrieveMemoryIds(db, "u1", "simplicity")).includes("m-en"),
  "an edit removes the old term"
);
assert(
  (await retrieveMemoryIds(db, "u1", "dense")).includes("m-en"),
  "an edit adds the new term"
);

// Removal drops the search row, and a deleted memory never surfaces.
await removeMemoryFromIndex(db, "m-en");
assert(
  !(await retrieveMemoryIds(db, "u1", "dense")).includes("m-en"),
  "a removed row is not found"
);

// bm25 ranks a stronger match first.
await addMemory("m-once", "simple");
await addMemory("m-twice", "simple simple tools");
await ensureMemoryIndex(db, "u1");
const ranked = await retrieveMemoryIds(db, "u1", "simple");
assert(
  ranked.indexOf("m-twice") < ranked.indexOf("m-once"),
  `bm25 ranks the stronger match first, got ${JSON.stringify(ranked)}`
);

// A hyphenated query must not become FTS5 column syntax.
await addMemory("m-mac", "Keep the product Mac-only and skip Windows");
await ensureMemoryIndex(db, "u1");
assert(
  (await retrieveMemoryIds(db, "u1", "Mac-only")).includes("m-mac"),
  "a hyphenated query matches"
);
assert(
  (await retrieveMemoryIds(db, "u1", "Windows")).includes("m-mac"),
  "a second term matches"
);

// A memory whose search row went missing is repaired by the backfill.
await addMemory("m-repair", "Prefers quiet mornings");
await db
  .prepare(`UPDATE memories SET search_text = 'Prefers quiet mornings' WHERE id = 'm-repair'`)
  .run();
assert(
  (await ensureMemoryIndex(db, "u1")) >= 1,
  "a memory with text but no search row is repaired"
);
assert(
  (await retrieveMemoryIds(db, "u1", "quiet")).includes("m-repair"),
  "the repaired memory is searchable"
);

// Indexing the same memory twice leaves one row: the index has no unique key.
await indexMemory(db, "m-repair", "Prefers quiet mornings");
await indexMemory(db, "m-repair", "Prefers quiet mornings");
const searchRows = (await db
  .prepare(`SELECT COUNT(*) AS count FROM memory_search WHERE memory_id = 'm-repair'`)
  .get()) as { count: number };
assert(Number(searchRows.count) === 1, `one search row per memory, got ${searchRows.count}`);

// Text with nothing to index is marked empty, creates no row, and is not
// revisited by the backfill.
await addMemory("m-empty", "   ");
await indexMemory(db, "m-empty", "   ");
const emptyMarker = (await db
  .prepare(`SELECT search_text FROM memories WHERE id = 'm-empty'`)
  .get()) as { search_text: string };
assert(emptyMarker.search_text === "", "nothing to index stores an empty marker");
const emptyRows = (await db
  .prepare(`SELECT COUNT(*) AS count FROM memory_search WHERE memory_id = 'm-empty'`)
  .get()) as { count: number };
assert(Number(emptyRows.count) === 0, "nothing to index creates no search row");
assert((await ensureMemoryIndex(db, "u1")) === 0, "the backfill does not revisit empty text");

// Clearing an input's derivatives removes the search row with the memory.
await db
  .prepare(
    `INSERT INTO raw_inputs (id, user_id, content, source, processing_status, created_at, updated_at)
     VALUES ('r1', 'u1', 'x', 'text', 'processed', ?, ?)`
  )
  .run(now, now);
await db
  .prepare(
    `INSERT INTO memories
     (id, user_id, type, content, status, source, confidence, importance, source_input_id, created_at, updated_at)
     VALUES ('m-input', 'u1', 'preference', 'Temporary memory', 'active', 'user_explicit', 0.9, 0.8, 'r1', ?, ?)`
  )
  .run(now, now);
await indexMemory(db, "m-input", "Temporary memory");
await clearInputDerivatives(db, "r1");
const leftover = (await db
  .prepare(`SELECT COUNT(*) AS count FROM memory_search WHERE memory_id = 'm-input'`)
  .get()) as { count: number };
assert(Number(leftover.count) === 0, "the search row goes when the memory is cleared");

finish("retriever tests passed.");
