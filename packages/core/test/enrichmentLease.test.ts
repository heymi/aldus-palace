import { createTestDb } from "./support/db.js";
import {
  claimEnrichment,
  recordEnrichmentFailure,
} from "../src/services/enrichmentLease.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const db = await createTestDb();
const start = new Date("2026-07-19T00:00:00.000Z");
const startedAt = start.toISOString();

await db
  .prepare(
    `INSERT INTO users (id, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Asia/Shanghai', 'zh-CN', ?, ?)`
  )
  .run(startedAt, startedAt);
await db
  .prepare(
    `INSERT INTO raw_inputs
     (id, user_id, content, source, processing_status, created_at, updated_at)
     VALUES ('input-1', 'u1', '测试并发富化', 'text', 'local', ?, ?)`
  )
  .run(startedAt, startedAt);

const firstGeneration = await claimEnrichment(db, "input-1", "u1", start);
assert(firstGeneration !== null, "the first enrichment must acquire the lease");
assert(
  (await claimEnrichment(db, "input-1", "u1", start)) === null,
  "a concurrent enrichment must not acquire the active lease"
);

await recordEnrichmentFailure(db, "input-1", "stale-generation", "stale failure");
let row = (await db
  .prepare(
    `SELECT processing_status, processing_generation_id, error_message
     FROM raw_inputs WHERE id = 'input-1'`
  )
  .get()) as {
  processing_status: string;
  processing_generation_id: string | null;
  error_message: string | null;
};
assert(
  row.processing_generation_id === firstGeneration &&
    row.processing_status === "enriching" &&
    row.error_message === null,
  "a stale generation must not overwrite the active enrichment"
);

const afterExpiry = new Date(start.getTime() + 6 * 60 * 1000);
const replacementGeneration = await claimEnrichment(
  db,
  "input-1",
  "u1",
  afterExpiry
);
assert(
  replacementGeneration !== null && replacementGeneration !== firstGeneration,
  "an expired lease must be reclaimable with a new generation"
);

await recordEnrichmentFailure(db, "input-1", firstGeneration!, "late failure");
row = (await db
  .prepare(
    `SELECT processing_status, processing_generation_id, error_message
     FROM raw_inputs WHERE id = 'input-1'`
  )
  .get()) as typeof row;
assert(
  row.processing_generation_id === replacementGeneration &&
    row.processing_status === "enriching" &&
    row.error_message === null,
  "the superseded generation must not overwrite its replacement"
);

await recordEnrichmentFailure(
  db,
  "input-1",
  replacementGeneration!,
  "active failure"
);
row = (await db
  .prepare(
    `SELECT processing_status, processing_generation_id, error_message
     FROM raw_inputs WHERE id = 'input-1'`
  )
  .get()) as typeof row;
assert(
  row.processing_generation_id === null &&
    row.processing_status === "local" &&
    row.error_message === "active failure",
  "the active generation must release its lease while preserving local results"
);

console.log("enrichment lease test passed.");
