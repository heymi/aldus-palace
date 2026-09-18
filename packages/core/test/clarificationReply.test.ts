import {
  matchClarificationReply,
  looksLikeShortClarificationReply,
} from "../src/lib/clarificationReply.js";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

const opts = [
  { id: "today_daytime", label: "今天白天" },
  { id: "next_calendar_day", label: "下一天（日历上的明天）" },
];

assert(
  matchClarificationReply("今天", opts, "明天") === "today_daytime",
  "今天 → today_daytime"
);
assert(
  matchClarificationReply("今天白天", opts, "明天") === "today_daytime",
  "今天白天"
);
assert(
  matchClarificationReply("明天", opts, "明天") === "next_calendar_day",
  "明天 → next"
);
assert(
  matchClarificationReply("下一天", opts, "明天") === "next_calendar_day",
  "下一天"
);
assert(looksLikeShortClarificationReply("今天") === true, "short");
assert(
  looksLikeShortClarificationReply("下周把 Nimbus 官网和邮件产品一起研究一下可行性") === false,
  "long"
);

console.log("clarificationReply tests passed.");
