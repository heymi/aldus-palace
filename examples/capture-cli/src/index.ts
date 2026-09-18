/**
 * Minimal end-to-end example.
 *
 *   pnpm --filter @aldus-palace/example-capture-cli start
 *
 * Three things happen here:
 *   1. open a database (the bundled SQLite adapter — ~3 lines)
 *   2. run the capture pipeline: input → understanding → objects → ActionCard
 *   3. print what was stored
 *
 * Swapping SQLite for another store means implementing `SqlDatabase` from
 * `@aldus-palace/core/db/port` — see docs/ARCHITECTURE.md.
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
  language: "en",
});

const input = process.argv.slice(2).join(" ") || "Ship the onboarding page next week";

const rawInputId = newId("inp");
const t = nowIso();
await db
  .prepare(
    `INSERT INTO raw_inputs
     (id, user_id, content, source, processing_status, created_at, updated_at)
     VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
  )
  .run(rawInputId, user.id, input, t, t);

await writeActionLog(db, {
  user_id: user.id,
  actor: "user",
  action_type: "input_captured",
  summary: "captured from example CLI",
});

// The deterministic provider keeps this example offline and reproducible.
// Swap in `createLLMProvider(resolveProviderConfig(process.env))` for a model.
const card = await processRawInput(
  db,
  new DevLLMProvider(),
  user,
  rawInputId,
  "local"
);

console.log(`input:   ${input}`);
console.log(`summary: ${card.summary}\n`);
console.log(JSON.stringify(card, null, 2));
