/**
 * Memory gate, standalone.
 *
 *   pnpm --filter @aldus-palace/example-memory-gate-only start
 *
 * Walks the whole lifecycle of one belief:
 *   candidate → conflict detected → user confirms → older memory superseded.
 * Nothing is ever overwritten: the previous version stays readable.
 */

import {
  confirmMemory,
  detectMemoryConflict,
  listMemoriesByState,
  listMemoryVersions,
  newId,
  nowIso,
  type SqlDatabase,
} from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const db = await openSqliteDatabase(":memory:", { wal: false });
await seed(db);

async function store(
  content: string,
  status: "candidate" | "active",
  type = "decision"
): Promise<string> {
  const id = newId("mem");
  const t = nowIso();
  await db
    .prepare(
      `INSERT INTO memories
       (id, user_id, type, content, status, confidence, importance, source, evidence,
        confirmed_at, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, ?, 0.9, 0.85, 'user_explicit', ?, ?, ?, ?)`
    )
    .run(id, type, content, status, content, status === "active" ? t : null, t, t);
  return id;
}

// 1. A belief the user already confirmed.
const original = await store("不做移动端，保持 Mac-only", "active");
console.log(`▸ confirmed: “不做移动端，保持 Mac-only”  (${original})`);

// 2. Later, a capture contradicts it.
const candidateContent = "开始做 iOS 版，下个季度排期";
const candidate = await store(candidateContent, "candidate");
console.log(`\n▸ new candidate: “${candidateContent}”`);

const conflict = await detectMemoryConflict(db, "u1", {
  type: "decision",
  content: candidateContent,
});
console.log(
  conflict
    ? `  ⚠ conflict with “${conflict.memory_content}” — ${conflict.reason} (detector: ${conflict.detector})`
    : "  no conflict"
);

// 3. The user decides to replace it. History is preserved.
const result = await confirmMemory(db, "u1", candidate, undefined, {
  supersedes: conflict!.memory_id,
  reason: "the user reversed the Mac-only decision",
});
console.log(`\n▸ user confirmed with replace: ok=${result.ok}`);

// 4. What the knowledge base now looks like.
for (const state of ["active", "superseded", "candidate"] as const) {
  const rows = await listMemoriesByState(db, "u1", state);
  console.log(`  ${state.padEnd(11)} ${rows.length}`);
}

console.log("\n▸ version chain (oldest → newest):");
for (const version of await listMemoryVersions(db, "u1", candidate)) {
  const label = version.superseded_by_id ? "superseded" : "active";
  console.log(`  [${label}] ${String(version.content)}`);
}

db.close();

async function seed(database: SqlDatabase): Promise<void> {
  const t = nowIso();
  await database
    .prepare(
      `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
       VALUES ('u1', 'Demo', 'Asia/Tokyo', 'zh-CN', ?, ?)`
    )
    .run(t, t);
}
