/**
 * Forward-only migrations.
 *
 * `await migrate()` is the single entry point: it applies the canonical schema
 * (idempotent `CREATE TABLE IF NOT EXISTS`) and then every migration that has
 * not been recorded in `schema_migrations` yet. Migrations must stay
 * additive and replayable; never edit a shipped migration — add a new one.
 */

import { nowIso, type SqlDatabase } from "./port.js";
import { SCHEMA_SQL } from "./schema.js";

export type Migration = {
  version: string;
  up: (db: SqlDatabase) => Promise<void>;
};

async function addColumnIfMissing(
  db: SqlDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const columns = (await db
    .prepare(`PRAGMA table_info(${table})`)
    .all()) as Array<{ name: string }>;
  if (!columns.some((existing) => existing.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const workClassificationV1: Migration = {
  version: "2026-07-22-work-classification-v1",
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS commitment_classifications (
        commitment_id TEXT PRIMARY KEY REFERENCES commitments(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        project_id TEXT REFERENCES projects(id),
        group_key TEXT NOT NULL,
        group_label TEXT NOT NULL,
        source TEXT NOT NULL,
        reason TEXT,
        confidence REAL,
        classifier_version TEXT NOT NULL,
        commitment_fingerprint TEXT NOT NULL,
        context_fingerprint TEXT NOT NULL,
        generation_id TEXT NOT NULL,
        manual_override INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (source IN ('ai', 'user', 'fallback'))
      );
      CREATE TABLE IF NOT EXISTS commitment_classification_runs (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        generation_id TEXT NOT NULL,
        input_fingerprint TEXT NOT NULL,
        context_fingerprint TEXT NOT NULL,
        classifier_version TEXT NOT NULL,
        execution_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        lease_until TEXT,
        assignment_count INTEGER NOT NULL DEFAULT 0,
        group_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (status IN ('running', 'ready', 'failed', 'stale'))
      );
      CREATE INDEX IF NOT EXISTS idx_commitment_classifications_user_group
        ON commitment_classifications(user_id, group_key);
    `);
    await addColumnIfMissing(
      db,
      "commitment_classification_runs",
      "classifier_version",
      "TEXT NOT NULL DEFAULT 'legacy'"
    );
    await addColumnIfMissing(
      db,
      "commitment_classification_runs",
      "execution_mode",
      "TEXT NOT NULL DEFAULT 'legacy'"
    );
  },
};

const progressiveCaptureColumns: Migration = {
  version: "2026-08-01-progressive-capture",
  async up(db) {
    await addColumnIfMissing(db, "raw_inputs", "processing_generation_id", "TEXT");
    await addColumnIfMissing(db, "raw_inputs", "processing_lease_until", "TEXT");
    await addColumnIfMissing(db, "raw_inputs", "result_generation_id", "TEXT");
    await addColumnIfMissing(db, "thoughts", "title", "TEXT");
    await addColumnIfMissing(db, "projects", "aliases", "TEXT");
    await addColumnIfMissing(db, "projects", "brief", "TEXT");
    await addColumnIfMissing(db, "commitments", "optimized_content", "TEXT");
    await db.exec(
      `UPDATE commitments SET optimized_content = goal
       WHERE optimized_content IS NULL AND goal IS NOT NULL`
    );
  },
};

export const MIGRATIONS: Migration[] = [
  workClassificationV1,
  progressiveCaptureColumns,
];

/**
 * Apply the canonical schema (idempotent). Safe to run on every startup.
 *
 * Migrations are a separate step so that partial/legacy databases can be
 * brought forward without replaying the full DDL — see `migrate`.
 */
export async function applySchema(
  db: SqlDatabase,
  schemaSql: string = SCHEMA_SQL
): Promise<void> {
  await db.exec(schemaSql);
}

/**
 * Apply every migration that `schema_migrations` has not recorded yet.
 * Forward-only: never edit a shipped migration, add a new one.
 */
export async function migrate(db: SqlDatabase): Promise<void> {
  for (const migration of MIGRATIONS) {
    const applied = await db
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(migration.version);
    if (applied) continue;

    const run = db.transaction(async () => {
      await migration.up(db);
    });
    await run();

    await db
      .prepare(
        "INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      )
      .run(migration.version, nowIso());
  }
}

/** Canonical startup path: schema + migrations. */
export async function initialize(
  db: SqlDatabase,
  schemaSql: string = SCHEMA_SQL
): Promise<void> {
  await applySchema(db, schemaSql);
  await migrate(db);
}
