import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { newId } from "./id.js";
import { memoryRetrievalScore } from "./memoryValue.js";
import { retrieveMemoryIds } from "./retriever.js";

export function normalizeConceptName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getOrCreateConcept(
  db: SqlDatabase,
  userId: string,
  name: string,
  description?: string | null
): Promise<{ id: string; name: string; created: boolean }> {
  const display = name.trim();
  const normalized = normalizeConceptName(display);
  if (!normalized) throw new Error("empty_concept_name");

  const existing = await db
    .prepare(
      `SELECT id, name FROM concepts WHERE user_id = ? AND normalized_name = ?`
    )
    .get(userId, normalized) as { id: string; name: string } | undefined;

  if (existing) {
    await db.prepare(
      `UPDATE concepts SET last_used_at = ?, updated_at = ? WHERE id = ?`
    ).run(nowIso(), nowIso(), existing.id);
    return { id: existing.id, name: existing.name, created: false };
  }

  const id = newId("cpt");
  const t = nowIso();
  await db.prepare(
    `INSERT INTO concepts (id, user_id, name, normalized_name, description, importance, last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0.5, ?, ?, ?)`
  ).run(id, userId, display, normalized, description ?? null, t, t, t);
  return { id, name: display, created: true };
}

export async function linkMemoryToConcepts(
  db: SqlDatabase,
  userId: string,
  memoryId: string,
  conceptNames: string[],
  relationshipType = "related_to"
): Promise<Array<{ id: string; name: string }>> {
  const linked: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  for (const raw of conceptNames) {
    const n = raw.trim();
    if (!n) continue;
    const key = normalizeConceptName(n);
    if (seen.has(key)) continue;
    seen.add(key);
    const c = await getOrCreateConcept(db, userId, n);
    await db.prepare(
      `INSERT OR IGNORE INTO memory_concepts (memory_id, concept_id, relationship_type, strength)
       VALUES (?, ?, ?, 0.7)`
    ).run(memoryId, c.id, relationshipType);
    linked.push({ id: c.id, name: c.name });
  }
  return linked;
}

export async function conceptsForMemory(
  db: SqlDatabase,
  memoryId: string
): Promise<Array<{ id: string; name: string }>> {
  return await db
    .prepare(
      `SELECT c.id, c.name FROM concepts c
       INNER JOIN memory_concepts mc ON mc.concept_id = c.id
       WHERE mc.memory_id = ?`
    )
    .all(memoryId) as Array<{ id: string; name: string }>;
}

export async function listConcepts(
  db: SqlDatabase,
  userId: string
): Promise<Array<Record<string, unknown>>> {
  return await db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM memory_concepts mc WHERE mc.concept_id = c.id) as memory_count
       FROM concepts c WHERE c.user_id = ?
       ORDER BY c.last_used_at DESC NULLS LAST, c.created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;
}

/** Active memories relevant to current input text (full-text + value). */
export async function retrieveActiveMemoriesForContext(
  db: SqlDatabase,
  userId: string,
  input: string,
  limit = 12
): Promise<Array<Record<string, unknown> & { concepts: Array<{ id: string; name: string }> }>> {
  // Full-text first: FTS5 (bm25) orders the matches, then level, decay and value
  // re-rank them. See docs/RETRIEVER.md. A malformed query must not fail the
  // capture: fall through to the keyword pass instead.
  let ftsIds: string[] = [];
  try {
    ftsIds = await retrieveMemoryIds(db, userId, input, {
      limit: Math.max(limit, 12) * 2,
    });
  } catch {
    ftsIds = [];
  }
  if (ftsIds.length) {
    const placeholders = ftsIds.map(() => "?").join(",");
    const hits = (await db
      .prepare(
        `SELECT * FROM memories
         WHERE user_id = ? AND status = 'active' AND id IN (${placeholders})`
      )
      .all(userId, ...ftsIds)) as Array<Record<string, unknown>>;
    const byId = new Map(hits.map((row) => [row.id as string, row]));
    const ranked = ftsIds
      .map((id, index) => ({ row: byId.get(id), index }))
      .filter(
        (entry): entry is { row: Record<string, unknown>; index: number } =>
          entry.row !== undefined
      )
      .map(({ row, index }) => ({
        row,
        score: memoryRetrievalScore(
          {
            type: String(row.type ?? ""),
            updated_at: row.updated_at as string | null,
            importance: row.importance as number | null,
            source: row.source as string | null,
            project_id: row.project_id as string | null,
          },
          // bm25 already ordered them; keep the order as the keyword signal.
          { now: new Date(), keywordScore: Math.max(0.5, 10 - index) }
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return Promise.all(
      ranked.map(async ({ row }) => ({
        ...row,
        concepts: await conceptsForMemory(db, row.id as string),
      }))
    );
  }

  // Fallback: no full-text hit. Keyword overlap over the most recent rows.
  const rows = await db
    .prepare(
      `SELECT * FROM memories WHERE user_id = ? AND status = 'active'
       ORDER BY importance DESC NULLS LAST, updated_at DESC LIMIT 40`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const lower = input.toLowerCase();
  const tokens = lower
    .split(/[\s,，。！？、；;:：]+/)
    .filter((t) => t.length >= 2)
    .slice(0, 40);

  const scored = rows.map((r) => {
    const content = String(r.content ?? "").toLowerCase();
    let keywordScore = 0;
    for (const t of tokens) {
      if (content.includes(t)) keywordScore += 2;
    }
    // Level, decay and value weigh the keyword match: a fresh principle holds
    // more influence than an old experience.
    const score = memoryRetrievalScore(
      {
        type: String(r.type ?? ""),
        updated_at: r.updated_at as string | null,
        importance: r.importance as number | null,
        source: r.source as string | null,
        project_id: r.project_id as string | null,
      },
      { now: new Date(), keywordScore }
    );
    return { row: r, score, matched: keywordScore > 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  // A positive floor means `score > 0` is always true, so match on the keyword
  // hit itself: when nothing matched, return principles and preferences rather
  // than an arbitrary slice of the store.
  const top = scored.filter((s) => s.matched).slice(0, limit);
  const picked =
    top.length > 0
      ? top
      : scored
          .filter(
            (s) =>
              s.row.type === "principle" ||
              s.row.type === "preference" ||
              s.row.type === "project_context"
          )
          .slice(0, Math.min(6, limit));

  return Promise.all(
    picked.map(async ({ row }) => ({
      ...row,
      concepts: await conceptsForMemory(db, row.id as string),
    }))
  );
}

export function formatMemoryContextBlock(
  memories: Array<Record<string, unknown> & { concepts?: Array<{ name: string }> }>
): string {
  if (!memories.length) return "";
  const lines = memories.map((m, i) => {
    const concepts = (m.concepts ?? []).map((c) => c.name).join(", ");
    const tail = concepts ? ` [concepts: ${concepts}]` : "";
    return `${i + 1}. (${m.type}) ${m.content}${tail}`;
  });
  return (
    "Active user memories (confirmed — respect these):\n" + lines.join("\n")
  );
}

/** Full project cards for grounding transfer-learning (who/what the product is). */
export function formatProjectsContextBlock(
  projects: Array<{
    name: string;
    description?: string | null;
    brief?: string | null;
    aliases?: string | null;
  }>
): string {
  if (!projects.length) return "";
  const blocks = projects.map((p, i) => {
    let aliases = "";
    if (p.aliases) {
      try {
        const a = JSON.parse(p.aliases);
        aliases = Array.isArray(a) ? a.join(", ") : String(p.aliases);
      } catch {
        aliases = String(p.aliases);
      }
    }
    const desc = (p.description || "").trim();
    const brief = (p.brief || "").trim();
    const al = aliases ? `aliases: ${aliases}` : "";
    const head = [`${i + 1}. ${p.name}`, al].filter(Boolean).join(" | ");
    const parts = [head];
    if (desc) parts.push(`  one-liner: ${desc}`);
    if (brief) {
      // Cap so prompt stays usable; full brief is the product ground truth
      const clipped = brief.length > 2500 ? brief.slice(0, 2500) + "…" : brief;
      parts.push(`  BRIEF (authoritative product context — judge memory & transfer against this):\n${clipped}`);
    } else if (!desc) {
      parts.push("  (no brief yet — stay in-category; do not invent verticals)");
    }
    return parts.join("\n");
  });
  return (
    "User's products / projects (GROUNDING — when applying external case studies to a named product, audiences and value props MUST fit THIS product domain, not the case-study product).\n" +
    "Prefer BRIEF over one-liner when present. Use brief to decide what is stable product truth vs one-off creative exploration.\n" +
    blocks.join("\n\n")
  );
}

/**
 * Prefer project_context memories for projects mentioned in the input.
 */
export function boostProjectMemories(
  memories: Array<Record<string, unknown> & { concepts: Array<{ id: string; name: string }> }>,
  input: string,
  projectNames: string[]
): Array<Record<string, unknown> & { concepts: Array<{ id: string; name: string }> }> {
  const lower = input.toLowerCase();
  const mentioned = projectNames.filter((n) => lower.includes(n.toLowerCase()));
  if (!mentioned.length) return memories;
  return [...memories].sort((a, b) => {
    const score = (m: Record<string, unknown>) => {
      let s = 0;
      const c = String(m.content ?? "").toLowerCase();
      if (m.type === "project_context") s += 3;
      for (const n of mentioned) {
        if (c.includes(n.toLowerCase())) s += 5;
      }
      return s;
    };
    return score(b) - score(a);
  });
}

/**
 * Suggest concept names from memory content / type (rule-based).
 */
export function suggestConceptNamesForMemory(
  type: string,
  content: string
): string[] {
  const names: string[] = [];
  const c = content;

  if (/简洁|简单|不复杂|minimal|simplicity/i.test(c)) names.push("简洁");
  if (/隐私|privacy/i.test(c)) names.push("隐私");
  if (/原生|native/i.test(c)) names.push("原生体验");
  if (/辅助|assist|不主导|dominate/i.test(c)) names.push("AI 辅助而非主导");
  if (/mac\s*only|仅\s*mac|不做\s*windows/i.test(c)) names.push("Mac-only");
  if (/邮件|email|orvia/i.test(c)) names.push("邮件产品");
  if (/相册|照片|aerolens/i.test(c)) names.push("相册产品");

  if (type === "principle" && names.length === 0) names.push("原则");
  if (type === "preference" && names.length === 0) names.push("偏好");
  if (type === "project_context" && names.length === 0) names.push("项目背景");
  if (type === "decision" && names.length === 0) names.push("决策");

  return [...new Set(names)].slice(0, 4);
}
