import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  estimateDurationMinutes,
} from "../src/lib/durationEstimate.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// No estimate and no history → the default.
const fallback = estimateDurationMinutes({});
assert(fallback.minutes === DEFAULT_DURATION_MINUTES, "no input falls back to the default");
assert(fallback.source === "default", "the source is default");

// A stated estimate is used as-is.
const stated = estimateDurationMinutes({ stated: 30 });
assert(stated.minutes === 30, "a stated estimate is kept");
assert(stated.source === "stated", "the source is stated");

// One completed sample is not enough history.
const single = estimateDurationMinutes({ stated: null, history: [90] });
assert(single.minutes === DEFAULT_DURATION_MINUTES, "one sample does not move the estimate");
assert(single.source === "default", "one sample stays the default");

// Two or more samples without a stated estimate use the median.
const historyOnly = estimateDurationMinutes({ stated: null, history: [20, 40] });
assert(historyOnly.minutes === 30, "the median of two samples");
assert(historyOnly.source === "history", "the source is history");

const oddHistory = estimateDurationMinutes({ stated: null, history: [15, 45, 90] });
assert(oddHistory.minutes === 45, "the median of three samples");

// A stated estimate plus at least three samples blends 70/30.
const blended = estimateDurationMinutes({ stated: 60, history: [30, 30, 30] });
assert(blended.minutes === 51, `70% stated + 30% median, got ${blended.minutes}`);
assert(blended.source === "blended", "the source is blended");

// Two samples do not blend, even with a stated estimate.
const statedTwo = estimateDurationMinutes({ stated: 60, history: [30, 30] });
assert(statedTwo.minutes === 60, "two samples keep the stated estimate");
assert(statedTwo.source === "stated", "the source stays stated");

// Bounds.
assert(estimateDurationMinutes({ stated: 5 }).minutes === MIN_DURATION_MINUTES, "clamped low");
assert(estimateDurationMinutes({ stated: 999 }).minutes === MAX_DURATION_MINUTES, "clamped high");

// Invalid values are ignored.
const noisy = estimateDurationMinutes({
  stated: Number.NaN,
  history: [0, -10, Number.NaN, 50, 70],
});
assert(noisy.minutes === 60, `invalid values are filtered, got ${noisy.minutes}`);
assert(noisy.samples === 2, "only the two valid samples count");

console.log("duration estimate tests passed.");
