/**
 * Understanding Agent, standalone.
 *
 *   pnpm --filter @aldus-palace/example-understanding-only start
 *
 * Shows what the runtime decides for you — and why — before anything is stored:
 * object mode (thought vs commitment vs both), relative dates, near-duplicate
 * skipping, and which memory candidates were rejected and for what reason.
 */

import {
  DevLLMProvider,
  ensureDevUser,
  newId,
  nowIso,
  processRawInput,
  writeActionLog,
} from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const db = await openSqliteDatabase(":memory:", { wal: false });
const user = await ensureDevUser(db, {
  name: "Demo",
  timezone: "Asia/Tokyo",
  language: "zh-CN",
});

const inputs = [
  "帮我规划一下下周三的客户拜访，顺便想想怎么提高转化率",
  "最近觉得 AI 产品都太吵了，干扰太多",
  "以后产品不要做太复杂，保持克制",
  "帮我规划一下下周三的客户拜访，顺便想想怎么提高转化率",
];

for (const content of inputs) {
  const rawInputId = newId("inp");
  const t = nowIso();
  await db
    .prepare(
      `INSERT INTO raw_inputs
       (id, user_id, content, source, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
    )
    .run(rawInputId, user.id, content, t, t);
  await writeActionLog(db, {
    user_id: user.id,
    actor: "user",
    action_type: "input_captured",
    summary: "example: understanding-only",
  });

  const card = await processRawInput(db, new DevLLMProvider(), user, rawInputId, "local");

  console.log(`\n▸ ${content}`);
  console.log(`  mode: ${describeMode(card)}`);
  const newCommitments = card.commitments.filter(
    (row) => !(row as { already_linked?: boolean }).already_linked
  ).length;
  const linked = card.commitments.length - newCommitments;
  console.log(
    `  objects: thoughts=${card.thoughts.length} commitments=${newCommitments}` +
      ` decisions=${card.decisions.length}` +
      (linked ? ` (${linked} already existed)` : "")
  );

  for (const memory of card.memory_candidates) {
    const row = memory as {
      status?: string;
      type?: string;
      content?: string;
      activation_reason?: string;
    };
    const label =
      row.status === "active"
        ? "remembered"
        : "waiting for your confirmation";
    console.log(`  memory: ${label} — ${row.content}`);
    if (row.activation_reason) console.log(`          (${row.activation_reason})`);
  }

  for (const warning of card.warnings) console.log(`  · ${warning}`);
}

function describeMode(card: {
  thoughts: unknown[];
  commitments: unknown[];
  memory_candidates: unknown[];
}): string {
  if (card.thoughts.length && card.commitments.length) return "mixed (thought + commitment)";
  if (card.commitments.length) return "commitment";
  if (card.thoughts.length) return "thought";
  if (card.memory_candidates.length) return "memory";
  return "nothing stored";
}
