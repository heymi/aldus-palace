import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initialize } from "@aldus-palace/core";
import type {
  SqlDatabase,
  SqlRunResult,
  SqlStatement,
} from "@aldus-palace/core/db/port";

const dirname = path.dirname(fileURLToPath(import.meta.url));

class LocalStatement implements SqlStatement {
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

export class LocalDatabase implements SqlDatabase {
  constructor(readonly sqlite: Database.Database) {}

  prepare(query: string): SqlStatement {
    return new LocalStatement(this.sqlite.prepare(query));
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
          // ignore rollback failures; surface the original error
        }
        throw error;
      }
    };
  }
}

/**
 * Open (and migrate) the local SQLite database.
 * Defaults to `./data/aldus.db`; override with `DATABASE_PATH`.
 */
export async function openLocalDb(
  dbPath = process.env.DATABASE_PATH ?? "./data/aldus.db"
): Promise<LocalDatabase> {
  const resolved = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const database = new Database(resolved);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  const db = new LocalDatabase(database);
  await initialize(db);
  return db;
}

export { dirname as serverDir };
