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

async function tableExists(db: SqlDatabase, table: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
}

/**
 * Add a column only when the table exists and the column is missing.
 * Migrations patch databases that already have data; a partial/legacy schema
 * that never had the table is left to `applySchema`.
 */
async function addColumnIfMissing(
  db: SqlDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (!(await tableExists(db, table))) return;
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

const memoryEvolution: Migration = {
  version: "2026-09-19-memory-evolution",
  async up(db) {
    await addColumnIfMissing(db, "memories", "supersedes_id", "TEXT REFERENCES memories(id)");
    await addColumnIfMissing(db, "memories", "superseded_by_id", "TEXT REFERENCES memories(id)");
    await addColumnIfMissing(db, "memories", "supersede_reason", "TEXT");
    await addColumnIfMissing(db, "memories", "conflicts_with_id", "TEXT REFERENCES memories(id)");
    await addColumnIfMissing(db, "memories", "conflict_reason", "TEXT");
  },
};

const actionGate: Migration = {
  version: "2026-09-19-action-gate",
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS action_proposals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        action_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        risk TEXT NOT NULL,
        status TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT,
        decided_by TEXT,
        decided_at TEXT,
        confirmations INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (risk IN ('low', 'medium', 'high', 'critical')),
        CHECK (status IN ('approved', 'notified', 'proposed', 'pending_second', 'rejected', 'revoked')),
        CHECK (actor IN ('agent', 'user'))
      );
      CREATE INDEX IF NOT EXISTS idx_action_proposals_user_status
        ON action_proposals(user_id, status, created_at);
    `);
  },
};

const autonomySettings: Migration = {
  version: "2026-09-19-autonomy-settings",
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS autonomy_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        ceiling INTEGER NOT NULL DEFAULT 2,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (ceiling IN (2, 3, 4))
      );
    `);
  },
};

const workMigration: Migration = {
  version: "2026-09-19-work-migration",
  async up(db) {
    await addColumnIfMissing(
      db,
      "commitments",
      "deferral_count",
      "INTEGER NOT NULL DEFAULT 0"
    );
    await addColumnIfMissing(db, "commitments", "migration_surfaced_at", "TEXT");
  },
};

const commitmentDependencies: Migration = {
  version: "2026-09-19-commitment-dependencies",
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS commitment_dependencies (
        commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
        blocked_by_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (commitment_id, blocked_by_id),
        CHECK (commitment_id != blocked_by_id)
      );
      CREATE INDEX IF NOT EXISTS idx_commitment_dependencies_user
        ON commitment_dependencies(user_id, commitment_id);
    `);
  },
};

const permissionGrants: Migration = {
  version: "2026-09-19-permission-grants",
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS permission_grants (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        PRIMARY KEY (user_id, scope)
      );
    `);
  },
};

const actionExecution: Migration = {
  version: "2026-09-19-action-execution",
  async up(db) {
    await addColumnIfMissing(
      db,
      "action_proposals",
      "action_version",
      "INTEGER NOT NULL DEFAULT 1"
    );
    await addColumnIfMissing(db, "action_proposals", "idempotency_key", "TEXT");
    await addColumnIfMissing(
      db,
      "action_proposals",
      "execution_status",
      "TEXT NOT NULL DEFAULT 'pending'"
    );
    await addColumnIfMissing(db, "action_proposals", "execution_leased_until", "TEXT");
    await addColumnIfMissing(db, "action_proposals", "executed_at", "TEXT");
    await addColumnIfMissing(db, "action_proposals", "result", "TEXT");
    await addColumnIfMissing(db, "action_proposals", "error", "TEXT");
  },
};

const memorySearch: Migration = {
  version: "2026-09-19-memory-search",
  async up(db) {
    await addColumnIfMissing(db, "memories", "search_text", "TEXT");
    await db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
        memory_id UNINDEXED,
        search_text,
        tokenize = 'unicode61'
      );
    `);
  },
};

const classificationSignals: Migration = {
  version: "2026-09-19-classification-signals",
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS classification_signals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        term TEXT NOT NULL,
        mode TEXT NOT NULL,
        hits INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (mode IN ('bug', 'task', 'note')),
        UNIQUE (user_id, term, mode)
      );
      CREATE INDEX IF NOT EXISTS idx_classification_signals_user_term
        ON classification_signals(user_id, term);
    `);
  },
};

export const MIGRATIONS: Migration[] = [
  workClassificationV1,
  progressiveCaptureColumns,
  memoryEvolution,
  actionGate,
  autonomySettings,
  workMigration,
  commitmentDependencies,
  permissionGrants,
  actionExecution,
  memorySearch,
  classificationSignals,
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
