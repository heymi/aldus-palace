import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { newId } from "../lib/id.js";

export async function writeActionLog(
  db: SqlDatabase,
  input: {
    user_id: string;
    actor: "user" | "agent";
    action_type: string;
    summary: string;
    reason?: string;
    entity_type?: string;
    entity_id?: string;
    payload?: unknown;
    reversible?: boolean;
  }
): Promise<string> {
  const id = newId("log");
  await db.prepare(
    `INSERT INTO action_logs
     (id, user_id, actor, action_type, summary, reason, entity_type, entity_id, payload, reversible, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.user_id,
    input.actor,
    input.action_type,
    input.summary,
    input.reason ?? null,
    input.entity_type ?? null,
    input.entity_id ?? null,
    input.payload ? JSON.stringify(input.payload) : null,
    input.reversible ? 1 : 0,
    nowIso()
  );
  return id;
}

export async function listActionLogs(
  db: SqlDatabase,
  userId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  return await db
    .prepare(
      `SELECT * FROM action_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, limit) as Record<string, unknown>[];
}
