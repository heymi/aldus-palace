/**
 * Memory evolution — versioning and conflict detection.
 *
 * A memory is never overwritten. When a newer statement contradicts a confirmed
 * one, the candidate is flagged with the conflict and the user decides:
 * replace (supersede), keep both, or discard. Both versions stay readable, so
 * "why do you think that about me?" always has an answer.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { actionSummary } from "../lib/actionMessages.js";
import { writeActionLog } from "../repos/actionLogs.js";
import type { MemoryRow } from "./memoryLifecycle.js";

/**
 * Derived lifecycle state. `superseded` is not stored as a status: a superseded
 * memory is archival plus a pointer to its replacement.
 */
export type MemoryState = "candidate" | "active" | "superseded" | "archived";

export function memoryState(row: {
  status?: unknown;
  superseded_by_id?: unknown;
}): MemoryState {
  if (typeof row.superseded_by_id === "string" && row.superseded_by_id) {
    return "superseded";
  }
  const status = typeof row.status === "string" ? row.status : "candidate";
  if (status === "active") return "active";
  if (status === "archived") return "archived";
  return "candidate";
}

export type MemoryConflict = {
  /** The already-confirmed memory this candidate disagrees with. */
  memory_id: string;
  memory_type: string;
  memory_content: string;
  reason: string;
  detector: "rule" | "model";
};

// --------------------------------------------------------------------------
// Rule-based detection
// --------------------------------------------------------------------------

/**
 * Topics we can reason about without a model. Deliberately small and
 * high-precision: a false "these conflict" is more annoying than a missed one,
 * because the user has to arbitrate it.
 */
const TOPICS: Array<{ key: string; label: string; re: RegExp }> = [
  {
    key: "platform",
    label: "platform scope",
    re: /移动端|手机端|ios|安卓|android|windows|mac\s*only|仅\s*mac|不做\s*mac|不做\s*windows/i,
  },
  { key: "complexity", label: "product complexity", re: /简洁|简单|复杂|minimal/i },
  { key: "privacy", label: "privacy", re: /隐私|privacy/i },
  { key: "autonomy", label: "AI autonomy", re: /主导|辅助|自主|assist|dominate|autonom/i },
  { key: "notifications", label: "notifications", re: /通知|提醒|推送|notification|push/i },
  { key: "subscription", label: "pricing model", re: /订阅|付费|免费|subscription|free tier/i },
  { key: "sync", label: "sync / cloud", re: /同步|云端|本地优先|sync|cloud|local.first/i },
];

/**
 * Negated phrases, matched as a unit so that "不要" is not read as the
 * affirmative "要" and "don't support" is not read as "support".
 */
const NEGATION_PHRASE =
  /(?:不|别|无需|不用|没有|不会|停止|放弃|禁止|拒绝)(?:要|做|再|支持|开始|继续|使用|添加|接受)?|\b(?:don'?t|doesn'?t|won'?t|didn'?t|never|no longer|stop|avoid|not)\b(?:\s+\w+)?/gi;

const AFFIRMATION =
  /\b(start|begin|keep|continue|support|accept|allow|need|want|should|add|expand|introduce)\b|开始|继续|支持|接受|允许|必须|坚持|增加|添加|引入|扩展|加上/i;

function polarity(text: string): -1 | 0 | 1 {
  const negated = new RegExp(NEGATION_PHRASE.source, "i").test(text);
  const bare = text.replace(new RegExp(NEGATION_PHRASE.source, "gi"), " ");
  const affirmed = AFFIRMATION.test(bare);
  if (negated && affirmed) return 0; // mixed stance — not a clean flip
  if (negated) return -1;
  if (affirmed) return 1;
  return 0;
}

/**
 * Detect a contradiction between two memories without a model.
 * Returns a human-readable reason when the pair flips polarity on a known topic.
 */
export function ruleConflict(
  candidate: { type: string; content: string },
  existing: { type: string; content: string }
): string | null {
  if (candidate.type !== existing.type) return null;

  const shared = TOPICS.filter(
    (topic) => topic.re.test(candidate.content) && topic.re.test(existing.content)
  );
  if (shared.length === 0) return null;

  const a = polarity(candidate.content);
  const b = polarity(existing.content);
  if (a === 0 || b === 0 || a === b) return null;

  return `opposite stance on ${shared.map((topic) => topic.label).join(", ")}`;
}

// --------------------------------------------------------------------------
// Model-based detection (optional)
// --------------------------------------------------------------------------

export type ConflictJudge = (
  candidate: { type: string; content: string },
  actives: Array<{ id: string; type: string; content: string }>
) => Promise<{ memory_id: string | null; reason?: string } | null>;

/**
 * Ask a model which (if any) confirmed memory the candidate contradicts.
 * Returns null when the model output is unusable — the caller keeps the
 * rule-based result rather than guessing.
 */
export function makeModelJudge(complete: (prompt: string) => Promise<string>): ConflictJudge {
  return async (candidate, actives) => {
    if (actives.length === 0) return null;
    const prompt = [
      "You are auditing a personal knowledge base for contradictions.",
      "Candidate memory (not yet confirmed):",
      `- [${candidate.type}] ${candidate.content}`,
      "",
      "Confirmed memories:",
      ...actives.map((memory) => `- ${memory.id} [${memory.type}] ${memory.content}`),
      "",
      "If the candidate contradicts exactly one confirmed memory, answer with JSON",
      '{"memory_id":"<id>","reason":"<short reason>"}.',
      'If it does not contradict any, answer {"memory_id":null}.',
      "Answer with JSON only.",
    ].join("\n");

    try {
      const reply = await complete(prompt);
      const start = reply.indexOf("{");
      const end = reply.lastIndexOf("}");
      if (start < 0 || end < start) return null;
      const parsed = JSON.parse(reply.slice(start, end + 1)) as {
        memory_id?: string | null;
        reason?: string;
      };
      if (!parsed.memory_id) return null;
      return { memory_id: parsed.memory_id, reason: parsed.reason };
    } catch {
      return null;
    }
  };
}

// --------------------------------------------------------------------------
// Detection entry point
// --------------------------------------------------------------------------

export async function detectMemoryConflict(
  db: SqlDatabase,
  userId: string,
  candidate: { type: string; content: string },
  options: { judge?: ConflictJudge; limit?: number } = {}
): Promise<MemoryConflict | null> {
  const actives = (await db
    .prepare(
      `SELECT id, type, content FROM memories
       WHERE user_id = ? AND status = 'active' AND superseded_by_id IS NULL
       ORDER BY importance DESC, updated_at DESC LIMIT ?`
    )
    .all(userId, options.limit ?? 20)) as Array<{
    id: string;
    type: string;
    content: string;
  }>;

  if (actives.length === 0) return null;

  if (options.judge) {
    const verdict = await options.judge(candidate, actives);
    if (verdict?.memory_id) {
      const hit = actives.find((memory) => memory.id === verdict.memory_id);
      if (hit) {
        return {
          memory_id: hit.id,
          memory_type: hit.type,
          memory_content: hit.content,
          reason: verdict.reason?.trim() || "the model flagged a contradiction",
          detector: "model",
        };
      }
    }
  }

  for (const active of actives) {
    const reason = ruleConflict(candidate, active);
    if (reason) {
      return {
        memory_id: active.id,
        memory_type: active.type,
        memory_content: active.content,
        reason,
        detector: "rule",
      };
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// Supersede
// --------------------------------------------------------------------------

export type SupersedeResult =
  | { ok: true; superseded: MemoryRow; replacement: MemoryRow }
  | { ok: false; error: "not_found" | "not_confirmed" | "same_memory" | "already_superseded" };

/**
 * Replace an older memory with a newer one. The old row is archived with a
 * pointer to its replacement; nothing is deleted.
 */
export async function supersedeMemory(
  db: SqlDatabase,
  userId: string,
  options: { oldId: string; newId: string; reason?: string }
): Promise<SupersedeResult> {
  const { oldId, newId } = options;
  if (oldId === newId) return { ok: false, error: "same_memory" };

  const oldRow = (await db
    .prepare(`SELECT * FROM memories WHERE id = ? AND user_id = ?`)
    .get(oldId, userId)) as MemoryRow | undefined;
  const newRow = (await db
    .prepare(`SELECT * FROM memories WHERE id = ? AND user_id = ?`)
    .get(newId, userId)) as MemoryRow | undefined;

  if (!oldRow || !newRow) return { ok: false, error: "not_found" };
  if (memoryState(oldRow) === "superseded") return { ok: false, error: "already_superseded" };
  if (newRow.status !== "active") return { ok: false, error: "not_confirmed" };

  const t = nowIso();
  const reason = options.reason?.trim() || null;

  const run = db.transaction(async () => {
    await db
      .prepare(
        `UPDATE memories
         SET status = 'archived', superseded_by_id = ?, supersede_reason = ?,
             conflicts_with_id = NULL, conflict_reason = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(newId, reason, t, oldId, userId);

    await db
      .prepare(
        `UPDATE memories
         SET supersedes_id = ?, conflicts_with_id = NULL, conflict_reason = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(oldId, t, newId, userId);
  });
  await run();

  await writeActionLog(db, {
    user_id: userId,
    actor: "user",
    action_type: "memory_superseded",
    summary: actionSummary("memory_superseded"),
    reason: reason ?? undefined,
    entity_type: "memory",
    entity_id: newId,
    payload: { supersedes: oldId },
  });

  const superseded = (await db
    .prepare(`SELECT * FROM memories WHERE id = ?`)
    .get(oldId)) as MemoryRow;
  const replacement = (await db
    .prepare(`SELECT * FROM memories WHERE id = ?`)
    .get(newId)) as MemoryRow;
  return { ok: true, superseded, replacement };
}

/** The full version chain for a memory, oldest first. */
export async function listMemoryVersions(
  db: SqlDatabase,
  userId: string,
  memoryId: string
): Promise<MemoryRow[]> {
  const rows = (await db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at ASC`)
    .all(userId)) as MemoryRow[];
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const successorOf = new Map<string, MemoryRow>();
  for (const row of rows) {
    const target = row.supersedes_id;
    if (typeof target === "string" && target) successorOf.set(target, row);
  }

  let start = byId.get(memoryId);
  if (!start) return [];

  // Walk back to the oldest version.
  const walkedBack = new Set<string>();
  while (!walkedBack.has(String(start.id))) {
    walkedBack.add(String(start.id));
    const previousId = start.supersedes_id;
    if (typeof previousId !== "string" || !previousId) break;
    const previous = byId.get(previousId);
    if (!previous) break;
    start = previous;
  }

  // Then forward through every replacement.
  const chain: MemoryRow[] = [];
  const visited = new Set<string>();
  let cursor: MemoryRow | undefined = start;
  while (cursor && !visited.has(String(cursor.id))) {
    visited.add(String(cursor.id));
    chain.push(cursor);
    cursor = successorOf.get(String(cursor.id));
  }
  return chain;
}

export type MemoryListState = MemoryState | "all";

/** List memories by derived state, including superseded history when asked. */
export async function listMemoriesByState(
  db: SqlDatabase,
  userId: string,
  state: MemoryListState = "candidate",
  limit = 50
): Promise<Array<MemoryRow & { state: MemoryState }>> {
  const rows = (await db
    .prepare(
      `SELECT * FROM memories WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, limit)) as MemoryRow[];

  return rows
    .map((row) => ({ ...row, state: memoryState(row) }))
    .filter((row) => state === "all" || row.state === state);
}
