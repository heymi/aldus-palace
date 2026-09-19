import {
  addDependency,
  blockedCommitmentIds,
  listDependencies,
  removeDependency,
} from "../src/services/dependencies.js";
import { reconcileTodayPlan } from "../src/services/adaptivePlanning.js";
import { createTestDb, finish } from "./support/db.js";
import type { SqlDatabase } from "../src/db/port.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const NOW = "2026-07-19T04:00:00.000Z";

async function makeDb(): Promise<SqlDatabase> {
  const db = await createTestDb();
  await db
    .prepare(
      `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
       VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
    )
    .run(NOW, NOW);
  return db;
}

async function addCommitment(
  db: SqlDatabase,
  id: string,
  title: string,
  status = "captured"
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO commitments
       (id, user_id, title, status, duration_minutes, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, 45, ?, ?)`
    )
    .run(id, title, status, NOW, NOW);
}

const db = await makeDb();
await addCommitment(db, "a", "Write the spec");
await addCommitment(db, "b", "Get the approval");
await addCommitment(db, "c", "Ship the page");

// --- basics -----------------------------------------------------------------

const added = await addDependency(db, "u1", "a", "b");
assert(added.ok, "a dependency can be added");
assert(added.ok && added.blocked_by.length === 1, "the blocker is recorded");
assert((await listDependencies(db, "u1", "a"))[0] === "b", "the blocker is listed");

const duplicate = await addDependency(db, "u1", "a", "b");
assert(duplicate.ok && duplicate.blocked_by.length === 1, "adding twice keeps one row");

const self = await addDependency(db, "u1", "a", "a");
assert(!self.ok && self.error === "self_dependency", "an item cannot block itself");

const missing = await addDependency(db, "u1", "a", "nope");
assert(!missing.ok && missing.error === "blocker_not_found", "an unknown blocker is refused");

const missingItem = await addDependency(db, "u1", "nope", "a");
assert(!missingItem.ok && missingItem.error === "not_found", "an unknown item is refused");

// --- cycles -----------------------------------------------------------------

const direct = await addDependency(db, "u1", "b", "a");
assert(!direct.ok && direct.error === "cycle_detected", "a two-item cycle is refused");

await addDependency(db, "u1", "c", "a");
const deep = await addDependency(db, "u1", "b", "c");
assert(!deep.ok && deep.error === "cycle_detected", "a longer cycle is refused");

// --- what is blocked --------------------------------------------------------

const blocked = await blockedCommitmentIds(db, "u1");
assert(blocked.has("a") && blocked.has("c"), "items with an open blocker are blocked");
assert(!blocked.has("b"), "the blocker itself is not blocked");

await db
  .prepare(
    `UPDATE commitments SET status = 'completed', completed_at = ? WHERE id = 'b'`
  )
  .run(NOW);
const afterCompletion = await blockedCommitmentIds(db, "u1");
assert(!afterCompletion.has("a"), "a completed blocker stops blocking");
assert(afterCompletion.has("c"), "another open blocker still blocks");

// --- removal ----------------------------------------------------------------

const removed = await removeDependency(db, "u1", "c", "a");
assert(removed.ok && removed.blocked_by.length === 0, "a dependency can be removed");
const removedAgain = await removeDependency(db, "u1", "c", "a");
assert(!removedAgain.ok && removedAgain.error === "not_found", "removing twice is a miss");

// --- the planner skips blocked work -----------------------------------------

const planDb = await makeDb();
await addCommitment(planDb, "blocker", "Approve the plan");
await addCommitment(planDb, "blocked", "Start the build");
await addDependency(planDb, "u1", "blocked", "blocker");

const first = await reconcileTodayPlan(planDb, "u1", "Asia/Shanghai", {
  at: new Date(NOW),
  planVersion: "2026-07-19:deps-1",
});
assert(
  !first.picked.some((item) => item.id === "blocked"),
  "the planner does not schedule a blocked commitment"
);

await planDb
  .prepare(
    `UPDATE commitments SET status = 'completed', completed_at = ? WHERE id = 'blocker'`
  )
  .run(NOW);
const second = await reconcileTodayPlan(planDb, "u1", "Asia/Shanghai", {
  at: new Date(NOW),
  planVersion: "2026-07-19:deps-2",
});
assert(
  second.picked.some((item) => item.id === "blocked"),
  "completing the blocker releases the work"
);

// --- the audit trail --------------------------------------------------------

const logs = (await db
  .prepare(
    `SELECT action_type FROM action_logs WHERE user_id = 'u1' ORDER BY created_at ASC`
  )
  .all()) as Array<{ action_type: string }>;
const types = logs.map((row) => row.action_type);
assert(types.includes("dependency_added"), "adding a dependency is logged");
assert(types.includes("dependency_removed"), "removing a dependency is logged");

finish("dependency tests passed.");
