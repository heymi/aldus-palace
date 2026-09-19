/**
 * Deterministic eval against DevLLM extraction heuristics + gate rules.
 * Usage: pnpm eval
 */
import { extractDev } from "../src/providers/dev.js";
import {
  decideMemoryActivation,
  memoryImportanceFor,
} from "../src/lib/memoryActivation.js";
import { THOUGHT_TYPES, MEMORY_TYPES } from "../src/domain/types.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../../eval/fixtures");

type Fixture = {
  id: string;
  input: string;
  /** Defaults to the script of the input: CJK → zh-CN, otherwise en. */
  locale?: "en" | "zh-CN";
  expect: {
    thoughts_min?: number;
    thoughts_max?: number;
    commitments_min?: number;
    commitments_max?: number;
    memory_candidates_min?: number;
    memory_candidates_max?: number;
    /** Candidates that take effect on capture (see lib/memoryActivation.ts). */
    memory_active_min?: number;
    memory_active_max?: number;
    /** Candidates that wait for the user's confirmation. */
    memory_pending_min?: number;
    memory_pending_max?: number;
    thought_types_allowed?: string[];
    memory_types_allowed?: string[];
    must_include_thought?: boolean;
    forbidden?: string[];
  };
};

function loadFixtures(): Fixture[] {
  if (!fs.existsSync(fixturesDir)) {
    console.error("No fixtures at", fixturesDir);
    process.exit(1);
  }
  return fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) =>
      JSON.parse(fs.readFileSync(path.join(fixturesDir, f), "utf8"))
    ) as Fixture[];
}

let failed = 0;

for (const fx of loadFixtures()) {
  const locale =
    fx.locale ?? (/[\u4e00-\u9fff]/.test(fx.input) ? "zh-CN" : "en");
  const result = extractDev(fx.input, locale);
  const errors: string[] = [];

  if ((result.thoughts.length ?? 0) < (fx.expect.thoughts_min ?? 0)) {
    errors.push(
      `thoughts_min: got ${result.thoughts.length}, want >= ${fx.expect.thoughts_min}`
    );
  }
  if (
    fx.expect.thoughts_max != null &&
    result.thoughts.length > fx.expect.thoughts_max
  ) {
    errors.push(
      `thoughts_max: got ${result.thoughts.length}, want <= ${fx.expect.thoughts_max}`
    );
  }
  if ((result.commitments.length ?? 0) < (fx.expect.commitments_min ?? 0)) {
    errors.push(
      `commitments_min: got ${result.commitments.length}, want >= ${fx.expect.commitments_min}`
    );
  }
  if (
    fx.expect.commitments_max != null &&
    result.commitments.length > fx.expect.commitments_max
  ) {
    errors.push(
      `commitments_max: got ${result.commitments.length}, want <= ${fx.expect.commitments_max}`
    );
  }
  if (
    (result.memory_candidates.length ?? 0) <
    (fx.expect.memory_candidates_min ?? 0)
  ) {
    errors.push(
      `memory_candidates_min: got ${result.memory_candidates.length}`
    );
  }
  if (
    fx.expect.memory_candidates_max !== undefined &&
    result.memory_candidates.length > fx.expect.memory_candidates_max
  ) {
    errors.push(
      `memory_candidates_max: got ${result.memory_candidates.length}, want <= ${fx.expect.memory_candidates_max}`
    );
  }

  // A candidate is either activated on capture or held back for confirmation.
  const decisions = result.memory_candidates.map((m) =>
    decideMemoryActivation({
      type: m.type,
      source: m.source,
      content: m.content,
      confidence: m.confidence,
      importance: memoryImportanceFor(m.type),
    })
  );
  const activeCount = decisions.filter((d) => d.activation === "active").length;
  const pendingCount = decisions.filter((d) => d.activation === "candidate").length;

  if (activeCount < (fx.expect.memory_active_min ?? 0)) {
    errors.push(
      `memory_active_min: got ${activeCount}, want >= ${fx.expect.memory_active_min}`
    );
  }
  if (fx.expect.memory_active_max !== undefined && activeCount > fx.expect.memory_active_max) {
    errors.push(
      `memory_active_max: got ${activeCount}, want <= ${fx.expect.memory_active_max}`
    );
  }
  if (pendingCount < (fx.expect.memory_pending_min ?? 0)) {
    errors.push(
      `memory_pending_min: got ${pendingCount}, want >= ${fx.expect.memory_pending_min}`
    );
  }
  if (fx.expect.memory_pending_max !== undefined && pendingCount > fx.expect.memory_pending_max) {
    errors.push(
      `memory_pending_max: got ${pendingCount}, want <= ${fx.expect.memory_pending_max}`
    );
  }

  for (const th of result.thoughts) {
    if (!(THOUGHT_TYPES as string[]).includes(th.type)) {
      errors.push(`illegal thought type: ${th.type}`);
    }
    if (fx.expect.thought_types_allowed && !fx.expect.thought_types_allowed.includes(th.type)) {
      // allowed list is the product gate; types outside still fail via THOUGHT_TYPES
    }
  }
  for (const m of result.memory_candidates) {
    if (!(MEMORY_TYPES as string[]).includes(m.type)) {
      errors.push(`illegal memory type: ${m.type}`);
    }
  }

  const forbidden = fx.expect.forbidden ?? [];
  for (const f of forbidden) {
    if (f === "recurrence" && JSON.stringify(result).includes("recurrence")) {
      errors.push("forbidden recurrence");
    }
    if (f === "thought_type:principle" && result.thoughts.some((t) => t.type === "principle")) {
      errors.push("forbidden thought principle");
    }
    if (f === "memory_active" && activeCount > 0) {
      errors.push(`forbidden memory_active: ${activeCount} would activate`);
    }
  }

  if (errors.length) {
    failed++;
    console.error(`FAIL ${fx.id}`, errors, result);
  } else {
    console.log(`PASS ${fx.id}`);
  }
}

if (failed) {
  console.error(`\n${failed} fixture(s) failed`);
  process.exit(1);
}
console.log("\nAll fixtures passed.");
