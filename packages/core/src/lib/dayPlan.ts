/**
 * The morning day plan.
 *
 * The day is classified into what must happen, what can fit, and what should
 * wait. Core work is time-bound or already moving; optional work fits the
 * remaining capacity; the rest is deferred without being lost.
 */

import { DEFAULT_DURATION_MINUTES } from "./durationEstimate.js";

export const CORE_SLOT_HORIZON_HOURS = 2;

export type DayPlanItem = {
  id: string;
  status?: string | null;
  deadline?: string | null;
  started_at?: string | null;
  ai_slot_start?: string | null;
  duration_minutes?: number | null;
  importance?: number | null;
  project_id?: string | null;
};

export type DayPlan = {
  core: string[];
  optional: string[];
  deferred: string[];
};

function isCore(item: DayPlanItem, at: Date): boolean {
  if (item.started_at) return true;
  if (item.status === "risk") return true;
  const deadline = item.deadline ? Date.parse(item.deadline) : Number.NaN;
  if (Number.isFinite(deadline) && deadline - at.getTime() <= 24 * 3600 * 1000) {
    return true;
  }
  const slot = item.ai_slot_start ? Date.parse(item.ai_slot_start) : Number.NaN;
  return (
    Number.isFinite(slot) &&
    slot - at.getTime() <= CORE_SLOT_HORIZON_HOURS * 3600 * 1000
  );
}

function durationOf(item: DayPlanItem): number {
  const duration = Number(item.duration_minutes);
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION_MINUTES;
}

function deadlineRank(item: DayPlanItem): number {
  const deadline = item.deadline ? Date.parse(item.deadline) : Number.NaN;
  return Number.isFinite(deadline) ? deadline : Number.POSITIVE_INFINITY;
}

/** Core first, then optional while capacity lasts, then deferred. */
export function classifyDay(
  items: DayPlanItem[],
  options: { at: Date; capacityMinutes: number }
): DayPlan {
  const core: string[] = [];
  const optional: string[] = [];
  const deferred: string[] = [];

  const coreItems = items.filter((item) => isCore(item, options.at));
  const rest = items
    .filter((item) => !coreItems.includes(item))
    .sort((a, b) => deadlineRank(a) - deadlineRank(b));

  for (const item of coreItems) core.push(item.id);

  let remaining = options.capacityMinutes;
  for (const item of coreItems) remaining -= durationOf(item);

  for (const item of rest) {
    const duration = durationOf(item);
    if (remaining - duration >= 0) {
      optional.push(item.id);
      remaining -= duration;
    } else {
      deferred.push(item.id);
    }
  }

  return { core, optional, deferred };
}
