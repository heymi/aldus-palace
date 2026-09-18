import fs from "node:fs";
import path from "node:path";
import {
  openSqliteDatabase,
  type SqliteDatabase,
} from "@aldus-palace/core/db/sqlite";

export type LocalDatabase = SqliteDatabase;

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
  return openSqliteDatabase(resolved);
}
