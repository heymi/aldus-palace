/**
 * Duration estimation.
 *
 * The planner sizes a slot from the user's own estimate when there is one, from
 * similar completed work when there is not, and from a default otherwise. A
 * stated estimate keeps the larger weight; history only corrects it.
 */

export const DEFAULT_DURATION_MINUTES = 45;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 240;

export type DurationSource = "stated" | "blended" | "history" | "default";

export type DurationEstimate = {
  minutes: number;
  source: DurationSource;
  /** How many completed durations informed the estimate. */
  samples: number;
};

function clamp(minutes: number): number {
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(minutes)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Estimate a commitment's duration in minutes.
 *
 * - stated only → the stated value
 * - stated + at least three completed samples → 70% stated, 30% median
 * - no stated + at least two samples → the median
 * - otherwise → the default
 */
export function estimateDurationMinutes(options: {
  stated?: number | null;
  history?: number[];
}): DurationEstimate {
  const stated =
    typeof options.stated === "number" && Number.isFinite(options.stated) && options.stated > 0
      ? options.stated
      : null;
  const history = (options.history ?? []).filter(
    (value) => Number.isFinite(value) && value > 0
  );

  if (stated !== null && history.length >= 3) {
    return {
      minutes: clamp(stated * 0.7 + median(history) * 0.3),
      source: "blended",
      samples: history.length,
    };
  }
  if (stated !== null) {
    return { minutes: clamp(stated), source: "stated", samples: history.length };
  }
  if (history.length >= 2) {
    return { minutes: clamp(median(history)), source: "history", samples: history.length };
  }
  return { minutes: DEFAULT_DURATION_MINUTES, source: "default", samples: history.length };
}
