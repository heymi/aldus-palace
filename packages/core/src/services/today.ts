import type { SqlDatabase } from "../db/port.js";
import { classifyDay, type DayPlanItem } from "../lib/dayPlan.js";
import { DEFAULT_LOCALE, pick, type Locale } from "../lib/locale.js";
import { scoreNow } from "../lib/nowScore.js";
import { planCapacityMinutes } from "../lib/planCapacity.js";
import { getLocalParts, localDayWindow } from "../lib/time.js";

export type TodayPayload = {
  date_key: string;
  timezone: string;
  now: Record<string, unknown> | null;
  timeline: Array<Record<string, unknown> & { kind_label: string }>;
  risks: Array<Record<string, unknown>>;
  /** Preview only (max 3) — full list is under 要做的事 */
  unscheduled: Array<Record<string, unknown>>;
  unscheduled_total: number;
  unscheduled_from_thought_total: number;
  summary: string;
  /** The morning classification of the day's work. */
  plan?: { core: string[]; optional: string[]; deferred: string[] };
  /** AI/rules filled empty day from untimed work */
  auto_planned?: Array<{ id: string; title: string; reason: string }>;
  planning: {
    mode: "balanced" | "high_capacity" | "paused";
    effective_cap: 5 | 10;
    completed_today: number;
    auto_fill_paused: boolean;
  };
};

const UNSCHEDULED_PREVIEW = 3;

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

function isRisk(c: Record<string, unknown>, nowMs: number): boolean {
  if (c.status === "risk") return true;
  if (c.status === "completed" || c.status === "cancelled") return false;
  if (c.deadline) {
    const dl = Date.parse(c.deadline as string);
    if (!Number.isNaN(dl) && dl - nowMs <= 24 * 3600 * 1000) return true;
  }
  return false;
}

type TimelineItem = Record<string, unknown> & { kind_label: string };

/**
 * NOW priority (P0):
 * 1. started and not completed
 * 2. ai_slot covers now
 * 3. deadline today / risk
 * 4. first item on today's timeline
 * 5. null (do NOT use random unscheduled as NOW)
 */
function pickNow(
  open: Record<string, unknown>[],
  timeline: TimelineItem[],
  nowMs: number,
  dayStart: string,
  dayEnd: string,
  locale: Locale,
  context: { contextProjectId: string | null; availableMinutes: number }
): Record<string, unknown> | null {
  const started = open.find((c) => c.started_at && c.status !== "completed");
  if (started) {
    return {
      ...started,
      kind_label: pick(locale, "In progress", "进行中"),
      now_reason: ["进行中"],
    };
  }

  const covering = timeline.find((c) => {
    const s = c.ai_slot_start as string | undefined;
    const e = c.ai_slot_end as string | undefined;
    if (!s || !e) return false;
    const a = Date.parse(s);
    const b = Date.parse(e);
    return a <= nowMs && nowMs <= b;
  });
  if (covering) {
    return {
      ...covering,
      kind_label: covering.kind_label || pick(locale, "Suggested slot", "AI 建议时段"),
      now_reason: ["当前时段"],
    };
  }

  const dueToday = open.find((c) => {
    if (!c.deadline) return false;
    return overlapsDay(
      c.deadline as string,
      c.deadline as string,
      dayStart,
      dayEnd
    );
  });
  if (dueToday) {
    return {
      ...dueToday,
      kind_label: pick(locale, "Due today", "今日截止"),
      now_reason: ["今日截止"],
    };
  }

  const risk = open.find((c) => isRisk(c, nowMs));
  if (risk) {
    return {
      ...risk,
      kind_label: pick(locale, "At risk", "有风险"),
      now_reason: ["有风险"],
    };
  }

  // Now is the best current action, not the first on the timeline.
  if (timeline.length) {
    const scored = timeline
      .map((item) => ({
        item,
        ...scoreNow({
          importance: item.importance as number | null,
          deadline: (item.deadline as string | null) ?? null,
          status: (item.status as string | null) ?? null,
          projectId: (item.project_id as string | null) ?? null,
          durationMinutes: item.duration_minutes as number | null,
          availableMinutes: context.availableMinutes,
          contextProjectId: context.contextProjectId,
          at: new Date(nowMs),
        }),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    return {
      ...best.item,
      kind_label:
        best.item.kind_label || pick(locale, "Planned today", "今日安排"),
      now_reason: best.reasons,
    };
  }

  // No silent unscheduled NOW
  return null;
}

/**
 * Assemble Today view.
 * Unscheduled is preview-only (Top 3); full list lives in 要做的事.
 * When today has no explicit schedule, AI/rules may promote untimed work into timeline.
 */
export async function buildToday(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  at = new Date(),
  locale: Locale = DEFAULT_LOCALE
): Promise<TodayPayload> {
  const local = getLocalParts(timezone, at);
  const day = localDayWindow(timezone, local.dateKey, "full");
  const nowMs = at.getTime();

  const all = await db
    .prepare(
      `SELECT * FROM commitments WHERE user_id = ? AND status NOT IN ('cancelled') ORDER BY created_at DESC`
    )
    .all(userId) as Record<string, unknown>[];

  const open = all.filter((c) => c.status !== "completed");
  const assignmentRows = await db
    .prepare(
      `SELECT commitment_id, source, status, reason FROM today_assignments
       WHERE user_id = ? AND date_key = ? AND status IN ('active', 'removed')`
    )
    .all(userId, local.dateKey) as Array<{
    commitment_id: string;
    source: "user" | "agent";
    status: "active" | "removed";
    reason: string | null;
  }>;
  const activeIds = new Set(
    assignmentRows
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => assignment.commitment_id)
  );
  const removedIds = new Set(
    assignmentRows
      .filter(
        (assignment) =>
          assignment.status === "removed" &&
          !activeIds.has(assignment.commitment_id)
      )
      .map((assignment) => assignment.commitment_id)
  );
  const assignments = assignmentRows.filter(
    (assignment) => assignment.status === "active"
  );
  const displayOpen = open.filter((row) => !removedIds.has(String(row.id)));
  const assignmentById = new Map(
    assignments.map((assignment) => [assignment.commitment_id, assignment])
  );
  const autoPlanned: TodayPayload["auto_planned"] = assignments.flatMap(
    (assignment) => {
      if (assignment.source !== "agent") return [];
      const commitment = displayOpen.find(
        (row) => row.id === assignment.commitment_id
      );
      if (!commitment) return [];
      return [{
        id: assignment.commitment_id,
        title: String(commitment.title ?? ""),
        reason: assignment.reason ?? pick(locale, "Ready to move today", "今日可推进"),
      }];
    }
  );

  const forToday = displayOpen.filter((c) =>
    overlapsDay(
      (c.window_start as string) ?? null,
      (c.window_end as string) ?? null,
      day.start,
      day.end
    )
  );

  const withSlotToday = displayOpen.filter((c) => {
    const s = c.ai_slot_start as string | null;
    const e = c.ai_slot_end as string | null;
    if (!s && !e) return false;
    return overlapsDay(s, e, day.start, day.end);
  });

  const timelineMap = new Map<string, Record<string, unknown>>();
  const assignedRows = displayOpen.filter((row) =>
    assignmentById.has(String(row.id))
  );
  for (const c of [...forToday, ...withSlotToday, ...assignedRows]) {
    timelineMap.set(c.id as string, c);
  }
  const timelineBase = [...timelineMap.values()];

  timelineBase.sort((a, b) => {
    const ta =
      Date.parse(
        (a.ai_slot_start as string) || (a.window_start as string) || "0"
      ) || 0;
    const tb =
      Date.parse(
        (b.ai_slot_start as string) || (b.window_start as string) || "0"
      ) || 0;
    return ta - tb;
  });

  const autoIds = new Set((autoPlanned ?? []).map((p) => p.id));

  const labelFor = (c: Record<string, unknown>, base: string): string => {
    if (autoIds.has(String(c.id))) {
      const reason = autoPlanned?.find((p) => p.id === c.id)?.reason;
      return reason
      ? pick(locale, `Suggested today · ${reason}`, `今日建议 · ${reason}`)
      : pick(locale, "Suggested today", "今日建议");
    }
    if (c.source_thought_id)
      return `${base} · ${pick(locale, "from a thought", "从想法转入")}`;
    return base;
  };

  const timeline: TimelineItem[] = timelineBase.map((c) => {
    let kind_label = pick(locale, "Planned today", "今日有安排");
    if (c.ai_slot_start) kind_label = pick(locale, "Suggested slot", "AI 建议时段");
    if (c.deadline) kind_label = pick(locale, "Has a deadline", "有截止");
    if (c.started_at) kind_label = pick(locale, "In progress", "进行中");
    return { ...c, kind_label: labelFor(c, kind_label) } as TimelineItem;
  });

  // deadline on today but not already in timeline
  for (const c of displayOpen) {
    if (timelineMap.has(c.id as string)) continue;
    if (!c.deadline) continue;
    const p = getLocalParts(timezone, new Date(c.deadline as string));
    if (p.dateKey === local.dateKey) {
      timeline.push({
        ...c,
        kind_label: labelFor(c, pick(locale, "Due today", "今日截止")),
      } as TimelineItem);
      timelineMap.set(c.id as string, c);
    }
  }

  const risks = open.filter((c) => isRisk(c, nowMs));

  const timelineIds = new Set(timeline.map((t) => t.id as string));
  const unscheduledAll = open.filter((c) => !timelineIds.has(c.id as string))
    .map(
      (c) =>
        ({
          ...c,
          kind_label: c.source_thought_id
        ? pick(locale, "from a thought", "从想法转入")
        : pick(locale, "Unscheduled", "未排期"),
        }) as TimelineItem
    )
    .sort((a, b) => {
      const at = a.source_thought_id ? 1 : 0;
      const bt = b.source_thought_id ? 1 : 0;
      if (at !== bt) return bt - at;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });

  // Refresh open after plan may have written slots
  const openAfter = await db
    .prepare(
      `SELECT * FROM commitments WHERE user_id = ? AND status NOT IN ('cancelled','completed')`
    )
    .all(userId) as Record<string, unknown>[];
  const displayOpenAfter = openAfter.filter(
    (row) => !removedIds.has(String(row.id))
  );

  const startedItem = all.find(
    (row) =>
      row.started_at && row.status !== "completed" && row.status !== "cancelled"
  );
  const completedToday = all
    .filter(
      (row) =>
        row.status === "completed" &&
        row.completed_at &&
        Date.parse(String(row.completed_at)) >= Date.parse(day.start)
    )
    .sort(
      (a, b) =>
        Date.parse(String(b.completed_at)) - Date.parse(String(a.completed_at))
    )[0];
  const contextProjectId = ((startedItem?.project_id ?? completedToday?.project_id) ??
    null) as string | null;
  const availableMinutes = Math.max(0, (Date.parse(day.end) - nowMs) / 60000);

  let now = pickNow(displayOpenAfter, timeline, nowMs, day.start, day.end, locale, {
    contextProjectId,
    availableMinutes,
  });
  // If still no focus but we auto-planned, promote first suggestion to Now
  if (!now && timeline.length) {
    now = {
      ...timeline[0],
      kind_label: timeline[0].kind_label || pick(locale, "Suggested today", "今日建议"),
    };
  }

  // The focus item already owns the screen; listing it again reads as a bug.
  const focusId = now ? (now as { id?: unknown }).id : undefined;
  const notFocus = (c: Record<string, unknown>) => !focusId || c.id !== focusId;
  const rest = unscheduledAll.filter(notFocus);
  const fromThought = rest.filter((c) => c.source_thought_id).length;
  const preview = rest.slice(0, UNSCHEDULED_PREVIEW);

  const summaryParts: string[] = [local.dateKey];
  summaryParts.push(
    now
      ? pick(locale, `focus: ${(now.title as string) ?? ""}`, `焦点：${(now.title as string) ?? ""}`)
      : pick(locale, "no focus yet", "暂无焦点")
  );
  summaryParts.push(
    pick(
      locale,
      `${timeline.length} planned · ${rest.length} unscheduled` +
        (fromThought ? ` (${fromThought} from thoughts)` : ""),
      `今日安排 ${timeline.length} · 未排期 ${rest.length}` +
        (fromThought ? `（想法转入 ${fromThought}）` : "")
    )
  );
  if (autoPlanned?.length) {
    summaryParts.push(
    pick(locale, `${autoPlanned.length} filled in`, `已智能安排 ${autoPlanned.length} 件`)
  );
  }

  const profile = await db
    .prepare(
      `SELECT mode, last_behavior_at FROM planning_profiles WHERE user_id = ?`
    )
    .get(userId) as
    | {
        mode: "balanced" | "high_capacity" | "paused";
        last_behavior_at: string | null;
      }
    | undefined;
  const dayState = await db
    .prepare(
      `SELECT effective_cap FROM planning_day_states
       WHERE user_id = ? AND date_key = ?`
    )
    .get(userId, local.dateKey) as { effective_cap: 5 | 10 } | undefined;
  const completed = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM commitments
       WHERE user_id = ? AND status = 'completed'
         AND completed_at >= ? AND completed_at <= ?`
    )
    .get(userId, day.start, at.toISOString()) as { count: number };
  const highCapacityIsCurrent =
    profile?.mode === "high_capacity" &&
    profile.last_behavior_at &&
    getLocalParts(timezone, new Date(profile.last_behavior_at)).dateKey ===
      local.dateKey;
  const mode =
    profile?.mode === "paused"
      ? "paused"
      : highCapacityIsCurrent
        ? "high_capacity"
        : "balanced";

  const daytime = localDayWindow(timezone, local.dateKey, "daytime");
  const plan = classifyDay(timeline as unknown as DayPlanItem[], {
    at,
    capacityMinutes: planCapacityMinutes(daytime.start, daytime.end),
  });

  return {
    date_key: local.dateKey,
    timezone,
    now,
    timeline,
    risks,
    unscheduled: preview,
    unscheduled_total: rest.length,
    unscheduled_from_thought_total: fromThought,
    summary: summaryParts.join(" · "),
    plan,
    auto_planned: autoPlanned,
    planning: {
      mode,
      effective_cap:
        dayState?.effective_cap ?? (mode === "high_capacity" ? 10 : 5),
      completed_today: Number(completed.count),
      auto_fill_paused: mode === "paused",
    },
  };
}
