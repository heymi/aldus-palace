/**
 * Rule-layer benchmark.
 *
 *   pnpm bench          # table
 *   pnpm bench --json   # machine-readable
 *
 * Runs the deterministic rules against a curated, labeled corpus that ships in
 * this repository, so every number is reproducible offline. A miss exits
 * non-zero, so a rule regression fails `pnpm verify`.
 */

import { resolveRelativeDay } from "../src/lib/relativeDay.js";
import { getLocalParts } from "../src/lib/time.js";
import { commitmentsAreNearDuplicate } from "../src/lib/thoughtTitle.js";
import { decideMemoryActivation } from "../src/lib/memoryActivation.js";
import { detectActionableWork } from "../src/lib/actionableWork.js";
import { decideInputObjectMode } from "../src/lib/inputObjectMode.js";
import { ruleConflict } from "../src/services/memoryEvolution.js";

const TIMEZONE = "Asia/Tokyo";
const NOON = new Date("2026-09-19T03:00:00Z"); // 12:00 Tokyo
const EARLY = new Date("2026-09-18T19:30:00Z"); // 04:30 Tokyo

type Row = { ok: boolean; detail: string; positive?: boolean; predicted?: boolean };

function rate(rows: Row[]): number {
  if (rows.length === 0) return 1;
  return rows.filter((row) => row.ok).length / rows.length;
}

function binary(rows: Row[]): { precision: number; recall: number } {
  const tp = rows.filter((row) => row.positive && row.predicted).length;
  const fp = rows.filter((row) => !row.positive && row.predicted).length;
  const fn = rows.filter((row) => row.positive && !row.predicted).length;
  return {
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
  };
}

// --------------------------------------------------------------------------
// 1. Relative date resolution
// --------------------------------------------------------------------------

const dateCases: Array<{ text: string; at?: Date; expect: string }> = [
  { text: "明天交报告", expect: "2026-09-20" },
  { text: "后天开会", expect: "2026-09-21" },
  { text: "tomorrow", expect: "2026-09-20" },
  { text: "day after tomorrow", expect: "2026-09-21" },
  { text: "no date here", expect: "none" },
  { text: "明天交报告", at: EARLY, expect: "needs_confirmation" },
  { text: "后天", at: EARLY, expect: "needs_confirmation" },
  { text: "tomorrow", at: EARLY, expect: "needs_confirmation" },
];

const dateRows: Row[] = dateCases.map((testCase) => {
  const result = resolveRelativeDay(testCase.text, TIMEZONE, testCase.at ?? NOON);
  let got = "none";
  if (result.status === "resolved") {
    got = getLocalParts(TIMEZONE, new Date(result.window_start)).dateKey;
  } else if (result.status === "needs_confirmation") {
    got = "needs_confirmation";
  }
  return {
    ok: got === testCase.expect,
    detail: `date "${testCase.text}" → ${got} (expected ${testCase.expect})`,
  };
});

// --------------------------------------------------------------------------
// 2. Duplicate commitments
// --------------------------------------------------------------------------

const dedupeCases: Array<{ a: string; b: string; duplicate: boolean }> = [
  { a: "下周把 onboarding 做完", b: "下周把 onboarding 完成", duplicate: true },
  { a: "Ship the onboarding page next week", b: "Ship the onboarding page next week", duplicate: true },
  { a: "Fix the notification bug", b: "Fix the notification bug", duplicate: true },
  { a: "Review the pricing note", b: "Write the launch post", duplicate: false },
  { a: "Fix the notification bug", b: "Fix the billing bug", duplicate: false },
  { a: "Ship the onboarding page", b: "Design the pricing page", duplicate: false },
];

const dedupeRows: Row[] = dedupeCases.map((testCase) => {
  const predicted = commitmentsAreNearDuplicate(testCase.a, testCase.b);
  return {
    ok: predicted === testCase.duplicate,
    detail: `dedupe "${testCase.a}" vs "${testCase.b}" → ${predicted} (expected ${testCase.duplicate})`,
    positive: testCase.duplicate,
    predicted,
  };
});

// --------------------------------------------------------------------------
// 3. Memory conflict detection
// --------------------------------------------------------------------------

const conflictCases: Array<{
  candidate: { type: string; content: string };
  existing: { type: string; content: string };
  conflict: boolean;
}> = [
  {
    candidate: { type: "decision", content: "Start an iOS version next quarter" },
    existing: { type: "decision", content: "Stay Mac-only, skip Windows" },
    conflict: true,
  },
  {
    candidate: { type: "decision", content: "Add Windows support" },
    existing: { type: "decision", content: "Skip Windows" },
    conflict: true,
  },
  {
    candidate: { type: "preference", content: "Prefer more features" },
    existing: { type: "preference", content: "Keep it simple, prefer fewer features" },
    conflict: true,
  },
  {
    candidate: { type: "decision", content: "Keep the product Mac-only" },
    existing: { type: "decision", content: "Stay Mac-only" },
    conflict: false,
  },
  {
    candidate: { type: "preference", content: "I prefer simple tools" },
    existing: { type: "preference", content: "Keep the product simple" },
    conflict: false,
  },
];

const conflictRows: Row[] = conflictCases.map((testCase) => {
  const predicted = ruleConflict(testCase.candidate, testCase.existing) !== null;
  return {
    ok: predicted === testCase.conflict,
    detail: `conflict "${testCase.candidate.content}" vs "${testCase.existing.content}" → ${predicted} (expected ${testCase.conflict})`,
    positive: testCase.conflict,
    predicted,
  };
});

// --------------------------------------------------------------------------
// 4. Memory activation
// --------------------------------------------------------------------------

const activationCases: Array<{
  type: string;
  source: string;
  confidence: number | null;
  importance: number | null;
  expect: "active" | "candidate" | "drop";
}> = [
  { type: "preference", source: "user_explicit", confidence: 0.9, importance: 0.8, expect: "active" },
  { type: "principle", source: "user_explicit", confidence: 0.95, importance: 0.9, expect: "active" },
  { type: "principle", source: "ai_inferred", confidence: 0.95, importance: 0.9, expect: "candidate" },
  { type: "preference", source: "ai_inferred", confidence: 0.6, importance: 0.8, expect: "drop" },
  { type: "preference", source: "ai_inferred", confidence: 0.75, importance: 0.8, expect: "candidate" },
  { type: "preference", source: "ai_inferred", confidence: null, importance: 0.8, expect: "candidate" },
];

const activationRows: Row[] = activationCases.map((testCase, index) => {
  const predicted = decideMemoryActivation({
    type: testCase.type,
    source: testCase.source,
    content: "x",
    confidence: testCase.confidence,
    importance: testCase.importance,
  }).activation;
  return {
    ok: predicted === testCase.expect,
    detail: `activation case ${index + 1} → ${predicted} (expected ${testCase.expect})`,
    positive: testCase.expect !== "drop",
    predicted: predicted !== "drop",
  };
});

// --------------------------------------------------------------------------
// 5. Actionable work
// --------------------------------------------------------------------------

const workCases: Array<{ text: string; work: boolean }> = [
  { text: "Ship the onboarding page next week", work: true },
  { text: "Fix the notification bug tomorrow", work: true },
  { text: "Write the launch post", work: true },
  { text: "Review the pull request", work: true },
  { text: "I keep going back and forth on pricing", work: false },
  { text: "AI products feel noisy lately", work: false },
  { text: "Maybe we should think about positioning", work: false },
];

const workRows: Row[] = workCases.map((testCase) => {
  const predicted = detectActionableWork(testCase.text).score >= 0.55;
  return {
    ok: predicted === testCase.work,
    detail: `work "${testCase.text}" → ${predicted} (expected ${testCase.work})`,
    positive: testCase.work,
    predicted,
  };
});

// --------------------------------------------------------------------------
// 6. Object mode fallback
// --------------------------------------------------------------------------

const emptyExtraction = { thoughts: [] as unknown[], commitments: [] as unknown[] };

const objectCases: Array<{
  input: string;
  extraction: {
    object_mode?: string | null;
    intent?: { has_actionable_work: boolean } | null;
    thoughts: unknown[];
    commitments: unknown[];
  };
  expect: string;
}> = [
  { input: "Ship the onboarding page next week", extraction: emptyExtraction, expect: "commitment" },
  { input: "I keep going back and forth on pricing", extraction: emptyExtraction, expect: "thought" },
  { input: "下周把 onboarding 做完", extraction: { ...emptyExtraction, intent: { has_actionable_work: true } }, expect: "commitment" },
  { input: "mixed", extraction: { thoughts: [{}], commitments: [{}], intent: null }, expect: "thought" },
  { input: "model says so", extraction: { ...emptyExtraction, object_mode: "thought" }, expect: "thought" },
];

const objectRows: Row[] = objectCases.map((testCase) => {
  const predicted = decideInputObjectMode(testCase.input, testCase.extraction as never).mode;
  return {
    ok: predicted === testCase.expect,
    detail: `object mode "${testCase.input}" → ${predicted} (expected ${testCase.expect})`,
  };
});

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------

const suites: Array<{ name: string; rows: Row[]; binary?: boolean }> = [
  { name: "relative dates", rows: dateRows },
  { name: "duplicate commitments", rows: dedupeRows, binary: true },
  { name: "memory conflicts", rows: conflictRows, binary: true },
  { name: "memory activation", rows: activationRows, binary: true },
  { name: "actionable work", rows: workRows, binary: true },
  { name: "object mode", rows: objectRows },
];

const outcomes = suites.map((suite) => {
  const passed = suite.rows.filter((row) => row.ok).length;
  const metrics = suite.binary ? binary(suite.rows) : null;
  return {
    name: suite.name,
    pass: passed,
    total: suite.rows.length,
    accuracy: rate(suite.rows),
    precision: metrics?.precision,
    recall: metrics?.recall,
  };
});

const failures = suites.flatMap((suite) =>
  suite.rows.filter((row) => !row.ok).map((row) => row.detail)
);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ outcomes, failures }, null, 2));
} else {
  console.log("Rule-layer benchmark (deterministic, offline)\n");
  console.log("suite                  pass/total   accuracy   precision   recall");
  for (const outcome of outcomes) {
    const precision = outcome.precision === undefined ? "—" : outcome.precision.toFixed(3);
    const recall = outcome.recall === undefined ? "—" : outcome.recall.toFixed(3);
    console.log(
      `${outcome.name.padEnd(22)} ${String(outcome.pass).padStart(2)}/${String(outcome.total).padEnd(8)} ${outcome.accuracy.toFixed(3).padStart(8)}   ${String(precision).padStart(9)}   ${String(recall).padStart(6)}`
    );
  }
}

if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
