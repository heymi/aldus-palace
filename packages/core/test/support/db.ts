/**
 * Test-only SQLite adapter.
 *
 * Wraps better-sqlite3 (synchronous) in the asynchronous storage port so the
 * tests exercise exactly the same contract as production adapters.
 */

import Database from "better-sqlite3";
import { initialize } from "../../src/db/migrate.js";
import type {
  SqlDatabase,
  SqlRunResult,
  SqlStatement,
} from "../../src/db/port.js";

class SqliteStatement implements SqlStatement {
  constructor(private readonly statement: Database.Statement) {}

  async all(...bindings: unknown[]): Promise<unknown[]> {
    return this.statement.all(...bindings) as unknown[];
  }

  async get(...bindings: unknown[]): Promise<unknown> {
    return this.statement.get(...bindings);
  }

  async run(...bindings: unknown[]): Promise<SqlRunResult> {
    const result = this.statement.run(...bindings);
    return { changes: result.changes };
  }
}

export class SqliteTestDatabase implements SqlDatabase {
  constructor(readonly sqlite: Database.Database) {}

  prepare(query: string): SqlStatement {
    return new SqliteStatement(this.sqlite.prepare(query));
  }

  async exec(query: string): Promise<void> {
    this.sqlite.exec(query);
  }

  transaction<T>(callback: () => Promise<T>): () => Promise<T> {
    return async () => {
      this.sqlite.exec("BEGIN");
      try {
        const result = await callback();
        this.sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.sqlite.exec("ROLLBACK");
        } catch {
          // ignore rollback failures; the original error is more useful
        }
        throw error;
      }
    };
  }
}

export async function createTestDb(): Promise<SqliteTestDatabase> {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = new SqliteTestDatabase(sqlite);
  await initialize(db);
  return db;
}

export const TEST_NOW = "2026-07-19T04:00:00.000Z";
