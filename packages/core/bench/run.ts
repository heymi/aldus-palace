/**
 * Rule-layer benchmark.
 *
 *   pnpm bench          # table
 *   pnpm bench --json   # machine-readable
 *
 * Runs the deterministic rules against a curated, labeled corpus. Cases marked
 * `known` are measured limitations: they are reported but do not fail the run.
 * Everything else is a contract and a miss fails.
 *
 * Scope: the offline rule layer. This is not a model benchmark and not a blind
 * corpus; see docs/BENCHMARKS.md.
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

type Row = { ok: boolean; known: boolean; detail: string; positive?: boolean; predicted?: boolean };

function rate(rows: Row[]): number {
  const contract = rows.filter((row) => !row.known);
  if (contract.length === 0) return 1;
  return contract.filter((row) => row.ok).length / contract.length;
}

function binary(rows: Row[]): { precision: number; recall: number } {
  const contract = rows.filter((row) => !row.known);
  const tp = contract.filter((row) => row.positive && row.predicted).length;
  const fp = contract.filter((row) => !row.positive && row.predicted).length;
  const fn = contract.filter((row) => row.positive && !row.predicted).length;
  return {
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
  };
}

// --------------------------------------------------------------------------
// 1. Relative date resolution
// --------------------------------------------------------------------------

const dateCases: Array<{ text: string; at?: Date; expect: string; known?: boolean }> = [
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
    known: testCase.known === true,
    detail: `date "${testCase.text}" → ${got} (expected ${testCase.expect})`,
  };
});

// --------------------------------------------------------------------------
// 2. Duplicate commitments
// --------------------------------------------------------------------------

const dedupeCases: Array<{ a: string; b: string; duplicate: boolean; known?: boolean }> = [
  { a: "下周把 onboarding 做完", b: "下周把 onboarding 完成", duplicate: true },
  { a: "Ship the onboarding page next week", b: "Ship the onboarding page next week", duplicate: true },
  { a: "Fix the notification bug", b: "Fix the notification bug", duplicate: true },
  { a: "Review the pricing note", b: "Write the launch post", duplicate: false },
  { a: "Fix the notification bug", b: "Fix the billing bug", duplicate: false },
  { a: "Ship the onboarding page", b: "Design the pricing page", duplicate: false },
  { a: "Ship the onboarding page next week", b: "ship onboarding page next week", duplicate: true, known: true },
  { a: "Fix the notification bug", b: "Fix notification bug", duplicate: true, known: true },
];

const dedupeRows: Row[] = dedupeCases.map((testCase) => {
  const predicted = commitmentsAreNearDuplicate(testCase.a, testCase.b);
  return {
    ok: predicted === testCase.duplicate,
    known: testCase.known === true,
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
  known?: boolean;
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
  {
    candidate: { type: "decision", content: "Start shipping iOS again" },
    existing: { type: "decision", content: "Stay Mac-only" },
    conflict: true,
    known: true,
  },
];

const conflictRows: Row[] = conflictCases.map((testCase) => {
  const predicted = ruleConflict(testCase.candidate, testCase.existing) !== null;
  return {
    ok: predicted === testCase.conflict,
    known: testCase.known === true,
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
    known: false,
    detail: `activation case ${index + 1} → ${predicted} (expected ${testCase.expect})`,
    positive: testCase.expect !== "drop",
    predicted: predicted !== "drop",
  };
});

// --------------------------------------------------------------------------
// 5. Actionable work
// --------------------------------------------------------------------------

const workCases: Array<{ text: string; work: boolean; known?: boolean }> = [
  { text: "Ship the onboarding page next week", work: true },
  { text: "Fix the notification bug tomorrow", work: true },
  { text: "Write the launch post", work: true },
  { text: "Review the pull request", work: true },
  { text: "I keep going back and forth on pricing", work: false },
  { text: "AI products feel noisy lately", work: false },
  { text: "Maybe we should think about positioning", work: false },
  { text: "下周把 onboarding 做完", work: true, known: true },
];

const workRows: Row[] = workCases.map((testCase) => {
  const predicted = detectActionableWork(testCase.text).score >= 0.55;
  return {
    ok: predicted === testCase.work,
    known: testCase.known === true,
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
  known?: boolean;
}> = [
  { input: "Ship the onboarding page next week", extraction: emptyExtraction, expect: "commitment" },
  { input: "I keep going back and forth on pricing", extraction: emptyExtraction, expect: "thought" },
  { input: "下周把 onboarding 做完", extraction: { ...emptyExtraction, intent: { has_actionable_work: true } }, expect: "commitment" },
  { input: "mixed", extraction: { thoughts: [{}], commitments: [{}], intent: null }, expect: "thought" },
  { input: "AI 产品太吵了，另外把定价页改一下", extraction: { thoughts: [{}], commitments: [{}], intent: null }, expect: "mixed", known: true },
  { input: "model says so", extraction: { ...emptyExtraction, object_mode: "thought" }, expect: "thought" },
];

const objectRows: Row[] = objectCases.map((testCase) => {
  const predicted = decideInputObjectMode(testCase.input, testCase.extraction as never).mode;
  return {
    ok: predicted === testCase.expect,
    known: testCase.known === true,
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
  const contract = suite.rows.filter((row) => !row.known);
  const passed = contract.filter((row) => row.ok).length;
  const metrics = suite.binary ? binary(suite.rows) : null;
  return {
    name: suite.name,
    pass: passed,
    total: contract.length,
    accuracy: rate(suite.rows),
    precision: metrics?.precision,
    recall: metrics?.recall,
    knownGaps: suite.rows.filter((row) => row.known && !row.ok).map((row) => row.detail),
  };
});

const failures = suites.flatMap((suite) =>
  suite.rows.filter((row) => !row.known && !row.ok).map((row) => row.detail)
);
const knownGaps = outcomes.flatMap((outcome) => outcome.knownGaps);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ outcomes, failures, knownGaps }, null, 2));
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
  if (knownGaps.length) {
    console.log("\nKnown gaps (measured, not enforced):");
    for (const gap of knownGaps) console.log(`  ${gap}`);
  }
}

if (failures.length) {
  console.error("\nContract failures:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
