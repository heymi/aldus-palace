/**
 * Event-driven replanning.
 *
 * A change to the day re-derives the plan: finishing something, starting
 * something, or taking something off Today. The caller decides whether to wait
 * for it; a failure never breaks the change that triggered it.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { getLocalParts } from "../lib/time.js";
import { reconcileTodayPlan, type ReconcileTodayPlanResult } from "./adaptivePlanning.js";

export type ReplanReason =
  | "commitment_completed"
  | "commitment_started"
  | "commitment_removed"
  | "commitment_created";

export type ReplanResult = {
  replanned: boolean;
  plan_version: string;
  result?: ReconcileTodayPlanResult;
};

/**
 * Reconcile the Today plan after a change. Best-effort: a planning failure is
 * reported, not thrown, so the triggering mutation stands.
 */
export async function replanAfterChange(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  reason: ReplanReason,
  options: { at?: Date } = {}
): Promise<ReplanResult> {
  const at = options.at ?? new Date();
  const planVersion = `${getLocalParts(timezone, at).dateKey}:${reason}:${nowIso()}`;
  try {
    const result = await reconcileTodayPlan(db, userId, timezone, {
      at,
      planVersion,
    });
    return { replanned: true, plan_version: planVersion, result };
  } catch {
    return { replanned: false, plan_version: planVersion };
  }
}
