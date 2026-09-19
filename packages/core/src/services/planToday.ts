/**
 * Fill empty Today from unscheduled work.
 *
 * Policy (product):
 * - Only when there is NO explicit day arrangement yet (no window/deadline/slot for today).
 * - Prefer concrete small bugs / fixes over vague research or big design epics.
 * - Use project context for importance; optional LLM re-rank when available.
 * - Persist ai_slot_* for today so the choice is stable across refreshes.
 */

import type { SqlDatabase } from "../db/port.js";
import { getLocalParts, localDayWindow, zonedLocalToIso } from "../lib/time.js";
import type { LLMProvider } from "../providers/types.js";
import { DEFAULT_LOCALE, pick, type Locale } from "../lib/locale.js";
import { nowIso } from "../db/port.js";

export type PlanTodayResult = {
  picked: Array<{ id: string; title: string; reason: string; score: number }>;
  persisted: number;
};

const MAX_PICKS = 3;
const MIN_SCORE = 28;

function isUntimed(c: Record<string, unknown>): boolean {
  return !c.window_start && !c.window_end && !c.deadline && !c.ai_slot_start;
}

/** Concrete bug / small fix language (zh+en). */
export function isBugLike(title: string): boolean {
  return /修复|修正|bug|崩溃|无法|不能|坏了|反了|错误|异常|闪退|卡死|选不了|复制|同步逻辑|漏了|丢了|fix|broken|crash|cannot|doesn't work|doesn't|unable/i.test(
    title
  );
}

/** Small executable work vs epic. */
export function isSmallConcrete(title: string): boolean {
  const t = title.trim();
  if (t.length > 56) return false;
  if (/至少\s*\d|研究|市场|可行性|受众细分|App Store|多受众|战略|规划引擎|完整/i.test(t)) {
    return false;
  }
  return /实现|添加|支持|修复|修正|调整|改|做|加|优化一|独立搜索|侧边栏|按钮|页面|功能/i.test(
    t
  );
}

export function scoreForEmptyToday(
  c: Record<string, unknown>,
  projectName?: string | null,
  locale: Locale = DEFAULT_LOCALE
): { score: number; reasons: string[] } {
  const title = String(c.title ?? "");
  const reasons: string[] = [];
  let score = 10; // base: still open work

  if (isBugLike(title)) {
    score += 45;
    reasons.push(pick(locale, "a concrete defect to fix", "具体缺陷/修复"));
  }
  if (isSmallConcrete(title)) {
    score += 22;
    reasons.push(pick(locale, "a small executable task", "可执行小任务"));
  }
  if (/设计至少|列出\s*\d|研究|草稿|概念|启发|方案\s*\d/i.test(title)) {
    score -= 35;
    reasons.push(pick(locale, "planning or research; lower weight today", "偏规划/研究，今日降权"));
  }
  if (title.length > 70) {
    score -= 15;
    reasons.push(pick(locale, "title reads like an epic", "标题过长/偏史诗"));
  }

  const imp = Number(c.importance);
  if (!Number.isNaN(imp) && imp > 0) {
    score += Math.round(imp * 18);
    reasons.push(pick(locale, "importance", "重要性"));
  }

  // Fresher work gets a bump (last 3 days)
  if (c.created_at) {
    const ageH =
      (Date.now() - Date.parse(String(c.created_at))) / (3600 * 1000);
    if (ageH < 72) {
      score += 12;
      reasons.push(pick(locale, "added recently", "近期新增"));
    } else if (ageH > 14 * 24) {
      score -= 8;
      reasons.push(pick(locale, "older item", "较陈旧"));
    }
  }

  if (projectName && title.toLowerCase().includes(projectName.toLowerCase())) {
    score += 6;
    reasons.push(pick(locale, `belongs to ${projectName}`, `归属 ${projectName}`));
  }

  // From thought convert — mild preference (user just elevated it)
  if (c.source_thought_id) {
    score += 5;
    reasons.push(pick(locale, "came from a thought", "从想法转入"));
  }

  return { score, reasons };
}

function slotIsoForToday(
  timezone: string,
  dateKey: string,
  index: number
): { start: string; end: string } {
  // Stagger 90-minute focus blocks from 10:00 local
  const startHour = 10 + index * 2;
  const endHour = startHour + 1;
  const sh = String(Math.min(startHour, 17)).padStart(2, "0");
  const eh = String(Math.min(endHour, 18)).padStart(2, "0");
  return {
    start: zonedLocalToIso(`${dateKey}T${sh}:00:00`, timezone),
    end: zonedLocalToIso(`${dateKey}T${eh}:00:00`, timezone),
  };
}

async function llmRerank(
  llm: LLMProvider,
  candidates: Array<{ id: string; title: string; score: number; reasons: string[] }>,
  projects: Array<{ name: string; description?: string | null }>
): Promise<string[] | null> {
  if (candidates.length <= 1) return candidates.map((c) => c.id);
  try {
    const reply = await llm.complete(
      [
        {
          role: "system",
          content: `You plan a light personal workday. JSON only:
{"ids":["cmt_..."],"notes":"short"}
Pick up to ${MAX_PICKS} commitment ids for TODAY from the list.
Rules:
- Prefer concrete bugs/fixes and small executable tasks
- Deprioritize vague research, multi-audience marketing, long design epics
- If only large items exist, pick at most 1
- Use project context for importance
- Order by recommended do-order`,
        },
        {
          role: "user",
          content: JSON.stringify({
            projects,
            candidates: candidates.map((c) => ({
              id: c.id,
              title: c.title,
              heuristic_score: c.score,
              reasons: c.reasons,
            })),
          }),
        },
      ],
      { json: true }
    );
    const start = reply.indexOf("{");
    const end = reply.lastIndexOf("}");
    const text = start >= 0 ? reply.slice(start, end + 1) : reply;
    const parsed = JSON.parse(text) as { ids?: string[] };
    const ids = (parsed.ids ?? []).filter((id) =>
      candidates.some((c) => c.id === id)
    );
    return ids.length ? ids.slice(0, MAX_PICKS) : null;
  } catch {
    return null;
  }
}

/**
 * When Today has no scheduled work, promote untimed high-value items into today
 * via ai_slot_* persistence.
 */
export async function planEmptyToday(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  opts?: {
    llm?: LLMProvider | null;
    /** Only plan when timeline would otherwise be empty */
    force?: boolean;
    at?: Date;
    locale?: Locale;
  }
): Promise<PlanTodayResult> {
  const at = opts?.at ?? new Date();
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const local = getLocalParts(timezone, at);
  const day = localDayWindow(timezone, local.dateKey, "full");

  const open = await db
    .prepare(
      `SELECT * FROM commitments
       WHERE user_id = ? AND status NOT IN ('completed','cancelled')
       ORDER BY created_at DESC`
    )
    .all(userId) as Record<string, unknown>[];

  const alreadyScheduled = open.filter((c) => {
    if (
      overlapsDay(
        (c.window_start as string) ?? null,
        (c.window_end as string) ?? null,
        day.start,
        day.end
      )
    ) {
      return true;
    }
    if (c.deadline) {
      const p = getLocalParts(timezone, new Date(c.deadline as string));
      if (p.dateKey === local.dateKey) return true;
    }
    if (c.ai_slot_start || c.ai_slot_end) {
      return overlapsDay(
        (c.ai_slot_start as string) ?? null,
        (c.ai_slot_end as string) ?? null,
        day.start,
        day.end
      );
    }
    return false;
  });

  // Product rule: only auto-arrange when today has no other arrangement
  if (!opts?.force && alreadyScheduled.length > 0) {
    return { picked: [], persisted: 0 };
  }

  const projects = await db
    .prepare(
      `SELECT id, name, description FROM projects
       WHERE user_id = ? AND IFNULL(status,'active') != 'archived'`
    )
    .all(userId) as Array<{ id: string; name: string; description: string | null }>;
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const untimed = open.filter(isUntimed);
  const scored = untimed
    .map((c) => {
      const proj = c.project_id
        ? projectById.get(String(c.project_id))
        : undefined;
      const { score, reasons } = scoreForEmptyToday(c, proj?.name, locale);
      return {
        id: String(c.id),
        title: String(c.title ?? ""),
        score,
        reasons,
        row: c,
      };
    })
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { picked: [], persisted: 0 };

  // Cap candidates sent to LLM
  let orderedIds = scored.slice(0, 12).map((s) => s.id);
  if (opts?.llm && opts.llm.name !== "dev") {
    const reranked = await llmRerank(
      opts.llm,
      scored.slice(0, 12),
      projects.map((p) => ({ name: p.name, description: p.description }))
    );
    if (reranked?.length) orderedIds = reranked;
  }

  // Prefer at least one bug if any scored as bug
  const bugIds = scored.filter((s) => isBugLike(s.title)).map((s) => s.id);
  if (bugIds.length && !orderedIds.some((id) => bugIds.includes(id))) {
    orderedIds = [bugIds[0], ...orderedIds].slice(0, MAX_PICKS);
  }

  const pickIds = orderedIds.slice(0, MAX_PICKS);
  const t = nowIso();
  let persisted = 0;
  const picked: PlanTodayResult["picked"] = [];

  for (const [index, id] of pickIds.entries()) {
    const meta = scored.find((s) => s.id === id);
    if (!meta) continue;
    const slot = slotIsoForToday(timezone, local.dateKey, index);
    await db.prepare(
      `UPDATE commitments
       SET ai_slot_start = ?, ai_slot_end = ?, status = CASE WHEN status = 'captured' THEN 'planned' ELSE status END, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(slot.start, slot.end, t, id, userId);
    persisted++;
    picked.push({
      id,
      title: meta.title,
      reason: meta.reasons.slice(0, 3).join(" · ") || pick(locale, "ready to move today", "今日可推进"),
      score: meta.score,
    });
  }

  return { picked, persisted };
}

function overlapsDay(
  windowStart: string | null,
  windowEnd: string | null,
  dayStartIso: string,
  dayEndIso: string
): boolean {
  if (!windowStart && !windowEnd) return false;
  const ws = windowStart ? Date.parse(windowStart) : Date.parse(dayStartIso);
  const we = windowEnd ? Date.parse(windowEnd) : Date.parse(dayEndIso);
  const ds = Date.parse(dayStartIso);
  const de = Date.parse(dayEndIso);
  return ws <= de && we >= ds;
}
