import {
  assessActionRisk,
  decideAction,
  executeApprovedAction,
  listActionProposals,
  proposeAction,
  revokeAction,
  runGatedAction,
  type ActionExecutorContext,
  type ActionExecutorRegistry,
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

// --- durable execution ------------------------------------------------------

let attempts = 0;
const executors: ActionExecutorRegistry = {
  memory_deleted: async (context: ActionExecutorContext) => {
    attempts += 1;
    return { archived: context.payload.memory_id ?? "mem_1" };
  },
};

const toRun = await proposeAction(db, "u1", {
  action_type: "memory_deleted",
  payload: { memory_id: "mem_run" },
});
assert(toRun.status === "proposed", "a high-risk action waits");
const beforeApproval = await executeApprovedAction(
  db,
  "u1",
  String(toRun.proposal.id),
  executors
);
assert(
  !beforeApproval.ok && beforeApproval.error === "not_approved",
  "a proposal cannot run before it is approved"
);

await decideAction(db, "u1", String(toRun.proposal.id), "approve");
const firstRun = await executeApprovedAction(db, "u1", String(toRun.proposal.id), executors);
assert(firstRun.ok && firstRun.executed, "an approved action runs");
assert(firstRun.ok && firstRun.status === "succeeded", "a successful run is recorded");
assert(attempts === 1, "the executor ran once");

const secondRun = await executeApprovedAction(db, "u1", String(toRun.proposal.id), executors);
assert(
  secondRun.ok && !secondRun.executed && secondRun.reason === "already_succeeded",
  "a succeeded action is not run again"
);
assert(attempts === 1, "the action is idempotent");

const noExecutor = await proposeAction(db, "u1", { action_type: "commitment_deleted" });
await decideAction(db, "u1", String(noExecutor.proposal.id), "approve");
const noExecutorRun = await executeApprovedAction(db, "u1", String(noExecutor.proposal.id), {});
assert(!noExecutorRun.ok && noExecutorRun.error === "no_executor", "an action without an executor waits");

let failFirst = true;
const flaky: ActionExecutorRegistry = {
  memory_deleted: async () => {
    if (failFirst) {
      failFirst = false;
      throw new Error("boom");
    }
    return { ok: true };
  },
};
const flakyProposal = await proposeAction(db, "u1", { action_type: "memory_deleted" });
await decideAction(db, "u1", String(flakyProposal.proposal.id), "approve");
const failedRun = await executeApprovedAction(
  db,
  "u1",
  String(flakyProposal.proposal.id),
  flaky
);
assert(
  failedRun.ok && failedRun.status === "failed" && failedRun.reason === "boom",
  "a failure is recorded"
);
const retried = await executeApprovedAction(db, "u1", String(flakyProposal.proposal.id), flaky);
assert(retried.ok && retried.status === "succeeded", "a failed action can be retried");

const guardedProposal = await proposeAction(db, "u1", { action_type: "memory_deleted" });
await decideAction(db, "u1", String(guardedProposal.proposal.id), "approve");
let executorRan = false;
const skipped = await executeApprovedAction(
  db,
  "u1",
  String(guardedProposal.proposal.id),
  {
    memory_deleted: async () => {
      executorRan = true;
      return 1;
    },
  },
  { canExecute: async () => false }
);
assert(
  skipped.ok && skipped.status === "skipped" && skipped.reason === "permission_revoked",
  "a revoked permission skips execution"
);
assert(!executorRan, "the executor did not run");

const leased = await proposeAction(db, "u1", { action_type: "memory_deleted" });
await decideAction(db, "u1", String(leased.proposal.id), "approve");
await db
  .prepare(
    `UPDATE action_proposals SET execution_status = 'running', execution_leased_until = ?
     WHERE id = ?`
  )
  .run(new Date(Date.now() + 60_000).toISOString(), leased.proposal.id);
const blocked = await executeApprovedAction(db, "u1", String(leased.proposal.id), executors);
assert(!blocked.ok && blocked.error === "in_progress", "a live lease blocks another worker");

const executionLogs = (await db
  .prepare(`SELECT action_type FROM action_logs WHERE user_id = 'u1'`)
  .all()) as Array<{ action_type: string }>;
const executionTypes = executionLogs.map((row) => row.action_type);
assert(executionTypes.includes("action_executed"), "execution is logged");
assert(executionTypes.includes("action_execution_failed"), "a failure is logged");
assert(executionTypes.includes("action_execution_skipped"), "a skip is logged");

// --- gated runs are recorded, and decisions are linearizable -----------------

// A run through runGatedAction is recorded, so a later execute does not repeat it.
let inlineRan = 0;
const inline = await runGatedAction(
  db,
  "u1",
  { action_type: "capture" },
  async () => {
    inlineRan += 1;
    return "inline";
  }
);
const repeated = await executeApprovedAction(db, "u1", String(inline.proposal.id), {
  capture: async () => {
    inlineRan += 1;
    return "again";
  },
});
assert(
  repeated.ok && !repeated.executed && repeated.reason === "already_succeeded",
  "an inline gated run is recorded and not repeated"
);
assert(inlineRan === 1, "the effect ran once");

// Two decisions racing on one proposal: only one applies.
const raced = await proposeAction(db, "u1", { action_type: "external_communication" });
const [decisionA, decisionB] = await Promise.all([
  decideAction(db, "u1", String(raced.proposal.id), "approve"),
  decideAction(db, "u1", String(raced.proposal.id), "approve"),
]);
assert(
  [decisionA, decisionB].filter((result) => result.ok).length === 1,
  "only one of two racing decisions applies"
);

// A revoked approval does not run.
const revokedRun = await proposeAction(db, "u1", { action_type: "memory_deleted" });
await decideAction(db, "u1", String(revokedRun.proposal.id), "approve");
await revokeAction(db, "u1", String(revokedRun.proposal.id));
const afterRevoke = await executeApprovedAction(
  db,
  "u1",
  String(revokedRun.proposal.id),
  executors
);
assert(
  !afterRevoke.ok && afterRevoke.error === "not_approved",
  "a revoked proposal does not run"
);

finish("action gate tests passed.");
