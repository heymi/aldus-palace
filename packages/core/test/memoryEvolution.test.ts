import { createTestDb, finish } from "./support/db.js";
import {
  detectMemoryConflict,
  listMemoryVersions,
  memoryState,
  ruleConflict,
  supersedeMemory,
} from "../src/services/memoryEvolution.js";
import {
  confirmMemory,
  listMemoriesByStatus,
} from "../src/services/memoryLifecycle.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- rule-based detection --------------------------------------------------

assert(
  ruleConflict(
    { type: "decision", content: "开始做 iOS 版，下个季度排期" },
    { type: "decision", content: "不做移动端，保持 Mac-only" }
  ) !== null,
  "a platform polarity flip must be reported as a conflict"
);

assert(
  ruleConflict(
    { type: "preference", content: "希望界面更复杂一些，增加更多功能" },
    { type: "preference", content: "喜欢简洁，不要复杂" }
  ) !== null,
  "a complexity polarity flip must be reported as a conflict"
);

assert(
  ruleConflict(
    { type: "decision", content: "不做 Windows 版" },
    { type: "decision", content: "不做移动端" }
  ) === null,
  "two negative statements are agreement, not a conflict"
);

assert(
  ruleConflict(
    { type: "decision", content: "开始做 iOS 版" },
    { type: "preference", content: "不做移动端" }
  ) === null,
  "different memory types never conflict"
);

assert(
  ruleConflict(
    { type: "project_context", content: "Nimbus 是一个邮件客户端" },
    { type: "project_context", content: "Nimbus 的定位是原生邮件体验" }
  ) === null,
  "unrelated wording on a non-topic pair is not a conflict"
);

// --- derived state ---------------------------------------------------------

assert(memoryState({ status: "active" }) === "active", "active state");
assert(memoryState({ status: "candidate" }) === "candidate", "candidate state");
assert(memoryState({ status: "archived" }) === "archived", "archived state");
assert(
  memoryState({ status: "archived", superseded_by_id: "mem_new" }) === "superseded",
  "a pointer to a replacement is what makes a memory superseded"
);

// --- database-backed flows -------------------------------------------------

const db = await createTestDb();
const now = "2026-09-19T04:00:00.000Z";
await db
  .prepare(
    `INSERT INTO users (id, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Asia/Tokyo', 'zh', ?, ?)`
  )
  .run(now, now);

async function insertMemory(
  id: string,
  content: string,
  status: "candidate" | "active",
  type = "decision"
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO memories
       (id, user_id, type, content, status, confidence, importance, source, evidence,
        confirmed_at, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, ?, 0.9, 0.8, 'user_explicit', ?, ?, ?, ?)`
    )
    .run(id, type, content, status, content, status === "active" ? now : null, now, now);
}

await insertMemory("mem_old", "不做移动端，保持 Mac-only", "active");

const conflict = await detectMemoryConflict(db, "u1", {
  type: "decision",
  content: "开始做 iOS 版，下个季度排期",
});
assert(conflict !== null, "the active memory must be found as a conflict");
assert(conflict!.memory_id === "mem_old", `conflict points at mem_old: ${conflict!.memory_id}`);
assert(conflict!.detector === "rule", "rule detector used without a model");
assert(conflict!.reason.length > 0, "conflict carries a human-readable reason");

assert(
  (await detectMemoryConflict(db, "u1", { type: "preference", content: "喜欢键盘操作" })) === null,
  "an unrelated candidate has no conflict"
);

// A candidate is created first, then confirmed with an explicit supersede.
await insertMemory("mem_new", "开始做 iOS 版，下个季度排期", "candidate");

const confirmed = await confirmMemory(db, "u1", "mem_new", undefined, {
  supersedes: "mem_old",
  reason: "the user reversed the Mac-only decision",
});
assert(confirmed.ok, "confirm with supersedes must succeed");
assert(confirmed.superseded !== undefined, "the superseded memory is returned");
assert(
  memoryState(confirmed.memory) === "active",
  "the replacement is active"
);
assert(
  memoryState(confirmed.superseded!) === "superseded",
  `the old memory becomes superseded, got ${memoryState(confirmed.superseded!)}`
);
assert(
  confirmed.superseded!.supersede_reason === "the user reversed the Mac-only decision",
  "the reason is preserved"
);

const versions = await listMemoryVersions(db, "u1", "mem_new");
assert(
  versions.length === 2,
  `the version chain has both entries, got ${versions.length}`
);
assert(
  String(versions[0]!.id) === "mem_old" && String(versions[1]!.id) === "mem_new",
  "versions are ordered oldest → newest"
);
assert(
  memoryState(versions[0]!) === "superseded",
  "history keeps the old memory readable"
);

const active = await listMemoriesByStatus(db, "u1", "active");
assert(
  active.length === 1 && String(active[0]!.id) === "mem_new",
  "only the replacement is active"
);

// A superseded memory cannot be superseded again, and a candidate cannot replace.
const again = await supersedeMemory(db, "u1", { oldId: "mem_old", newId: "mem_new" });
assert(
  again.ok === false && again.error === "already_superseded",
  `re-superseding is refused, got ${JSON.stringify(again)}`
);

await insertMemory("mem_active_windows", "支持 Windows 版", "active");
await insertMemory("mem_candidate", "也许以后支持 Windows", "candidate");
const bad = await supersedeMemory(db, "u1", {
  oldId: "mem_active_windows",
  newId: "mem_candidate",
});
assert(
  bad.ok === false && bad.error === "not_confirmed",
  `a candidate cannot act as a replacement, got ${JSON.stringify(bad)}`
);

const logs = (await db
  .prepare(`SELECT action_type FROM action_logs WHERE action_type = 'memory_superseded'`)
  .all()) as Array<{ action_type: string }>;
assert(logs.length === 1, "superseding is recorded in the action log");

finish("memory evolution tests passed.");
