import {
  decideMemoryActivation,
  explainActivation,
  MEMORY_ACTIVE_THRESHOLD,
  MEMORY_DROP_CONFIDENCE,
} from "../src/lib/memoryActivation.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- the policy table ------------------------------------------------------
//
// Importances and confidences below come from the rule-based extractor, so the
// expectations describe what the shipped rules actually produce.

type Case = {
  input: string;
  type: string;
  source: string;
  confidence: number;
  importance: number;
  want: "active" | "candidate" | "drop";
  why: string;
};

const cases: Case[] = [
  {
    input: "以后产品不要做太复杂，保持克制",
    type: "preference",
    source: "user_explicit",
    confidence: 0.88,
    importance: 0.85,
    want: "active",
    why: "stated rule, above both thresholds",
  },
  {
    input: "AI should assist, not dominate",
    type: "principle",
    source: "user_explicit",
    confidence: 0.9,
    importance: 0.9,
    want: "active",
    why: "stated principle",
  },
  {
    input: "重视隐私与用户数据保护",
    type: "principle",
    source: "user_explicit",
    confidence: 0.8,
    importance: 0.85,
    want: "active",
    why: "the boundary counts: >= 0.8 activates",
  },
  {
    input: "用户反复说不喜欢复杂界面",
    type: "principle",
    source: "ai_inferred",
    confidence: 0.85,
    importance: 0.9,
    want: "candidate",
    why: "a single inference never becomes a principle",
  },
  {
    input: "用户反复选择原生体验",
    type: "preference",
    source: "ai_inferred",
    confidence: 0.86,
    importance: 0.82,
    want: "active",
    why: "the scope includes high-confidence inferences",
  },
  {
    input: "偏好原生体验与平台一致性",
    type: "preference",
    source: "ai_inferred",
    confidence: 0.75,
    importance: 0.7,
    want: "candidate",
    why: "below the activation threshold",
  },
  {
    input: "倾向保持 Mac-only",
    type: "decision",
    source: "ai_inferred",
    confidence: 0.78,
    importance: 0.8,
    want: "candidate",
    why: "one threshold short",
  },
  {
    input: "用户反馈不喜欢这个按钮",
    type: "experience",
    source: "ai_inferred",
    confidence: 0.7,
    importance: 0.65,
    want: "drop",
    why: "below the confidence floor",
  },
];

for (const testCase of cases) {
  const decision = decideMemoryActivation({
    type: testCase.type,
    source: testCase.source,
    content: testCase.input,
    confidence: testCase.confidence,
    importance: testCase.importance,
  });
  assert(
    decision.activation === testCase.want,
    `"${testCase.input}" (${testCase.why}): expected ${testCase.want}, got ${decision.activation} (${decision.reason})`
  );
  assert(decision.reason.length > 0, "every decision carries a reason");
}

// Missing scores fall to a candidate, never an activation.
const missing = decideMemoryActivation({
  type: "preference",
  source: "user_explicit",
  content: "无分数",
});
assert(
  missing.activation === "candidate",
  "a candidate without scores waits for confirmation"
);

assert(MEMORY_ACTIVE_THRESHOLD === 0.8, "the documented threshold is 0.8");
assert(MEMORY_DROP_CONFIDENCE < MEMORY_ACTIVE_THRESHOLD, "the floor sits below the threshold");

// --- explainability for the memory list ------------------------------------

assert(
  explainActivation({
    status: "active",
    source: "user_explicit",
    confidence: 0.88,
    importance: 0.85,
    confirmed_at: null,
  }).includes("stated by you"),
  "an automated activation says where it came from"
);
assert(
  explainActivation({
    status: "active",
    source: "ai_inferred",
    confidence: 0.9,
    importance: 0.9,
    confirmed_at: null,
  }).includes("inferred"),
  "an inferred activation says the system inferred it"
);
assert(
  explainActivation({
    status: "active",
    source: "user_explicit",
    confirmed_at: "2026-09-19T00:00:00.000Z",
  }) === "confirmed by you",
  "a manual confirmation is labeled as such"
);
assert(
  explainActivation({ status: "candidate" }) === "waiting for confirmation",
  "a candidate explains why it is not active"
);

// Auto-activation must stay distinguishable from a human confirmation: only
// `confirmMemory` sets confirmed_at.
assert(
  explainActivation({
    status: "active",
    source: "user_explicit",
    confidence: 0.88,
    importance: 0.85,
    confirmed_at: null,
  }) !== "confirmed by you",
  "an automated activation never reports as a user confirmation"
);

console.log("memory activation tests passed.");
