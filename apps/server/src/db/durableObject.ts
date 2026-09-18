import type {
  SqlDatabase,
  SqlRunResult,
  SqlStatement,
} from "@aldus-palace/core/db/port";

class DurableObjectStatement implements SqlStatement {
  constructor(
    private readonly sql: SqlStorage,
    private readonly query: string
  ) {}

  async all(...bindings: unknown[]): Promise<unknown[]> {
    return this.sql.exec(this.query, ...bindings).toArray() as unknown[];
  }

  async get(...bindings: unknown[]): Promise<unknown> {
    return this.sql.exec(this.query, ...bindings).toArray()[0];
  }

  async run(...bindings: unknown[]): Promise<SqlRunResult> {
    const cursor = this.sql.exec(this.query, ...bindings);
    return { changes: cursor.rowsWritten };
  }
}

/**
 * Durable Object SQLite adapter.
 *
 * One named object instance backs the whole (single-user) database, which is
 * why the runtime is fast but intentionally not horizontally partitioned.
 */
export class DurableObjectDatabase implements SqlDatabase {
  constructor(private readonly storage: DurableObjectStorage) {}

  prepare(query: string): SqlStatement {
    return new DurableObjectStatement(this.storage.sql, query);
  }

  async exec(query: string): Promise<void> {
    this.storage.sql.exec(query);
  }

  transaction<T>(callback: () => Promise<T>): () => Promise<T> {
    return async () => {
      this.storage.sql.exec("BEGIN");
      try {
        const result = await callback();
        this.storage.sql.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.storage.sql.exec("ROLLBACK");
        } catch {
          // ignore rollback failures; surface the original error
        }
        throw error;
      }
    };
  }
}
