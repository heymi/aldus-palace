import { createTestDb, finish } from "./support/db.js";
import { listCommitments } from "../src/services/commitments.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const db = await createTestDb();

const now = "2026-07-19T04:00:00.000Z";
const original =
  "我需要把这次用户访谈的全部记录重新整理，保留关键原话，并输出下一轮验证问题和负责人。";
const optimized = "整理访谈结论，保留关键原话，并明确下一轮验证问题与负责人。";

await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'zh', ?, ?)`
  )
  .run(now, now);
await db
  .prepare(
    `INSERT INTO raw_inputs
     (id, user_id, content, source, processing_status, created_at, updated_at)
     VALUES ('input-1', 'u1', ?, 'text', 'processed', ?, ?)`
  )
  .run(original, now, now);
await db
  .prepare(
    `INSERT INTO commitments
     (id, user_id, title, optimized_content, status, source_input_id, created_at, updated_at)
     VALUES ('commitment-1', 'u1', '整理访谈并输出验证问题', ?, 'captured', 'input-1', ?, ?)`
  )
  .run(optimized, now, now);
await db
  .prepare(
    `INSERT INTO raw_inputs
     (id, user_id, content, source, processing_status, created_at, updated_at)
     VALUES ('input-legacy', 'u1', '整理旧任务', 'text', 'processed', ?, ?)`
  )
  .run(now, now);
await db
  .prepare(
    `INSERT INTO commitments
     (id, user_id, title, goal, status, source_input_id, created_at, updated_at)
     VALUES ('commitment-legacy', 'u1', '整理旧任务', NULL, 'captured', 'input-legacy', ?, ?)`
  )
  .run(now, now);

const items = await listCommitments(db, "u1");
assert(items.length === 2, `expected two commitments, got ${items.length}`);
const item = items.find((row) => row.id === "commitment-1");
const legacy = items.find((row) => row.id === "commitment-legacy");
assert(
  item?.source_input_content === original,
  "task list must return the original user input alongside the optimized title"
);
assert(
  item?.optimized_content === optimized,
  "task list must return AI-optimized content separately from the commitment goal"
);
assert(item?.goal === null, "optimized content must not overwrite why the task matters");
assert(
  legacy?.optimized_content === null,
  "legacy tasks must not invent optimized content"
);

finish("commitment original input test passed.");
