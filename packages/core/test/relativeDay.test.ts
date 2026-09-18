/**
 * Run: npx tsx src/eval/relativeDay.test.ts
 */
import { resolveRelativeDay } from "../src/lib/relativeDay.js";
import { getLocalParts } from "../src/lib/time.js";

const tz = "Asia/Tokyo";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Construct a Date that is 02:30 in Asia/Tokyo on 2026-07-18
// Tokyo is UTC+9 → 2026-07-17T17:30:00.000Z
const early = new Date("2026-07-17T17:30:00.000Z");
const partsEarly = getLocalParts(tz, early);
assert(partsEarly.hour === 2, `expected hour 2, got ${partsEarly.hour}`);
assert(partsEarly.dateKey === "2026-07-18", `dateKey ${partsEarly.dateKey}`);

const amb = resolveRelativeDay("明天优化 Nimbus", tz, early);
assert(amb.status === "needs_confirmation", "early 明天 must need confirmation");
if (amb.status === "needs_confirmation") {
  assert(amb.clarification.options.length === 2, "two options");
  assert(
    amb.clarification.options.some((o) => o.id === "today_daytime"),
    "today_daytime"
  );
  assert(
    amb.clarification.options.some((o) => o.id === "next_calendar_day"),
    "next_calendar_day"
  );
}

const ambHou = resolveRelativeDay("后天改官网", tz, early);
assert(ambHou.status === "needs_confirmation", "early 后天 needs confirmation");

// Afternoon Tokyo 15:00 on 2026-07-18 = 06:00 UTC
const afternoon = new Date("2026-07-18T06:00:00.000Z");
const partsPm = getLocalParts(tz, afternoon);
assert(partsPm.hour === 15, `expected 15, got ${partsPm.hour}`);

const ok = resolveRelativeDay("明天优化 Nimbus", tz, afternoon);
assert(ok.status === "resolved", "afternoon 明天 auto-resolves");
if (ok.status === "resolved") {
  assert(!!ok.window_start && !!ok.window_end, "has window");
}

// 05:00 Tokyo should NOT be ambiguous (hour < 5 only)
const five = new Date("2026-07-17T20:00:00.000Z"); // 05:00 JST
const p5 = getLocalParts(tz, five);
assert(p5.hour === 5, `hour 5 got ${p5.hour}`);
const atFive = resolveRelativeDay("明天处理", tz, five);
assert(atFive.status === "resolved", "05:00 should auto-resolve, not confirm");

console.log("relativeDay tests passed.");
