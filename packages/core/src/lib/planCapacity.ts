/**
 * Daily planning capacity.
 *
 * The planner keeps a share of the day free, so a full calendar of suggestions
 * never becomes a treadmill. The default is a quarter of the daytime window
 * (09:00–18:00 local, so nine hours plan as 6.75).
 */

export const PLAN_BUFFER_RATIO = 0.25;

/** Minutes the planner may fill: the window minus the buffer. */
export function planCapacityMinutes(
  windowStartIso: string,
  windowEndIso: string,
  ratio: number = PLAN_BUFFER_RATIO
): number {
  const total = (Date.parse(windowEndIso) - Date.parse(windowStartIso)) / 60000;
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeRatio = Math.min(0.8, Math.max(0, ratio));
  return Math.max(0, Math.round(total * (1 - safeRatio)));
}

/** The minutes held back for the unexpected. */
export function planBufferMinutes(
  windowStartIso: string,
  windowEndIso: string,
  ratio: number = PLAN_BUFFER_RATIO
): number {
  const total = (Date.parse(windowEndIso) - Date.parse(windowStartIso)) / 60000;
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeRatio = Math.min(0.8, Math.max(0, ratio));
  return Math.max(0, Math.round(total * safeRatio));
}
