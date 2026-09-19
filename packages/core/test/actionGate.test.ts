import {
  assessActionRisk,
  decideAction,
  listActionProposals,
  proposeAction,
  revokeAction,
  runGatedAction,
} from "../src/services/actionGate.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const db = await createTestDb();
const now = "2026-09-19T04:00:00.000Z";
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
  )
  .run(now, now);

// --- the published risk table ----------------------------------------------

assert(assessActionRisk("capture").risk === "low", "capture is low risk");
assert(
  assessActionRisk("memory_activated").risk === "low",
  "an activation that passed the published gate is low risk"
);
assert(assessActionRisk("memory_deleted").risk === "high", "deleting a belief is high risk");
assert(assessActionRisk("payment").risk === "critical", "payment is critical");
assert(
  assessActionRisk("something_new").risk === "high",
  "an unclassified action waits for a decision"
);

// --- low risk runs ----------------------------------------------------------

let ran = 0;
const low = await runGatedAction(
  db,
  "u1",
  { action_type: "capture", payload: { content: "Ship the onboarding page" } },
  async () => {
    ran += 1;
    return "stored";
  }
);
assert(low.ran, "a low-risk action runs");
assert(low.status === "approved", "a low-risk action is approved on the spot");
assert(ran === 1, "the callback ran once");
assert(low.result === "stored", "the callback result is returned");

// --- high risk waits --------------------------------------------------------

let highRan = 0;
const high = await runGatedAction(
  db,
  "u1",
  { action_type: "memory_deleted", payload: { memory_id: "mem_1" } },
  async () => {
    highRan += 1;
  }
);
assert(!high.ran, "a high-risk action waits");
assert(high.status === "proposed", "a high-risk action is proposed");
assert(highRan === 0, "the callback did not run");

const approved = await decideAction(db, "u1", String(high.proposal.id), "approve", {
  reason: "user approved the archive",
});
assert(approved.ok, "a proposal can be approved");
if (approved.ok) {
  assert(approved.proposal.status === "approved", "the status moves to approved");
  assert(approved.proposal.decided_by === "user", "the decision is attributed");
}
const again = await decideAction(db, "u1", String(high.proposal.id), "approve");
assert(!again.ok && again.error === "not_pending", "a decided proposal is not pending");

// --- critical needs two approvals ------------------------------------------

const critical = await proposeAction(db, "u1", {
  action_type: "external_communication",
  payload: { to: "zhang", body: "…" },
});
assert(critical.status === "proposed", "a critical action is proposed");

const first = await decideAction(db, "u1", String(critical.proposal.id), "approve");
assert(first.ok && first.proposal.status === "pending_second", "the first approval asks again");
const second = await decideAction(db, "u1", String(critical.proposal.id), "approve");
assert(second.ok && second.proposal.status === "approved", "the second approval executes");
if (second.ok) {
  assert(Number(second.proposal.confirmations) === 2, "two confirmations are recorded");
}

// --- rejection and revocation ----------------------------------------------

const rejected = await proposeAction(db, "u1", { action_type: "commitment_deleted" });
const rejectedResult = await decideAction(
  db,
  "u1",
  String(rejected.proposal.id),
  "reject",
  { reason: "keep it" }
);
assert(rejectedResult.ok && rejectedResult.proposal.status === "rejected", "a proposal is rejected");

const revoked = await proposeAction(db, "u1", { action_type: "memory_deleted" });
const revokedResult = await revokeAction(db, "u1", String(revoked.proposal.id), {
  reason: "changed my mind",
});
assert(revokedResult.ok && revokedResult.proposal.status === "revoked", "an approval is revoked");
const revokedAgain = await revokeAction(db, "u1", String(revoked.proposal.id));
assert(!revokedAgain.ok && revokedAgain.error === "not_revocable", "revocation is final");

const missing = await decideAction(db, "u1", "act_missing", "approve");
assert(!missing.ok && missing.error === "not_found", "an unknown proposal is not found");

// --- the list and the audit trail ------------------------------------------

const pending = await listActionProposals(db, "u1", "proposed");
assert(pending.length === 0, "no proposal is left pending");
const all = await listActionProposals(db, "u1", "all");
assert(all.length === 5, `every proposal is kept, got ${all.length}`);
assert(
  all.every((row) => typeof row.created_at === "string"),
  "every proposal carries its timestamp"
);

const logs = (await db
  .prepare(
    `SELECT action_type FROM action_logs WHERE user_id = 'u1'
     ORDER BY created_at ASC`
  )
  .all()) as Array<{ action_type: string }>;
const types = logs.map((row) => row.action_type);
assert(types.includes("action_approved"), "approvals are logged");
assert(types.includes("action_proposed"), "proposals are logged");
assert(types.includes("action_rejected"), "rejections are logged");
assert(types.includes("action_revoked"), "revocations are logged");
assert(
  types.filter((type) => type === "action_approved").length >= 3,
  "each approval writes its own log entry"
);

finish("action gate tests passed.");
