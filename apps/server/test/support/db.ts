/**
 * Test-only helpers.
 *
 * The suites exercise the same `SqliteDatabase` adapter that production uses,
 * so the port contract is covered by every test.
 *
 * better-sqlite3 handles are closed on process exit: the native finalizer can
 * abort after the V8 environment is torn down (observed under Node 24), and
 * closing explicitly is both cheaper and deterministic.
 */

import Database from "better-sqlite3";
import {
  SqliteDatabase,
  openSqliteDatabase,
  type SqliteHandle,
} from "@aldus-palace/core/db/sqlite";

export { SqliteDatabase as SqliteTestDatabase };

const openHandles: Array<{ close?: () => void }> = [];

function track<T extends { close?: () => void }>(handle: T): T {
  openHandles.push(handle);
  return handle;
}

process.on("exit", () => {
  for (const handle of openHandles) {
    try {
      handle.close?.();
    } catch {
      // nothing useful to do while exiting
    }
  }
});

/** A raw better-sqlite3 handle, for tests that need to build a partial schema. */
export function rawSqlite(path = ":memory:"): SqliteHandle {
  return track(new Database(path)) as unknown as SqliteHandle;
}

export async function createTestDb(): Promise<SqliteDatabase> {
  return track(await openSqliteDatabase(":memory:", { wal: false }));
}

export const TEST_NOW = "2026-07-19T04:00:00.000Z";
