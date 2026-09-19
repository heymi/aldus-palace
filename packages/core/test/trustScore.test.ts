import {
  autonomyLevelFor,
  computeTrustScore,
  effectiveStatusFor,
  getAutonomyState,
  proposeAction,
  runGatedAction,
  trustScoreFrom,
} from "../src/services/actionGate.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- the score --------------------------------------------------------------

assert(trustScoreFrom(0, 0).score === 0.5, "no history starts at 0.5");
assert(trustScoreFrom(3, 0).score === 0.8, `3/0 is 0.8, got ${trustScoreFrom(3, 0).score}`);
assert(trustScoreFrom(0, 3).score === 0.2, "3 rejections is 0.2");
assert(trustScoreFrom(5, 0).samples === 5, "samples count decisions");

// --- the level --------------------------------------------------------------

assert(autonomyLevelFor(1, 0) === 0, "no evidence is level 0");
assert(autonomyLevelFor(0.8, 3) === 1, "three approvals reach level 1");
assert(autonomyLevelFor(0.8, 5) === 2, "five approvals and 0.8 reach level 2");
assert(autonomyLevelFor(0.8, 10) === 2, "0.8 does not reach level 3");
assert(autonomyLevelFor(0.86, 10) === 3, "0.86 with ten samples reaches level 3");
assert(autonomyLevelFor(0.96, 20) === 4, "0.96 with twenty samples reaches level 4");
assert(autonomyLevelFor(0.4, 30) === 0, "a poor record stays at level 0");

// --- what runs without asking ----------------------------------------------

assert(effectiveStatusFor("low", 0) === "proposed", "level 0 proposes even low risk");
assert(effectiveStatusFor("low", 1) === "approved", "level 1 runs low risk");
assert(effectiveStatusFor("medium", 1) === "proposed", "level 1 still proposes medium risk");
assert(effectiveStatusFor("medium", 2) === "notified", "level 2 runs medium risk as a notification");
assert(effectiveStatusFor("high", 2) === "proposed", "level 2 still proposes high risk");
assert(effectiveStatusFor("high", 3) === "approved", "level 3 runs high risk");
assert(effectiveStatusFor("critical", 3) === "proposed", "level 3 still proposes critical");
assert(effectiveStatusFor("critical", 4) === "notified", "level 4 runs critical with a record");

// --- state from the proposal table -----------------------------------------

const db = await createTestDb();
const now = "2026-09-19T04:00:00.000Z";
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
  )
  .run(now, now);

async function seedDecision(
  id: string,
  status: string,
  decidedAt: string | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO action_proposals
       (id, user_id, action_type, payload, risk, status, actor, reason,
        decided_by, decided_at, confirmations, created_at, updated_at)
       VALUES (?, 'u1', 'memory_deleted', '{}', 'high', ?, 'agent', 'r',
               'user', ?, 1, ?, ?)`
    )
    .run(id, status, decidedAt, now, now);
}

for (let index = 0; index < 5; index++) {
  await seedDecision(`act_ok_${index}`, "approved", now);
}
await seedDecision("act_no", "rejected", now);
await seedDecision("act_waiting", "proposed", null);
await seedDecision("act_pending", "pending_second", now);

const trust = await computeTrustScore(db, "u1");
assert(trust.approvals === 5, `five approvals count, got ${trust.approvals}`);
assert(trust.rejections === 1, `one rejection counts, got ${trust.rejections}`);
assert(trust.samples === 6, "waiting and half-approved rows do not count");
assert(Math.abs(trust.score - 6 / 8) < 1e-9, `the score is 6/8, got ${trust.score}`);

const state = await getAutonomyState(db, "u1");
assert(state.level === 2, `six decisions at 0.75 reach level 2, got ${state.level}`);

// An old decision outside the window is ignored.
const outside = await computeTrustScore(db, "u1", {
  at: new Date("2027-09-19T04:00:00.000Z"),
});
assert(outside.samples === 0, "decisions outside the window do not count");

// --- the level changes what runs -------------------------------------------

const high = await runGatedAction(
  db,
  "u1",
  { action_type: "memory_deleted", autonomyLevel: 3 },
  async () => "ran"
);
assert(high.ran && high.status === "approved", "level 3 runs a high-risk action");

const waiting = await runGatedAction(
  db,
  "u1",
  { action_type: "capture", autonomyLevel: 0 },
  async () => "ran"
);
assert(!waiting.ran && waiting.status === "proposed", "level 0 proposes even low risk");

const defaultRule = await proposeAction(db, "u1", { action_type: "capture" });
assert(
  defaultRule.status === "approved",
  "without an autonomy level the published table still applies"
);

finish("trust score tests passed.");
