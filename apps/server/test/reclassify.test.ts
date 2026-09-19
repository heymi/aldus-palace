/**
 * The reclassify API: an ambiguous capture asks what it is, answering creates
 * the work, and correcting by hand is remembered.
 */

import { createApp } from "../src/app.js";
import { DevLLMProvider } from "@aldus-palace/core";
import { createTestDb, finish, TEST_NOW } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const db = await createTestDb();
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'zh-CN', ?, ?)`
  )
  .run(TEST_NOW, TEST_NOW);

const app = createApp({
  db,
  llm: new DevLLMProvider(),
  config: {
    devAuthToken: "reclassify-token",
    user: { name: "Tester", timezone: "Asia/Shanghai", language: "zh-CN" },
  },
});

const headers = {
  Authorization: "Bearer reclassify-token",
  "Content-Type": "application/json",
};

const capture = await app.request("/v1/inputs", {
  method: "POST",
  headers,
  body: JSON.stringify({
    content: "分类记忆不生效，没在设置里显示",
    mode: "progressive",
    source: "text",
  }),
});
assert(capture.status === 200, `expected capture 200, got ${capture.status}`);
const card = (await capture.json()) as {
  id: string;
  action_card: {
    commitments: unknown[];
    clarifications: Array<{ id: string; kind: string; options: Array<{ id: string }> }>;
  };
};
assert(card.action_card.commitments.length === 0, "nothing is invented as work");
assert(card.action_card.clarifications.length === 1, "the capture asks one question");
assert(
  card.action_card.clarifications[0].kind === "object_mode",
  "the question is about the object mode"
);

// Answer through the clarification route: defect.
const answered = await app.request(
  `/v1/clarifications/${card.action_card.clarifications[0].id}/resolve`,
  { method: "POST", headers, body: JSON.stringify({ option_id: "bug" }) }
);
assert(answered.status === 200, `expected resolve 200, got ${answered.status}`);
const answerBody = (await answered.json()) as {
  commitment: { id: string; title: string } | null;
};
assert(answerBody.commitment !== null, "answering creates the commitment");
assert(
  answerBody.commitment!.title.startsWith("修复："),
  `the title is labelled in the user's language, got ${answerBody.commitment!.title}`
);

// A hand correction on a plain note.
const note = await app.request("/v1/inputs", {
  method: "POST",
  headers,
  body: JSON.stringify({ content: "今天有点乱，信息太多", mode: "progressive", source: "text" }),
});
const noteBody = (await note.json()) as { id: string };
const promoted = await app.request(`/v1/inputs/${noteBody.id}/reclassify`, {
  method: "POST",
  headers,
  body: JSON.stringify({ mode: "task" }),
});
assert(promoted.status === 200, `expected reclassify 200, got ${promoted.status}`);
const promotedBody = (await promoted.json()) as { choice: string; commitment: { id: string } | null };
assert(promotedBody.choice === "task" && promotedBody.commitment !== null, "a note becomes work");

const listed = await app.request("/v1/commitments", { headers });
const listedBody = (await listed.json()) as { items: Array<{ title: string }> };
assert(
  listedBody.items.some((c) => c.title.includes("分类记忆不生效")),
  "the corrected work is listed"
);

const unknown = await app.request("/v1/inputs/inp_missing/reclassify", {
  method: "POST",
  headers,
  body: JSON.stringify({ mode: "bug" }),
});
assert(unknown.status === 404, `an unknown input is 404, got ${unknown.status}`);

const invalid = await app.request(`/v1/inputs/${noteBody.id}/reclassify`, {
  method: "POST",
  headers,
  body: JSON.stringify({ mode: "maybe" }),
});
assert(invalid.status >= 400, "an unknown mode is refused");

finish("reclassify API test passed.");
