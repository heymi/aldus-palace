/**
 * Storage port.
 *
 * The port is intentionally async so that implementations backed by
 * asynchronous drivers (e.g. Postgres) can satisfy it later without a
 * breaking change. The bundled adapters (better-sqlite3, Durable Object
 * SQLite) resolve synchronously under the hood.
 */

export type SqlRunResult = {
  changes: number;
};

export interface SqlStatement {
  all(...bindings: unknown[]): Promise<unknown[]>;
  get(...bindings: unknown[]): Promise<unknown>;
  run(...bindings: unknown[]): Promise<SqlRunResult>;
}

export interface SqlDatabase {
  prepare(query: string): SqlStatement;
  /** Execute raw SQL (DDL or multi-statement). */
  exec(query: string): Promise<void>;
  /** Run `callback` inside a transaction; the returned function performs the work. */
  transaction<T>(callback: () => Promise<T>): () => Promise<T>;
}

export function nowIso(): string {
  return new Date().toISOString();
}
