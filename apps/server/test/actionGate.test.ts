import { createApp } from "../src/app.js";
import { DevLLMProvider, proposeAction } from "@aldus-palace/core";
import { createTestDb, finish, TEST_NOW } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const db = await createTestDb();
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
  )
  .run(TEST_NOW, TEST_NOW);

const app = createApp({
  db,
  llm: new DevLLMProvider(),
  config: {
    devAuthToken: "action-gate-token",
    user: { name: "Tester", timezone: "Asia/Shanghai", language: "en" },
  },
});

const headers = {
  Authorization: "Bearer action-gate-token",
  "Content-Type": "application/json",
};

// A high-risk proposal waits for a decision.
const proposal = await proposeAction(db, "u1", {
  action_type: "memory_deleted",
  payload: { memory_id: "mem_1" },
});
assert(proposal.status === "proposed", "a high-risk action waits");

const list = await app.request("/v1/actions?status=proposed", { headers });
assert(list.status === 200, `expected list 200, got ${list.status}`);
const listBody = (await list.json()) as { items: Array<{ id: string; risk: string }> };
assert(listBody.items.length === 1, "the waiting proposal is listed");
assert(listBody.items[0].risk === "high", "the risk is reported");

// Approve it through the API.
const approve = await app.request(`/v1/actions/${proposal.proposal.id}/decide`, {
  method: "POST",
  headers,
  body: JSON.stringify({ decision: "approve", reason: "archive it" }),
});
assert(approve.status === 200, `expected decide 200, got ${approve.status}`);
const approved = (await approve.json()) as { proposal: { status: string } };
assert(approved.proposal.status === "approved", "the proposal is approved");

// A bad decision is rejected with 400, an unknown proposal with 404.
const bad = await app.request(`/v1/actions/${proposal.proposal.id}/decide`, {
  method: "POST",
  headers,
  body: JSON.stringify({ decision: "maybe" }),
});
assert(bad.status === 400, `expected 400 for a bad decision, got ${bad.status}`);

const missing = await app.request("/v1/actions/act_missing/decide", {
  method: "POST",
  headers,
  body: JSON.stringify({ decision: "approve" }),
});
assert(missing.status === 404, `expected 404 for an unknown proposal, got ${missing.status}`);

// Revoke the approval; a second revoke is refused.
const revoke = await app.request(`/v1/actions/${proposal.proposal.id}/revoke`, {
  method: "POST",
  headers,
  body: JSON.stringify({ reason: "changed my mind" }),
});
assert(revoke.status === 200, `expected revoke 200, got ${revoke.status}`);
const revoked = (await revoke.json()) as { proposal: { status: string } };
assert(revoked.proposal.status === "revoked", "the approval is revoked");

const revokeAgain = await app.request(`/v1/actions/${proposal.proposal.id}/revoke`, {
  method: "POST",
  headers,
  body: JSON.stringify({}),
});
assert(revokeAgain.status === 400, `expected 400 for a second revoke, got ${revokeAgain.status}`);

// The action log carries the whole path.
const activity = await app.request("/v1/activity", { headers });
const activityBody = (await activity.json()) as {
  items: Array<{ action_type: string }>;
};
const types = activityBody.items.map((item) => item.action_type);
assert(types.includes("action_proposed"), "the proposal is in the action log");
assert(types.includes("action_approved"), "the approval is in the action log");
assert(types.includes("action_revoked"), "the revocation is in the action log");

finish("action gate API test passed.");
