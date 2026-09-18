import { detectActionableWork } from "../src/lib/actionableWork.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Case = {
  input: string;
  work: boolean;
  why: string;
};

// Threshold used by the deterministic provider.
const WORK_THRESHOLD = 0.55;

const cases: Case[] = [
  // Imperative English openers must register as work.
  { input: "Write the architecture doc", work: true, why: "imperative + artifact" },
  { input: "Review the pull request", work: true, why: "imperative + artifact" },
  { input: "Migrate the database to Postgres", work: true, why: "imperative + artifact" },
  { input: "Add tests for the parser", work: true, why: "imperative + artifact" },
  { input: "Set up the CI pipeline", work: true, why: "imperative + infra noun" },
  { input: "Test the published package next week", work: true, why: "imperative + artifact" },
  { input: "Ship the onboarding page next week", work: true, why: "build verb + surface" },
  { input: "please fix the notification bug", work: true, why: "polite imperative" },

  // Research alone stays a thought; research aimed at a concrete artifact is work.
  { input: "Research MCP integration next month", work: false, why: "pure research: no artifact" },
  {
    input: "Research the notification API next month",
    work: true,
    why: "research aimed at a concrete artifact",
  },

  // Noun uses of a verb must not be mistaken for imperatives.
  { input: "I took a test yesterday", work: false, why: "past-tense noun" },
  { input: "Just thinking about the design", work: false, why: "non-work override" },
  { input: "fyi only: the build failed", work: false, why: "non-work override" },

  // Chinese behaviour is unchanged.
  { input: "最近觉得 AI 产品都太吵了，干扰太多", work: false, why: "pure observation" },
  { input: "首页可以像一本安静展开的杂志", work: false, why: "pure idea" },
  { input: "修复登录页面的通知 Bug", work: true, why: "build_zh" },
  { input: "开发独立的搜索页面", work: true, why: "build_zh + feature noun" },
  // A bare build verb plus shape scores 0.5 — below this gate on purpose.
  // The capture pipeline still creates the commitment via its time/action signals.
  { input: "实现 MCP 接入，下周给出结论", work: false, why: "below the detector gate; pipeline adds time signal" },
];

for (const testCase of cases) {
  const signal = detectActionableWork(testCase.input);
  const isWork = signal.score >= WORK_THRESHOLD;
  assert(
    isWork === testCase.work,
    `"${testCase.input}" (${testCase.why}): expected ${testCase.work ? "work" : "thought"}, ` +
      `got score=${signal.score} reasons=[${signal.reasons.join(", ")}]`
  );
}

// A work signal must also propose an executable title.
const titled = detectActionableWork("Write the architecture doc");
assert(titled.suggestedTitle !== null, "work signals must suggest a title");
assert(
  !titled.suggestedTitle!.startsWith(". ") && titled.suggestedTitle!.length > 3,
  `suggested title looks wrong: ${titled.suggestedTitle}`
);

console.log("actionable work tests passed.");
