/**
 * SQLite adapter for the storage port.
 *
 * Kept out of the package root on purpose: importing `@aldus-palace/core` must
 * not require a native SQLite driver. Consumers that want the bundled adapter
 * install `better-sqlite3` and import this subpath:
 *
 *   import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";
 *
 * The public types here are structural so the generated declarations do not
 * leak `better-sqlite3` types.
 */

import { initialize } from "./migrate.js";
import type {
  SqlDatabase,
  SqlRunResult,
  SqlStatement,
} from "./port.js";

/** Minimal structural view of a `better-sqlite3` database handle. */
export type SqliteHandle = {
  prepare(query: string): {
    all(...bindings: unknown[]): unknown[];
    get(...bindings: unknown[]): unknown;
    run(...bindings: unknown[]): { changes: number };
  };
  exec(query: string): unknown;
  pragma(source: string, options?: unknown): unknown;
  close?(): void;
};

class SqliteStatement implements SqlStatement {
  constructor(private readonly statement: ReturnType<SqliteHandle["prepare"]>) {}

  async all(...bindings: unknown[]): Promise<unknown[]> {
    return this.statement.all(...bindings);
  }

  async get(...bindings: unknown[]): Promise<unknown> {
    return this.statement.get(...bindings);
  }

  async run(...bindings: unknown[]): Promise<SqlRunResult> {
    return { changes: this.statement.run(...bindings).changes };
  }
}

export class SqliteDatabase implements SqlDatabase {
  constructor(readonly handle: SqliteHandle) {}

  prepare(query: string): SqlStatement {
    return new SqliteStatement(this.handle.prepare(query));
  }

  async exec(query: string): Promise<void> {
    this.handle.exec(query);
  }

  /** Close the underlying handle. Safe to call once; tests call this on exit. */
  close(): void {
    this.handle.close?.();
  }

  transaction<T>(callback: () => Promise<T>): () => Promise<T> {
    return async () => {
      this.handle.exec("BEGIN");
      try {
        const result = await callback();
        this.handle.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.handle.exec("ROLLBACK");
        } catch {
          // ignore rollback failures; surface the original error
        }
        throw error;
      }
    };
  }
}

export type OpenSqliteOptions = {
  /** Run schema + migrations after opening (default: true). */
  migrate?: boolean;
  /** Enable WAL journaling (default: true). */
  wal?: boolean;
  /** `better-sqlite3` module; defaults to a dynamic import of "better-sqlite3". */
  driver?: (path: string) => SqliteHandle;
};

/**
 * Open (and by default migrate) a SQLite database file.
 * Pass `":memory:"` for tests.
 */
export async function openSqliteDatabase(
  path: string,
  options: OpenSqliteOptions = {}
): Promise<SqliteDatabase> {
  const { migrate = true, wal = true, driver } = options;

  let handle: SqliteHandle;
  if (driver) {
    handle = driver(path);
  } else {
    const mod = await import("better-sqlite3");
    const Database = (mod as unknown as { default: new (p: string) => SqliteHandle })
      .default;
    handle = new Database(path);
  }

  if (wal) handle.pragma("journal_mode = WAL");
  handle.pragma("foreign_keys = ON");

  const db = new SqliteDatabase(handle);
  if (migrate) await initialize(db);
  return db;
}
