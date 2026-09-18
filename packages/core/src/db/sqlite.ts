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
  /**
   * Prepared statements are cached per SQL string.
   *
   * Two reasons: preparing on every call is the single biggest cost in hot
   * paths, and short-lived wrapper objects make the NativeStatement finalizer
   * run during GC — which can abort the process if it happens while the V8
   * environment is being torn down (observed under Node 24). Keeping them
   * referenced for the lifetime of the database avoids both.
   */
  private readonly statements = new Map<string, SqliteStatement>();

  constructor(readonly handle: SqliteHandle) {}

  prepare(query: string): SqlStatement {
    const cached = this.statements.get(query);
    if (cached) return cached;
    const statement = new SqliteStatement(this.handle.prepare(query));
    this.statements.set(query, statement);
    return statement;
  }

  async exec(query: string): Promise<void> {
    this.handle.exec(query);
  }

  /** Close the underlying handle. Safe to call once; tests call this on exit. */
  close(): void {
    this.handle.close?.();
  }

  /** Number of distinct SQL statements prepared so far (diagnostics/tests). */
  get preparedStatementCount(): number {
    return this.statements.size;
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
  // Another process may hold the write lock (e.g. two MCP profiles, or the
  // server plus an MCP client on the same file). Wait instead of failing.
  handle.pragma("busy_timeout = 5000");

  const db = new SqliteDatabase(handle);
  if (migrate) await initialize(db);
  return db;
}
