import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import {
  DevLLMProvider,
  listCommitments,
  migrate,
  overrideCommitmentClassification,
  rebuildCommitmentClassifications,
  type LLMProvider,
} from "@aldus-palace/core";
import { createTestDb, SqliteTestDatabase, TEST_NOW } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const db = await createTestDb();
const migration = (await db
  .prepare(
    `SELECT version FROM schema_migrations
     WHERE version = '2026-07-22-work-classification-v1'`
  )
  .get()) as { version: string } | undefined;
assert(migration != null, "the idempotent classification migration must be recorded");

const oldSqlite = new Database(":memory:");
oldSqlite.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
  CREATE TABLE users (id TEXT PRIMARY KEY);
  CREATE TABLE raw_inputs (
    id TEXT PRIMARY KEY,
    processing_generation_id TEXT,
    processing_lease_until TEXT,
    result_generation_id TEXT
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    aliases TEXT,
    brief TEXT
  );
  CREATE TABLE thoughts (id TEXT PRIMARY KEY, title TEXT);
  CREATE TABLE commitments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    project_id TEXT REFERENCES projects(id),
    optimized_content TEXT,
    goal TEXT
  );
`);
const oldDb = new SqliteTestDatabase(oldSqlite);
await migrate(oldDb);
const migratedTables = (await oldDb
  .prepare(
    `SELECT COUNT(*) AS count FROM sqlite_master
     WHERE type = 'table' AND name IN (
       'commitment_classifications', 'commitment_classification_runs'
     )`
  )
  .get()) as { count: number };
assert(migratedTables.count === 2, "an old production schema must gain both projection tables");
const migratedRunColumns = (await oldDb
  .prepare("PRAGMA table_info(commitment_classification_runs)")
  .all()) as Array<{ name: string }>;
assert(
  ["classifier_version", "execution_mode"].every((name) =>
    migratedRunColumns.some((column) => column.name === name)
  ),
  "the migration must install the current cache-key columns"
);

const now = TEST_NOW;
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'zh-CN', ?, ?)`
  )
  .run(now, now);
await db
  .prepare(
    `INSERT INTO projects
     (id, user_id, name, description, brief, status, created_at, updated_at)
     VALUES ('p-orvia', 'u1', 'Nimbus', '原生邮件客户端',
             '当前重点包括邮件体验、官网获客、上架表达和产品稳定性。',
             'active', ?, ?)`
  )
  .run(now, now);

const titles = [
  "为 Nimbus 集成 PostHog 和 Sentry",
  "给 Nimbus 官网加独立 Feedback form",
  "弱化发件箱按钮，改为同步状态提示",
  "检查并优化 Nimbus 验证邮件排版",
  "为 iPhone 版 Nimbus Mail 添加邮件自动合并功能",
  "实现 Nimbus 侧边栏手动调整宽度",
  "测试社交内容 GSC 索引技巧",
  "为 Nimbus 设计至少 3 个不同受众的 App Store 页面概念",
  "为 Nimbus 设计至少 3 个受众的产品页文案和截图",
];
const insertCommitment = db.prepare(
  `INSERT INTO commitments
   (id, user_id, title, optimized_content, project_id, status, created_at, updated_at)
   VALUES (?, 'u1', ?, ?, 'p-orvia', 'captured', ?, ?)`
);
for (const [index, title] of titles.entries()) {
  const timestamp = new Date(Date.parse(now) + index * 1000).toISOString();
  await insertCommitment.run(
    `c-${index + 1}`,
    title,
    `完成并验证：${title}`,
    timestamp,
    timestamp
  );
}
await db
  .prepare(
    `INSERT INTO memories
     (id, user_id, type, content, project_id, status, source, created_at, updated_at)
     VALUES ('m-active', 'u1', 'project_context', 'Nimbus 当前增长重点是官网自然获客。',
             'p-orvia', 'active', 'user_explicit', ?, ?)`
  )
  .run(now, now);
for (const index of [2, 3, 4]) {
  await db
    .prepare(
      `INSERT INTO memories
       (id, user_id, type, content, project_id, status, source, importance, created_at, updated_at)
       VALUES (?, 'u1', 'project_context', ?, 'p-orvia', 'active', 'user_explicit', ?, ?, ?)`
    )
    .run(`m-active-${index}`, `同项目已确认记忆 ${index}`, 1 - index / 10, now, now);
}
await db
  .prepare(
    `INSERT INTO memories
     (id, user_id, type, content, project_id, status, source, created_at, updated_at)
     VALUES ('m-candidate', 'u1', 'project_context', '这条候选记忆不能影响分类。',
             'p-orvia', 'candidate', 'ai_inferred', ?, ?)`
  )
  .run(now, now);

const app = createApp({
  db,
  llm: new DevLLMProvider(),
  config: {
    devAuthToken: "classification-test-token",
    user: { name: "Tester", timezone: "Asia/Shanghai", language: "zh" },
  },
});

const headers = {
  Authorization: "Bearer classification-test-token",
  "Content-Type": "application/json",
};

const rebuild = await app.request("/v1/commitment-classifications/rebuild", {
  method: "POST",
  headers,
  body: "{}",
});
assert(rebuild.status === 200, `expected rebuild 200, got ${rebuild.status}`);
const rebuildBody = (await rebuild.json()) as {
  status: string;
  assignment_count: number;
  group_count: number;
  memory_count: number;
};
assert(rebuildBody.status === "ready", "classification rebuild must complete");
assert(
  rebuildBody.assignment_count === titles.length,
  "every open commitment must receive one display group"
);
assert(
  rebuildBody.group_count === 1,
  `AI-unavailable fallback must stay at the Project level, got ${rebuildBody.group_count}`
);
assert(
  rebuildBody.memory_count === 3,
  `classification context must cap related active memories at 3, got ${rebuildBody.memory_count}`
);

const firstPage = await app.request("/v1/commitments?limit=3", { headers });
assert(firstPage.status === 200, `expected list 200, got ${firstPage.status}`);
const firstPageBody = (await firstPage.json()) as {
  items: Array<{
    id: string;
    work_group_key?: string;
    work_group_label?: string;
    work_group_source?: string;
  }>;
  total: number;
  next_cursor: string | null;
};
assert(firstPageBody.items.length === 3, "the API must honor the page limit");
assert(firstPageBody.total === titles.length, "the API must expose the full list count");
assert(firstPageBody.next_cursor != null, "a partial page must include a next cursor");
const secondPage = await app.request(
  `/v1/commitments?limit=3&cursor=${encodeURIComponent(firstPageBody.next_cursor)}`,
  { headers }
);
const secondPageBody = (await secondPage.json()) as typeof firstPageBody;
assert(secondPageBody.items.length === 3, "the cursor must load the next page");
assert(
  secondPageBody.items.every(
    (item) => !firstPageBody.items.some((first) => first.id === item.id)
  ),
  "cursor pages must not repeat commitments"
);

const list = await app.request("/v1/commitments?limit=100", { headers });
const listBody = (await list.json()) as typeof firstPageBody;
assert(listBody.items.length === titles.length, "all commitments must remain visible");
assert(
  listBody.items.every(
    (item) => item.work_group_key && item.work_group_label && item.work_group_source
  ),
  "the list must expose a renderable classification for every item"
);
assert(
  new Set(listBody.items.map((item) => item.work_group_key)).size ===
    rebuildBody.group_count,
  "the rebuild and list group counts must agree"
);

const aiDb = await createTestDb();
await aiDb
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u-ai', 'AI Tester', 'Asia/Shanghai', 'zh-CN', ?, ?)`
  )
  .run(now, now);
await aiDb
  .prepare(
    `INSERT INTO projects
     (id, user_id, name, description, status, created_at, updated_at)
     VALUES ('p-ai', 'u-ai', 'Nimbus', '原生邮件客户端', 'active', ?, ?)`
  )
  .run(now, now);
const aiInsert = aiDb.prepare(
  `INSERT INTO commitments
   (id, user_id, title, project_id, status, created_at, updated_at)
   VALUES (?, 'u-ai', ?, 'p-ai', 'captured', ?, ?)`
);
const aiCommitments: Array<[string, string]> = [
  ["ai-mail-1", "优化邮件阅读体验"],
  ["ai-mail-2", "调整邮件侧边栏"],
  ["ai-mail-3", "实现邮件自动合并"],
  ["ai-release-1", "制作 App Store 截图"],
  ["ai-release-2", "调整官网发布文案"],
  ["ai-release-3", "准备产品上架页面"],
];
for (const [index, [id, title]] of aiCommitments.entries()) {
  const updated = new Date(Date.parse(now) + index * 1000).toISOString();
  await aiInsert.run(id, title, updated, updated);
}

class FixedClassificationProvider implements LLMProvider {
  readonly name = "fixed-classification";

  async complete(): Promise<string> {
    return JSON.stringify({
      groups: [
        {
          group_key: "new:mail-experience",
          label: "邮件体验",
          commitment_ids: ["ai-mail-1", "ai-mail-2", "ai-mail-3"],
          reason: "共同改善邮件使用体验",
        },
        {
          group_key: "new:release-growth",
          label: "发布增长",
          commitment_ids: ["ai-release-1", "ai-release-2", "ai-release-3"],
          reason: "共同服务产品发布与表达",
        },
      ],
    });
  }
}

const aiResult = await rebuildCommitmentClassifications(
  aiDb,
  new FixedClassificationProvider(),
  "u-ai"
);
assert(aiResult.status === "ready", "valid AI grouping must be accepted");
assert(aiResult.used_fallback === false, "a valid real-model result is not fallback");
const aiItems = (await listCommitments(aiDb, "u-ai")) as Array<{
  id: string;
  work_group_key: string;
  work_group_label: string;
}>;
assert(
  new Set(aiItems.map((item) => item.work_group_label)).has("邮件体验") &&
    new Set(aiItems.map((item) => item.work_group_label)).has("发布增长"),
  "the API projection must use the validated AI work-stream taxonomy"
);
const manual = await overrideCommitmentClassification(
  aiDb,
  "u-ai",
  "ai-mail-1",
  aiItems.find((item) => item.work_group_label === "发布增长")!.work_group_key as string
);
assert(manual?.source === "user", "a user may correct work into an existing same-project group");
const rebuildAfterOverride = await rebuildCommitmentClassifications(
  aiDb,
  new FixedClassificationProvider(),
  "u-ai"
);
assert(rebuildAfterOverride.status === "ready", "rebuild after override must remain ready");
const overriddenItem = (await listCommitments(aiDb, "u-ai")).find(
  (item) => item.id === "ai-mail-1"
);
assert(
  overriddenItem?.work_group_label === "发布增长" &&
    overriddenItem.work_group_source === "user",
  "a manual work-stream correction must survive later AI rebuilds"
);
await aiDb
  .prepare(
    `UPDATE commitments SET status = 'completed', completed_at = ?, updated_at = ?
     WHERE id = 'ai-mail-1'`
  )
  .run(now, now);
class MustNotReclassifyCompletedWork implements LLMProvider {
  readonly name = "fixed-classification";

  async complete(): Promise<string> {
    throw new Error("completion must not trigger model classification");
  }
}
const afterCompletion = await rebuildCommitmentClassifications(
  aiDb,
  new MustNotReclassifyCompletedWork(),
  "u-ai"
);
assert(
  afterCompletion.status === "ready" && afterCompletion.changed === false,
  "completing work must only filter the projection, not rebuild its taxonomy"
);
await overrideCommitmentClassification(
  aiDb,
  "u-ai",
  "ai-mail-2",
  aiItems.find((item) => item.work_group_label === "发布增长")!.work_group_key
);
await aiDb
  .prepare(
    `INSERT INTO projects
     (id, user_id, name, status, created_at, updated_at)
     VALUES ('p-ai-new', 'u-ai', 'New Project', 'active', ?, ?)`
  )
  .run(now, now);
await aiDb
  .prepare(
    `UPDATE commitments SET project_id = 'p-ai-new', updated_at = ?
     WHERE id = 'ai-mail-2'`
  )
  .run(now);
const reassociatedFallback = (await listCommitments(aiDb, "u-ai")).find(
  (item) => item.id === "ai-mail-2"
);
assert(
  reassociatedFallback?.work_group_label === "New Project" &&
    reassociatedFallback.work_group_source === "fallback",
  "Project reassociation must immediately hide an incompatible manual group"
);
class ReassociatedProjectProvider implements LLMProvider {
  readonly name = "fixed-classification";
  async complete(): Promise<string> {
    return JSON.stringify({
      groups: [
        {
          group_key: "new:new-project",
          label: "新项目工作",
          commitment_ids: ["ai-mail-2"],
        },
        {
          group_key: "new:mail-remaining",
          label: "邮件体验",
          commitment_ids: ["ai-mail-3"],
        },
        {
          group_key: "new:release-remaining",
          label: "发布增长",
          commitment_ids: ["ai-release-1", "ai-release-2", "ai-release-3"],
        },
      ],
    });
  }
}
const reassociatedResult = await rebuildCommitmentClassifications(
  aiDb,
  new ReassociatedProjectProvider(),
  "u-ai"
);
assert(reassociatedResult.status === "ready", "Project reassociation must rebuild cleanly");
const reassociatedItem = (await listCommitments(aiDb, "u-ai")).find(
  (item) => item.id === "ai-mail-2"
);
assert(
  reassociatedItem?.work_group_label === "新项目工作" &&
    reassociatedItem.work_group_source === "ai",
  "a Project change must invalidate and replace the old manual override"
);

const failureDb = await createTestDb();
await failureDb
  .prepare(
    `INSERT INTO users (id, timezone, language, created_at, updated_at)
     VALUES ('u-failure', 'Asia/Shanghai', 'zh-CN', ?, ?)`
  )
  .run(now, now);
await failureDb
  .prepare(
    `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
     VALUES ('p-failure', 'u-failure', 'Fallback Project', 'active', ?, ?)`
  )
  .run(now, now);
await failureDb
  .prepare(
    `INSERT INTO commitments
     (id, user_id, title, project_id, status, created_at, updated_at)
     VALUES ('c-failure', 'u-failure', '一个仍需显示的事项', 'p-failure',
             'captured', ?, ?)`
  )
  .run(now, now);

class BrokenClassificationProvider implements LLMProvider {
  readonly name = "broken-classification";

  async complete(): Promise<string> {
    throw new Error("model unavailable");
  }
}

const failureResult = (await rebuildCommitmentClassifications(
  failureDb,
  new BrokenClassificationProvider(),
  "u-failure"
)) as { status: string; used_fallback: boolean };
assert(
  failureResult.status === "failed" && failureResult.used_fallback,
  "model failure must produce an explicit fallback result instead of throwing"
);
const failureItems = await listCommitments(failureDb, "u-failure");
assert(
  failureItems.length === 1 &&
    failureItems[0].work_group_label === "Fallback Project" &&
    failureItems[0].work_group_source === "fallback",
  "model failure must leave the complete Work list available by Project fallback"
);

const anchorDb = await createTestDb();
await anchorDb
  .prepare(
    `INSERT INTO users (id, timezone, language, created_at, updated_at)
     VALUES ('u-anchor', 'Asia/Shanghai', 'zh-CN', ?, ?)`
  )
  .run(now, now);
for (const [id, name] of [
  ["p-one", "Project One"],
  ["p-two", "Project Two"],
]) {
  await anchorDb
    .prepare(
      `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
       VALUES (?, 'u-anchor', ?, 'active', ?, ?)`
    )
    .run(id, name, now, now);
}
for (const [id, projectId] of [
  ["anchor-one", "p-one"],
  ["anchor-two", "p-two"],
]) {
  await anchorDb
    .prepare(
      `INSERT INTO commitments
       (id, user_id, title, project_id, status, created_at, updated_at)
       VALUES (?, 'u-anchor', ?, ?, 'captured', ?, ?)`
    )
    .run(id, `Work for ${projectId}`, projectId, now, now);
}
class LocalFallbackProvider implements LLMProvider {
  readonly name = "dev";
  async complete(): Promise<string> {
    throw new Error("local fallback must not call a model");
  }
}
await rebuildCommitmentClassifications(
  anchorDb,
  new LocalFallbackProvider(),
  "u-anchor"
);
let blockedCrossProjectOverride = false;
try {
  await overrideCommitmentClassification(
    anchorDb,
    "u-anchor",
    "anchor-one",
    "project:p-two"
  );
} catch (error) {
  blockedCrossProjectOverride =
    error instanceof Error && error.message === "unknown_work_group";
}
assert(blockedCrossProjectOverride, "manual correction must preserve the Project hard anchor");

class CrossProjectProvider implements LLMProvider {
  readonly name = "cross-project-test";
  async complete(): Promise<string> {
    return JSON.stringify({
      groups: [
        {
          group_key: "new:mixed",
          label: "混合项目",
          commitment_ids: ["anchor-one", "anchor-two"],
        },
      ],
    });
  }
}
const crossProjectResult = await rebuildCommitmentClassifications(
  anchorDb,
  new CrossProjectProvider(),
  "u-anchor"
);
assert(
  crossProjectResult.status === "failed",
  "model output that mixes Projects into one group must be rejected"
);
for (let index = 3; index <= 7; index += 1) {
  await anchorDb
    .prepare(
      `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
       VALUES (?, 'u-anchor', ?, 'active', ?, ?)`
    )
    .run(`p-${index}`, `Project ${index}`, now, now);
  await anchorDb
    .prepare(
      `INSERT INTO commitments
       (id, user_id, title, project_id, status, created_at, updated_at)
       VALUES (?, 'u-anchor', ?, ?, 'captured', ?, ?)`
    )
    .run(`anchor-${index}`, `Work for project ${index}`, `p-${index}`, now, now);
}
const cappedFallback = await rebuildCommitmentClassifications(
  anchorDb,
  new LocalFallbackProvider(),
  "u-anchor"
);
assert(
  cappedFallback.group_count === 6,
  "Project fallback must merge overflow instead of rendering more than 6 groups"
);

const leaseDb = await createTestDb();
await leaseDb
  .prepare(
    `INSERT INTO users (id, timezone, language, created_at, updated_at)
     VALUES ('u-lease', 'Asia/Shanghai', 'zh-CN', ?, ?)`
  )
  .run(now, now);
await leaseDb
  .prepare(
    `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
     VALUES ('p-lease', 'u-lease', 'Lease Project', 'active', ?, ?)`
  )
  .run(now, now);
for (let index = 1; index <= 5; index += 1) {
  await leaseDb
    .prepare(
      `INSERT INTO commitments
       (id, user_id, title, project_id, status, created_at, updated_at)
       VALUES (?, 'u-lease', ?, 'p-lease', 'captured', ?, ?)`
    )
    .run(`lease-${index}`, `Lease work ${index}`, now, now);
}
let releaseLeaseProvider: ((value: string) => void) | undefined;
const leaseResponse = new Promise<string>((resolve) => {
  releaseLeaseProvider = resolve;
});
class DeferredProvider implements LLMProvider {
  readonly name = "deferred-test";
  async complete(): Promise<string> {
    return leaseResponse;
  }
}
const firstLeaseOwner = rebuildCommitmentClassifications(
  leaseDb,
  new DeferredProvider(),
  "u-lease"
);
await Promise.resolve();
const concurrentLeaseResult = await rebuildCommitmentClassifications(
  leaseDb,
  new DeferredProvider(),
  "u-lease"
);
assert(
  concurrentLeaseResult.status === "running",
  "a concurrent rebuild must observe the active lease instead of calling the model again"
);
releaseLeaseProvider?.(
  JSON.stringify({
    groups: [
      {
        group_key: "new:lease-a",
        label: "第一组",
        commitment_ids: ["lease-1", "lease-2", "lease-3"],
      },
      {
        group_key: "new:lease-b",
        label: "第二组",
        commitment_ids: ["lease-4", "lease-5"],
      },
    ],
  })
);
assert(
  (await firstLeaseOwner).status === "ready",
  "the lease owner must atomically publish the finished projection"
);

console.log("commitment classification API test passed.");
