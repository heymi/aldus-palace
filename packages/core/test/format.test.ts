import { formatActionCard, formatTodayText } from "../src/lib/format.js";
import type { ActionCard } from "../src/domain/types.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const card: ActionCard = {
  summary: "Captured · 1 commitment · remembered 1",
  thoughts: [],
  commitments: [
    {
      id: "cmt_1",
      title: "Ship the onboarding page",
      window_start: "2026-09-21T00:00:00.000Z",
      window_end: "2026-09-27T23:59:59.000Z",
    },
  ],
  decisions: [],
  memory_candidates: [
    { id: "mem_1", content: "I prefer simple tools", status: "active" },
    { id: "mem_2", content: "Keep Mac only", status: "candidate" },
  ],
  clarifications: [],
  warnings: ["Already tracked, so this repeat was skipped: Ship the onboarding page"],
};

const en = formatActionCard(card, "en");
assert(en.startsWith("Captured · 1 commitment · remembered 1"), "the summary leads the card");
assert(
  en.includes("commitment  Ship the onboarding page  ·  window 2026-09-21 → 2026-09-27"),
  `the commitment line carries its window, got: ${en}`
);
assert(en.includes("memory      I prefer simple tools  ·  active"), "an active memory is marked");
assert(en.includes("memory      Keep Mac only  ·  waiting for you"), "a candidate waits");
assert(en.includes("! Already tracked"), "a warning is kept");

const zh = formatActionCard(card, "zh-CN");
assert(zh.startsWith("Captured · 1 commitment · remembered 1"), "the summary is provider text");
assert(zh.includes("要做  Ship the onboarding page  ·  时间窗"), `Chinese labels, got: ${zh}`);
assert(zh.includes("记忆      I prefer simple tools  ·  已生效"), "Chinese memory state");
assert(zh.includes("·  待确认"), "Chinese candidate state");

const emptyCard: ActionCard = {
  summary: "Captured · 1 thought",
  thoughts: [{ id: "tht_1", title: "Pricing is still open" }],
  commitments: [],
  decisions: [],
  memory_candidates: [],
  clarifications: [],
  warnings: [],
};
const thoughtCard = formatActionCard(emptyCard, "en");
assert(thoughtCard.includes("thought     Pricing is still open"), "a thought is listed");
assert(!thoughtCard.includes("commitment  "), "an empty object list adds no line");

const today = {
  date_key: "2026-09-19",
  now: { id: "cmt_1", title: "Ship the onboarding page" },
  timeline: [
    { id: "cmt_1", title: "Ship the onboarding page", kind_label: "Suggested slot" },
    { id: "cmt_2", title: "Review the pricing note", kind_label: "Has a deadline" },
  ],
  risks: [{ id: "cmt_3", title: "Send the invoice" }],
  unscheduled: [{ id: "cmt_4", title: "Draft the launch post" }],
  unscheduled_total: 4,
  planning: { mode: "paused", auto_fill_paused: true },
};

const todayEn = formatTodayText(today, "en");
assert(todayEn.startsWith("Today · 2026-09-19"), "the date leads the view");
assert(todayEn.includes("now    Ship the onboarding page"), "Now carries the focus");
assert(todayEn.includes("next   2 items"), "the timeline count");
assert(todayEn.includes("risks    1"), "the risk count");
assert(todayEn.includes("open     4"), "the unscheduled total wins over the preview");
assert(todayEn.includes("auto-fill paused"), "a paused day says so");

const todayZh = formatTodayText(today, "zh-CN");
assert(todayZh.startsWith("今天 · 2026-09-19"), `Chinese header, got: ${todayZh}`);
assert(todayZh.includes("现在    Ship the onboarding page"), "Chinese Now");
assert(todayZh.includes("风险    1"), "Chinese risk count");
assert(todayZh.includes("自动补充已暂停"), "Chinese pause note");

const emptyToday = formatTodayText({ date_key: "2026-09-19" }, "en");
assert(emptyToday.includes("nothing picked yet"), "an empty day has no focus");

console.log("format tests passed.");
