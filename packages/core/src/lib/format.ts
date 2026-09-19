/**
 * Human-readable projections of the ActionCard and Today payload.
 *
 * These builders are pure: they read a payload and return text for terminals,
 * MCP tool returns and screenshots. Machine keys stay untouched, and the
 * localized strings follow the user's locale.
 */

import type { ActionCard } from "../domain/types.js";
import { DEFAULT_LOCALE, pick, plural, type Locale } from "./locale.js";

type Row = Record<string, unknown>;

/** The slice of an action proposal these builders read. */
export type ActionProposalView = {
  id?: unknown;
  action_type?: unknown;
  risk?: unknown;
  status?: unknown;
  reason?: unknown;
};

/** The slice of the autonomy state these builders read. */
export type AutonomyView = {
  score?: unknown;
  level?: unknown;
  effective_level?: unknown;
  ceiling?: unknown;
  approvals?: unknown;
  rejections?: unknown;
};

/** The slice of the Today payload these builders read. */
export type TodayViewLike = {
  date_key?: unknown;
  now?: Row | null;
  timeline?: Row[];
  risks?: Row[];
  unscheduled?: Row[];
  unscheduled_total?: unknown;
  summary?: unknown;
  planning?: {
    mode?: unknown;
    auto_fill_paused?: unknown;
  } | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function day(value: unknown): string {
  const s = text(value);
  return s ? s.slice(0, 10) : "";
}

function rowTitle(row: Row): string {
  return text(row.title) || text(row.optimized_content) || text(row.content);
}

function timeLabel(row: Row, locale: Locale): string {
  const deadline = day(row.deadline);
  if (deadline) return pick(locale, `due ${deadline}`, `截止 ${deadline}`);
  const start = day(row.window_start);
  const end = day(row.window_end);
  if (start && end) {
    return pick(locale, `window ${start} → ${end}`, `时间窗 ${start} → ${end}`);
  }
  if (start) return pick(locale, `from ${start}`, `从 ${start}`);
  const slot = day(row.ai_slot_start);
  if (slot) return pick(locale, `slot ${slot}`, `建议时段 ${slot}`);
  return "";
}

function memoryState(status: string, locale: Locale): string {
  if (status === "active") return pick(locale, "active", "已生效");
  if (status === "candidate") return pick(locale, "waiting for you", "待确认");
  return status;
}

/** One short card for a capture: summary, objects, memory states, warnings. */
export function formatActionCard(
  card: ActionCard,
  locale: Locale = DEFAULT_LOCALE
): string {
  const lines: string[] = [card.summary];

  for (const row of card.commitments) {
    const when = timeLabel(row, locale);
    const label = pick(locale, "commitment", "要做");
    lines.push(`  ${label}  ${rowTitle(row)}${when ? `  ·  ${when}` : ""}`);
  }
  for (const row of card.thoughts) {
    lines.push(`  ${pick(locale, "thought", "想法")}     ${rowTitle(row)}`);
  }
  for (const row of card.decisions) {
    lines.push(`  ${pick(locale, "decision", "决策")}    ${rowTitle(row)}`);
  }
  for (const row of card.memory_candidates) {
    const state = memoryState(text(row.status), locale);
    lines.push(`  ${pick(locale, "memory", "记忆")}      ${text(row.content)}  ·  ${state}`);
  }
  for (const clarification of card.clarifications) {
    lines.push(`  ${pick(locale, "question", "待确认")}  ${clarification.prompt}`);
  }
  for (const warning of card.warnings.slice(0, 3)) {
    lines.push(`  ! ${warning}`);
  }
  return lines.join("\n");
}

function actionState(status: string, locale: Locale): string {
  switch (status) {
    case "approved":
      return pick(locale, "approved", "已批准");
    case "notified":
      return pick(locale, "ran, recorded", "已执行并记录");
    case "proposed":
      return pick(locale, "waiting", "待决定");
    case "pending_second":
      return pick(locale, "needs a second approval", "待二次确认");
    case "rejected":
      return pick(locale, "rejected", "已拒绝");
    case "revoked":
      return pick(locale, "revoked", "已撤销");
    default:
      return status;
  }
}

/** The Action Gate queue: what is waiting, and how it was decided. */
export function formatActionProposals(
  proposals: ActionProposalView[],
  locale: Locale = DEFAULT_LOCALE,
  autonomy?: AutonomyView
): string {
  const waiting = proposals.filter(
    (row) => row.status === "proposed" || row.status === "pending_second"
  ).length;
  const lines = [
    waiting > 0
      ? pick(locale, `Actions · ${waiting} waiting`, `动作 · ${waiting} 项待决定`)
      : pick(
          locale,
          `Actions · ${proposals.length} recorded`,
          `动作 · 已记录 ${proposals.length} 项`
        ),
  ];
  for (const row of proposals.slice(0, 10)) {
    const risk = text(row.risk);
    const state = actionState(text(row.status), locale);
    const reason = text(row.reason);
    lines.push(
      `  ${risk.padEnd(8)}  ${text(row.action_type)}  ·  ${state}${reason ? `  ·  ${reason}` : ""}`
    );
  }
  if (autonomy) {
    const score = Number(autonomy.score ?? 0).toFixed(2);
    const level = Number(autonomy.effective_level ?? autonomy.level ?? 0);
    const approvals = Number(autonomy.approvals ?? 0);
    const rejections = Number(autonomy.rejections ?? 0);
    lines.push(
      pick(
        locale,
        `Trust ${score} · level ${level} · ${approvals} approved / ${rejections} rejected`,
        `信任 ${score} · 等级 ${level} · 已批准 ${approvals} / 已拒绝 ${rejections}`
      )
    );
  }
  return lines.join("\n");
}

/** A compact Today view: now, the next items, risks and open work. */
export function formatTodayText(
  view: TodayViewLike,
  locale: Locale = DEFAULT_LOCALE
): string {
  const lines: string[] = [];
  lines.push(`${pick(locale, "Today", "今天")} · ${text(view.date_key)}`);

  const now = view.now ?? null;
  lines.push(
    `  ${pick(locale, "now", "现在")}    ${
      now ? rowTitle(now) : pick(locale, "nothing picked yet", "暂无焦点")
    }`
  );

  const timeline = view.timeline ?? [];
  lines.push(
    `  ${pick(locale, "next", "接下来")}   ${timeline.length} ${plural(locale, timeline.length, "item")}`
  );
  for (const row of timeline.slice(0, 3)) {
    const label = text(row.kind_label);
    lines.push(`    · ${rowTitle(row)}${label ? `  (${label})` : ""}`);
  }

  const risks = view.risks ?? [];
  lines.push(`  ${pick(locale, "risks", "风险")}    ${risks.length}`);
  for (const row of risks.slice(0, 3)) {
    lines.push(`    ! ${rowTitle(row)}`);
  }

  const unscheduled = view.unscheduled ?? [];
  const openTotal = count(view.unscheduled_total) || unscheduled.length;
  lines.push(`  ${pick(locale, "open", "未排期")}     ${openTotal}`);
  for (const row of unscheduled.slice(0, 3)) {
    lines.push(`    · ${rowTitle(row)}`);
  }

  if (view.planning?.auto_fill_paused) {
    lines.push(`  ${pick(locale, "auto-fill paused", "自动补充已暂停")}`);
  }
  return lines.join("\n");
}
