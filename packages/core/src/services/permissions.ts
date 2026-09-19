/**
 * Progressive, fine-grained permissions.
 *
 * A scope that is absent is not granted. Reading the calendar is the only
 * default, and Memory stays private until `memory.ai_assist` or `memory.sync`
 * is granted. Grants are rows, so they are visible and revocable.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import type { Locale } from "../lib/locale.js";
import { writeActionLog } from "../repos/actionLogs.js";

export const PERMISSION_SCOPES = [
  "calendar.read",
  "calendar.create",
  "calendar.modify",
  "mail.read",
  "files.read",
  "memory.sync",
  "memory.ai_assist",
] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/** Reading the calendar is the only scope granted without asking. */
export const DEFAULT_SCOPES: PermissionScope[] = ["calendar.read"];

export function isPermissionScope(value: string): value is PermissionScope {
  return (PERMISSION_SCOPES as readonly string[]).includes(value);
}

export async function listScopes(
  db: SqlDatabase,
  userId: string
): Promise<PermissionScope[]> {
  const rows = (await db
    .prepare(
      `SELECT scope FROM permission_grants WHERE user_id = ? ORDER BY granted_at ASC`
    )
    .all(userId)) as Array<{ scope: string }>;
  return rows
    .map((row) => row.scope)
    .filter((scope): scope is PermissionScope => isPermissionScope(scope));
}

export async function hasScope(
  db: SqlDatabase,
  userId: string,
  scope: PermissionScope
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM permission_grants WHERE user_id = ? AND scope = ?`)
    .get(userId, scope);
  return Boolean(row);
}

export type PermissionResult =
  | { ok: true; scopes: PermissionScope[] }
  | { ok: false; error: string };

export async function grantScope(
  db: SqlDatabase,
  userId: string,
  scope: string,
  options: { locale?: Locale } = {}
): Promise<PermissionResult> {
  if (!isPermissionScope(scope)) return { ok: false, error: "unknown_scope" };
  await db
    .prepare(
      `INSERT OR IGNORE INTO permission_grants (user_id, scope, granted_at)
       VALUES (?, ?, ?)`
    )
    .run(userId, scope, nowIso());
  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "permission_granted",
    summary: actionSummary("permission_granted", { scope }, options.locale ?? "en"),
    entity_type: "permission",
    entity_id: scope,
    payload: { scope },
    reversible: true,
  });
  return { ok: true, scopes: await listScopes(db, userId) };
}

export async function revokeScope(
  db: SqlDatabase,
  userId: string,
  scope: string,
  options: { locale?: Locale } = {}
): Promise<PermissionResult> {
  if (!isPermissionScope(scope)) return { ok: false, error: "unknown_scope" };
  const result = await db
    .prepare(`DELETE FROM permission_grants WHERE user_id = ? AND scope = ?`)
    .run(userId, scope);
  if (result.changes === 0) return { ok: false, error: "not_granted" };
  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "permission_revoked",
    summary: actionSummary("permission_revoked", { scope }, options.locale ?? "en"),
    entity_type: "permission",
    entity_id: scope,
    payload: { scope },
    reversible: true,
  });
  return { ok: true, scopes: await listScopes(db, userId) };
}

/**
 * Grant the default scopes when the user has none yet. Reading the calendar is
 * the starting point; mail and files wait until the user asks for them.
 */
export async function ensureDefaultScopes(
  db: SqlDatabase,
  userId: string
): Promise<PermissionScope[]> {
  const existing = await listScopes(db, userId);
  if (existing.length > 0) return existing;
  for (const scope of DEFAULT_SCOPES) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO permission_grants (user_id, scope, granted_at)
         VALUES (?, ?, ?)`
      )
      .run(userId, scope, nowIso());
  }
  return await listScopes(db, userId);
}

/** Memory is private until a memory scope is granted. */
export async function memoryPermission(
  db: SqlDatabase,
  userId: string
): Promise<"private" | "sync" | "ai_assist"> {
  if (await hasScope(db, userId, "memory.ai_assist")) return "ai_assist";
  if (await hasScope(db, userId, "memory.sync")) return "sync";
  return "private";
}
