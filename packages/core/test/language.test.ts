/**
 * The runtime writes in the user's language.
 *
 * The deterministic provider follows the input's script when no locale is
 * configured, the rule-based memory extractor follows `user.language`, and
 * `setUserLanguage` is what a client calls when the user switches.
 */

import { processRawInput } from "../src/agent/understand.js";
import { nowIso } from "../src/db/port.js";
import { localeOf } from "../src/lib/locale.js";
import { newId } from "../src/lib/id.js";
import { DevLLMProvider } from "../src/providers/dev.js";
import type { LLMProvider } from "../src/providers/types.js";
import { ensureDevUser, setUserLanguage } from "../src/repos/users.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- the deterministic provider follows the input ---------------------------

const auto = new DevLLMProvider();
const zh = JSON.parse(
  (await auto.complete([{ role: "user", content: "Input:\n以后产品不要做太复杂，保持克制" }])) as string
) as { memory_candidates: Array<{ content: string }> };
assert(zh.memory_candidates.length === 1, "the Chinese rule fires");
assert(
  /喜欢简洁|避免复杂/.test(zh.memory_candidates[0].content),
  `the memory is written in Chinese, got ${zh.memory_candidates[0].content}`
);

const en = JSON.parse(
  (await auto.complete([{ role: "user", content: "Input:\nKeep things simple, avoid complexity" }])) as string
) as { memory_candidates: Array<{ content: string }> };
assert(
  /simple|complexity/i.test(en.memory_candidates[0].content),
  `the memory is written in English, got ${en.memory_candidates[0].content}`
);

const forced = new DevLLMProvider({ locale: "en" });
const forcedOut = JSON.parse(
  (await forced.complete([{ role: "user", content: "Input:\n以后产品不要做太复杂" }])) as string
) as { memory_candidates: Array<{ content: string }> };
assert(
  /simple|complexity/i.test(forcedOut.memory_candidates[0].content),
  "an explicit locale overrides the input script"
);

// --- the rule extractor follows the user's language -------------------------

async function storeWithLanguage(
  language: string,
  input: string
): Promise<Record<string, unknown> | undefined> {
  const db = await createTestDb();
  const user = await ensureDevUser(db, { name: "T", timezone: "Asia/Shanghai", language });
  const id = newId("inp");
  const t = nowIso();
  await db
    .prepare(
      `INSERT INTO raw_inputs
       (id, user_id, content, source, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
    )
    .run(id, user.id, input, t, t);
  const provider: LLMProvider = {
    name: "fake-model",
    async complete() {
      return JSON.stringify({ object_mode: "thought", thoughts: [], commitments: [] });
    },
  };
  await processRawInput(db, provider, user, id, "full");
  const row = (await db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(user.id)) as Record<string, unknown> | undefined;
  db.close();
  return row;
}

const zhMemory = await storeWithLanguage("zh-CN", "以后产品不要做太复杂，保持克制");
assert(zhMemory !== undefined, "a memory is stored for the Chinese user");
assert(
  /喜欢简洁|避免复杂/.test(String(zhMemory!.content)),
  `the stored memory is Chinese, got ${String(zhMemory!.content)}`
);

const enMemory = await storeWithLanguage("en", "Keep things simple and avoid complexity");
assert(enMemory !== undefined, "a memory is stored for the English user");
assert(
  /simple|complexity/i.test(String(enMemory!.content)),
  `the stored memory is English, got ${String(enMemory!.content)}`
);

// --- switching language -----------------------------------------------------

const db = await createTestDb();
const user = await ensureDevUser(db, { name: "T", timezone: "UTC", language: "en" });
assert(localeOf(user.language) === "en", "the user starts in English");
const switched = await setUserLanguage(db, user.id, "zh-CN");
assert(switched?.language === "zh-CN", "the language is stored");
assert(localeOf(switched?.language) === "zh-CN", "the locale follows the language");
db.close();

finish("language tests passed.");
