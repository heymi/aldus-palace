/**
 * LLM benchmark.
 *
 *   DEEPSEEK_API_KEY=… pnpm bench:llm
 *
 * Runs real captures through a cloud model and reports object-mode accuracy,
 * commitment counts, memory behaviour, date resolution and latency. It needs a
 * key and a network, so it is not part of `pnpm verify`.
 */

import { processRawInput } from "../../src/agent/understand.js";
import { nowIso } from "../../src/db/port.js";
import { newId } from "../../src/lib/id.js";
import { getLocalParts, addDaysToDateKey } from "../../src/lib/time.js";
import { createLLMProvider, type ChatMessage } from "../../src/providers/index.js";
import { ensureDevUser } from "../../src/repos/users.js";
import { createTestDb } from "../../test/support/db.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
if (!apiKey) {
  console.error("DEEPSEEK_API_KEY is required for the LLM benchmark.");
  process.exit(1);
}

// The benchmark measures the model, not the gateway: a pass-through guard.
const passThrough = async (messages: ChatMessage[]): Promise<ChatMessage[]> => messages;
const llm = createLLMProvider({ kind: "deepseek", apiKey }, passThrough);

type MemoryExpectation = "active" | "candidate" | "any" | "none";

type Case = {
  id: string;
  input: string;
  timezone: string;
  dateKeys?: string[];
  expect: {
    mode?: "thought" | "commitment" | "mixed";
    commitmentsMin?: number;
    commitmentsMax?: number;
    memory?: MemoryExpectation;
  };
};

const UTC = "UTC";
const SH = "Asia/Shanghai";
const now = new Date();
const todayUtc = getLocalParts(UTC, now).dateKey;
const todaySh = getLocalParts(SH, now).dateKey;
const days = (base: string, ...offsets: number[]) =>
  offsets.map((offset) => addDaysToDateKey(base, offset));

const cases: Case[] = [
  {
    id: "en-commitment",
    input: "Ship the onboarding page next week",
    timezone: UTC,
    dateKeys: days(todayUtc, 0, 1, 2, 3, 4, 5, 6, 7),
    expect: { mode: "commitment", commitmentsMin: 1, memory: "none" },
  },
  {
    id: "en-stated-rule",
    input: "I prefer simple tools",
    timezone: UTC,
    expect: { commitmentsMax: 0, memory: "active" },
  },
  {
    id: "en-mood",
    input: "I am tired today",
    timezone: UTC,
    expect: { commitmentsMax: 0, memory: "none" },
  },
  {
    id: "en-deadline",
    input: "Fix the login bug tomorrow",
    timezone: UTC,
    dateKeys: days(todayUtc, 1),
    expect: { mode: "commitment", commitmentsMin: 1, memory: "none" },
  },
  {
    id: "en-thought",
    input: "I keep going back and forth on pricing",
    timezone: UTC,
    expect: { mode: "thought", commitmentsMax: 0 },
  },
  {
    id: "en-follow-up",
    input: "Remind me to follow up with legal on Friday",
    timezone: UTC,
    dateKeys: days(todayUtc, 4, 5, 6, 7),
    expect: { commitmentsMin: 1, memory: "none" },
  },
  {
    id: "en-platform",
    input: "Keep Mac only, no Windows version",
    timezone: UTC,
    expect: { commitmentsMax: 0, memory: "any" },
  },
  {
    id: "zh-commitment",
    input: "下周把 onboarding 做完",
    timezone: SH,
    dateKeys: days(todaySh, 0, 1, 2, 3, 4, 5, 6, 7),
    expect: { mode: "commitment", commitmentsMin: 1, memory: "none" },
  },
  {
    id: "zh-stated-rule",
    input: "以后产品不要做太复杂，保持克制",
    timezone: SH,
    expect: { commitmentsMax: 0, memory: "active" },
  },
  {
    id: "zh-mood",
    input: "今天有点累",
    timezone: SH,
    expect: { commitmentsMax: 0, memory: "none" },
  },
];

function modeOf(thoughts: number, commitments: number): "thought" | "commitment" | "mixed" {
  if (thoughts > 0 && commitments > 0) return "mixed";
  if (commitments > 0) return "commitment";
  return "thought";
}

type Row = {
  id: string;
  modeOk: boolean;
  countOk: boolean;
  memoryOk: boolean;
  dateOk: boolean | null;
  latencyMs: number;
  detail: string;
};

const rows: Row[] = [];

for (const testCase of cases) {
  const db = await createTestDb();
  const user = await ensureDevUser(db, {
    name: "Bench",
    timezone: testCase.timezone,
    language: testCase.timezone === SH ? "zh-CN" : "en",
  });
  const rawInputId = newId("inp");
  const t = nowIso();
  await db
    .prepare(
      `INSERT INTO raw_inputs
       (id, user_id, content, source, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
    )
    .run(rawInputId, user.id, testCase.input, t, t);

  const started = Date.now();
  const card = await processRawInput(db, llm, user, rawInputId, "full");
  const latencyMs = Date.now() - started;

  const commitments = card.commitments.length;
  const thoughts = card.thoughts.length;
  const memories = card.memory_candidates as Array<{ status?: string }>;
  const mode = modeOf(thoughts, commitments);

  const modeOk = testCase.expect.mode ? mode === testCase.expect.mode : true;
  const countOk =
    commitments >= (testCase.expect.commitmentsMin ?? 0) &&
    commitments <= (testCase.expect.commitmentsMax ?? Number.POSITIVE_INFINITY);
  const memoryExpectation = testCase.expect.memory;
  const active = memories.some((memory) => memory.status === "active");
  const candidate = memories.some((memory) => memory.status === "candidate");
  const memoryOk =
    memoryExpectation === undefined
      ? true
      : memoryExpectation === "none"
        ? memories.length === 0
        : memoryExpectation === "active"
          ? active
          : memoryExpectation === "candidate"
            ? candidate
            : memories.length > 0;

  const commitmentKeys = card.commitments
    .flatMap((row) => [row.deadline, row.window_end, row.window_start])
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => getLocalParts(testCase.timezone, new Date(value)).dateKey);
  const dateOk = testCase.dateKeys
    ? commitmentKeys.some((key) => testCase.dateKeys!.includes(key))
    : null;

  rows.push({
    id: testCase.id,
    modeOk,
    countOk,
    memoryOk,
    dateOk,
    latencyMs,
    detail: `mode=${mode} commitments=${commitments} thoughts=${thoughts} memories=${memories.length}`,
  });
  db.close();
}

function rate(values: boolean[]): number {
  if (!values.length) return 1;
  return values.filter(Boolean).length / values.length;
}

const dateRows = rows.filter((row) => row.dateOk !== null);
const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
const percentile = (p: number) =>
  latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] ?? 0;

const summary = {
  cases: rows.length,
  objectMode: rate(rows.map((row) => row.modeOk)),
  commitmentCount: rate(rows.map((row) => row.countOk)),
  memoryBehaviour: rate(rows.map((row) => row.memoryOk)),
  dateResolution: rate(dateRows.map((row) => row.dateOk === true)),
  latencyMs: { p50: percentile(50), p95: percentile(95) },
};

console.log("LLM benchmark (deepseek-chat)\n");
console.log("case                 mode  count  memory  date   ms    detail");
for (const row of rows) {
  console.log(
    `${row.id.padEnd(20)} ${row.modeOk ? " ok " : " miss"}  ${row.countOk ? " ok " : " miss"}   ${row.memoryOk ? " ok " : " miss"}   ${
      row.dateOk === null ? "  - " : row.dateOk ? " ok " : " miss"
    }  ${String(row.latencyMs).padStart(5)}  ${row.detail}`
  );
}
console.log("\nsummary");
console.log(`  object mode accuracy : ${(summary.objectMode * 100).toFixed(1)}%`);
console.log(`  commitment count     : ${(summary.commitmentCount * 100).toFixed(1)}%`);
console.log(`  memory behaviour     : ${(summary.memoryBehaviour * 100).toFixed(1)}%`);
console.log(`  date resolution      : ${(summary.dateResolution * 100).toFixed(1)}%`);
console.log(`  latency p50/p95      : ${summary.latencyMs.p50}ms / ${summary.latencyMs.p95}ms`);

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, "results.json");
writeFileSync(
  outPath,
  JSON.stringify({ ran_at: nowIso(), model: "deepseek-chat", summary, rows }, null, 2) + "\n"
);
console.log(`\nwrote ${path.relative(process.cwd(), outPath)}`);
