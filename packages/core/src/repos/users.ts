import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { newId } from "../lib/id.js";
import type { User } from "../domain/types.js";

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: (row.name as string | null) ?? null,
    timezone: row.timezone as string,
    language: row.language as string,
    calendar_write_enabled: Boolean(row.calendar_write_enabled),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getUserById(db: SqlDatabase, id: string): Promise<User | null> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUser(row) : null;
}

/**
 * Set the language the runtime writes in (capture cards, action summaries,
 * rule-based memory wording). The caller owns validation.
 */
export async function setUserLanguage(
  db: SqlDatabase,
  id: string,
  language: string
): Promise<User | null> {
  const next = language.trim();
  if (!next) return getUserById(db, id);
  await db
    .prepare("UPDATE users SET language = ?, updated_at = ? WHERE id = ?")
    .run(next, nowIso(), id);
  return getUserById(db, id);
}

export async function ensureDevUser(
  db: SqlDatabase,
  opts: {
    name: string;
    timezone: string;
    language: string;
  }
): Promise<User> {
  const existing = await db
    .prepare("SELECT * FROM users ORDER BY created_at ASC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  if (existing) return mapUser(existing);

  const id = newId("user");
  const t = nowIso();
  await db.prepare(
    `INSERT INTO users (id, name, timezone, language, calendar_write_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run(id, opts.name, opts.timezone, opts.language, t, t);

  return (await getUserById(db, id))!;
}
