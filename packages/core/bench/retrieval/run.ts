/**
 * Retrieval benchmark.
 *
 *   pnpm bench:retrieval
 *
 * A labeled corpus of memories and queries, run through the FTS5 retriever, with
 * Recall@K and MRR. Deterministic and offline, so it belongs with the other
 * benchmarks; the design is in docs/RETRIEVER.md.
 */

import { nowIso } from "../../src/db/port.js";
import { indexMemory, retrieveMemoryIds } from "../../src/lib/retriever.js";
import { createTestDb } from "../../test/support/db.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KS = [1, 3, 5];

type Memory = { id: string; type: string; content: string };

const memories: Memory[] = [
  { id: "m-tools", type: "preference", content: "Prefers simple tools and calm interfaces" },
  { id: "m-startup", type: "project_context", content: "Orvia is a private, local-first email client" },
  { id: "m-mac", type: "decision", content: "Keep the product Mac-only and skip Windows" },
  { id: "m-launch", type: "project_context", content: "The launch depends on the legal review of the contract" },
  { id: "m-pricing", type: "decision", content: "Charged yearly for the pro plan, not monthly" },
  { id: "m-mornings", type: "preference", content: "Does the hardest work in the morning" },
  { id: "m-zh-keep", type: "principle", content: "以后产品不要做太复杂，保持克制" },
  { id: "m-zh-mail", type: "project_context", content: "Nimbus 是一个注重隐私的邮件客户端" },
  { id: "m-zh-friday", type: "decision", content: "评审改到周五，先不做" },
  { id: "m-notes", type: "experience", content: "Meeting notes from the pricing discussion" },
  { id: "m-design", type: "preference", content: "Prefers dense dashboards with more features" },
  { id: "m-sync", type: "decision", content: "No cloud sync; the database stays local" },
];

type Query = { query: string; relevant: string[] };

const queries: Query[] = [
  { query: "simple tools", relevant: ["m-tools"] },
  { query: "privacy email client", relevant: ["m-startup"] },
  { query: "windows", relevant: ["m-mac"] },
  { query: "launch legal contract", relevant: ["m-launch"] },
  { query: "pro plan pricing", relevant: ["m-pricing"] },
  { query: "morning work", relevant: ["m-mornings"] },
  { query: "克制 复杂", relevant: ["m-zh-keep"] },
  { query: "邮件 隐私", relevant: ["m-zh-mail"] },
  { query: "dashboard features", relevant: ["m-design"] },
  { query: "cloud sync", relevant: ["m-sync"] },
];

const db = await createTestDb();
const now = nowIso();
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Bench', 'UTC', 'en', ?, ?)`
  )
  .run(now, now);
for (const memory of memories) {
  await db
    .prepare(
      `INSERT INTO memories
       (id, user_id, type, content, status, source, confidence, importance, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, 'active', 'user_explicit', 0.9, 0.8, ?, ?)`
    )
    .run(memory.id, memory.type, memory.content, now, now);
  await indexMemory(db, memory.id, memory.content);
}

const maxK = Math.max(...KS);
const recall: Record<number, number> = {};
const reciprocalRanks: number[] = [];
const misses: string[] = [];

for (const testCase of queries) {
  const ranked = await retrieveMemoryIds(db, "u1", testCase.query, { limit: maxK });
  const relevant = new Set(testCase.relevant);
  for (const k of KS) {
    const hit = ranked.slice(0, k).filter((id) => relevant.has(id)).length;
    recall[k] = (recall[k] ?? 0) + hit / relevant.size;
  }
  const firstRank = ranked.findIndex((id) => relevant.has(id));
  reciprocalRanks.push(firstRank >= 0 ? 1 / (firstRank + 1) : 0);
  if (firstRank < 0) misses.push(`${testCase.query} → ${JSON.stringify(ranked.slice(0, 3))}`);
}

for (const k of KS) recall[k] = recall[k] / queries.length;
const mrr = reciprocalRanks.reduce((sum, value) => sum + value, 0) / reciprocalRanks.length;

const summary = {
  memories: memories.length,
  queries: queries.length,
  recall: Object.fromEntries(KS.map((k) => [`@${k}`, recall[k]])),
  mrr,
};

console.log("Retrieval benchmark (FTS5, deterministic, offline)\n");
console.log("k     recall");
for (const k of KS) console.log(`@${k}    ${recall[k].toFixed(3)}`);
console.log(`MRR   ${mrr.toFixed(3)}`);
if (misses.length) {
  console.log("\nNo relevant result in the top set:");
  for (const miss of misses) console.log(`  ${miss}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
writeFileSync(
  path.join(here, "results.json"),
  JSON.stringify({ ran_at: nowIso(), summary }, null, 2) + "\n"
);
console.log(`\nwrote ${path.relative(process.cwd(), path.join(here, "results.json"))}`);
