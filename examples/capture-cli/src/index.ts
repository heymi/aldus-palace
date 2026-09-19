/**
 * The one-command demo.
 *
 *   pnpm demo
 *
 * Runs the capture pipeline offline with the deterministic provider and prints
 * a card per sentence. Pass your own sentence to try it:
 *
 *   pnpm demo "Ship the onboarding page next week"
 *
 * The pipeline is the same one the library, HTTP server and MCP server use; the
 * only difference is the provider and the storage adapter.
 */

import {
  DevLLMProvider,
  ensureDevUser,
  formatActionCard,
  localeOf,
  newId,
  nowIso,
  processRawInput,
  writeActionLog,
  type ActionCard,
  type SqlDatabase,
  type User,
} from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const PRESET: Array<{ text: string; language: string }> = [
  { text: "Ship the onboarding page next week", language: "en" },
  { text: "I prefer simple tools", language: "en" },
  { text: "Fix the notification bug tomorrow", language: "en" },
  { text: "Fix the notification bug tomorrow", language: "en" },
  { text: "下周把 onboarding 做完", language: "zh-CN" },
  { text: "以后产品不要做太复杂，保持克制", language: "zh-CN" },
  { text: "今晚先不做评审，改排到周五", language: "zh-CN" },
];

const custom = process.argv.slice(2).join(" ").trim();
const sentences = custom.length
  ? [{ text: custom, language: /[\u4e00-\u9fff]/.test(custom) ? "zh-CN" : "en" }]
  : PRESET;

const byLanguage = new Map<string, string[]>();
for (const sentence of sentences) {
  const list = byLanguage.get(sentence.language) ?? [];
  list.push(sentence.text);
  byLanguage.set(sentence.language, list);
}

for (const [language, texts] of byLanguage) {
  const db = await openSqliteDatabase(":memory:", { wal: false });
  const user = await ensureDevUser(db, {
    name: "Demo",
    timezone: "Asia/Tokyo",
    language,
  });
  const locale = localeOf(user.language);

  for (const text of texts) {
    const card = await capture(db, user, text, locale);
    console.log(`\n$ input  ${text}`);
    console.log(formatActionCard(card, locale));
  }
  db.close();
}

async function capture(
  db: SqlDatabase,
  user: User,
  text: string,
  locale: "en" | "zh-CN"
): Promise<ActionCard> {
  const rawInputId = newId("inp");
  const t = nowIso();
  await db
    .prepare(
      `INSERT INTO raw_inputs
       (id, user_id, content, source, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
    )
    .run(rawInputId, user.id, text, t, t);

  await writeActionLog(db, {
    user_id: user.id,
    actor: "user",
    action_type: "input_captured",
    summary: "captured from the demo",
  });

  return await processRawInput(
    db,
    new DevLLMProvider({ locale }),
    user,
    rawInputId,
    "local"
  );
}
