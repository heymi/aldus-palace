import {
  AMOUNT_RE,
  EMAIL_RE,
  PHONE_RE,
  redactText,
} from "../src/lib/redaction.js";
import {
  ensureDefaultScopes,
  grantScope,
  listScopes,
  memoryPermission,
  revokeScope,
} from "../src/services/permissions.js";
import { prepareCloudPayload } from "../src/services/privacyGateway.js";
import { PURGE_TABLES, purgeUserData } from "../src/services/dataLifecycle.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- redaction --------------------------------------------------------------

const redacted = redactText(
  "Discuss Orvia funding with Zhang tomorrow, budget ¥2,000,000, mail zhang@orvia.com",
  {
    contacts: ["Zhang"],
    organizations: ["Orvia"],
    redactAmounts: true,
    redactPii: true,
  }
);
assert(redacted.text.includes("[business] funding"), "the company becomes [business]");
assert(redacted.text.includes("with [contact]"), "the contact becomes [contact]");
assert(redacted.text.includes("[amount]"), "the amount becomes [amount]");
assert(redacted.text.includes("[email]"), "the email becomes [email]");
assert(redacted.text.includes("tomorrow"), "the harmless part is untouched");
assert(redacted.redactions.includes("business"), "the kinds are reported");
assert(redacted.redactions.includes("amount"), "amount is reported");
assert(redacted.redactions.includes("email"), "email is reported");

const clean = redactText("Ship the onboarding page next week", { redactAmounts: true });
assert(clean.text === "Ship the onboarding page next week", "clean text passes through");
assert(clean.redactions.length === 0, "nothing is reported for clean text");

const shortTerm = redactText("go to A now", { contacts: ["A"] });
assert(shortTerm.text === "go to A now", "a one-character term is not replaced");

// The regexes are exported with the global flag; redactText resets them.
EMAIL_RE.lastIndex = 0;
assert(EMAIL_RE.test("a@b.co"), "the email regex matches");
EMAIL_RE.lastIndex = 0;
assert(EMAIL_RE.test("c@d.co"), "the email regex works after a reset");
EMAIL_RE.lastIndex = 0;
assert(AMOUNT_RE.test("$12"), "the amount regex catches a currency amount");
AMOUNT_RE.lastIndex = 0;
assert(PHONE_RE.test("+86 138 0000 0000"), "the phone regex catches a number");
PHONE_RE.lastIndex = 0;

// --- the gateway ------------------------------------------------------------

const db = await createTestDb();
const now = "2026-09-19T04:00:00.000Z";
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
  )
  .run(now, now);
await db
  .prepare(
    `INSERT INTO projects (id, user_id, name, aliases, status, created_at, updated_at)
     VALUES ('p1', 'u1', 'Orvia', '["orvia"]', 'active', ?, ?)`
  )
  .run(now, now);

const level0 = await prepareCloudPayload(db, "u1", {
  text: "Discuss Orvia with Zhang",
  level: 0,
});
assert(level0.allowed && level0.text.includes("Orvia"), "level 0 passes through");

const level1 = await prepareCloudPayload(db, "u1", {
  text: "Discuss Orvia with Zhang",
  level: 1,
});
assert(level1.text.includes("[business]"), "level 1 redacts the project");
assert(level1.text.includes("Zhang"), "level 1 leaves contacts to the caller");

const level2 = await prepareCloudPayload(db, "u1", {
  text: "Orvia budget is ¥500,000",
  level: 2,
});
assert(level2.text.includes("[amount]"), "level 2 redacts money");

const level3 = await prepareCloudPayload(db, "u1", {
  text: "Orvia contact is zhang@orvia.com",
  level: 3,
});
assert(level3.text.includes("[email]"), "level 3 redacts emails");

const level4 = await prepareCloudPayload(db, "u1", {
  text: "my private thinking",
  level: 4,
});
assert(!level4.allowed, "level 4 stays local");
assert(level4.reason === "level_4_stays_local", "the reason is explicit");

const gatewayLogs = (await db
  .prepare(
    `SELECT COUNT(*) AS count FROM action_logs
     WHERE user_id = 'u1' AND action_type = 'privacy_gateway_redacted'`
  )
  .get()) as { count: number };
assert(Number(gatewayLogs.count) === 4, "every gateway call is logged, without content");

// --- permissions ------------------------------------------------------------

assert((await listScopes(db, "u1")).length === 0, "a fresh user holds no scopes");
const defaults = await ensureDefaultScopes(db, "u1");
assert(defaults.includes("calendar.read"), "the calendar read scope is the default");
assert((await memoryPermission(db, "u1")) === "private", "memory starts private");

const granted = await grantScope(db, "u1", "mail.read");
assert(granted.ok && granted.scopes.includes("mail.read"), "a scope can be granted");
const unknown = await grantScope(db, "u1", "everything");
assert(!unknown.ok && unknown.error === "unknown_scope", "an unknown scope is refused");

const sync = await grantScope(db, "u1", "memory.sync");
assert(sync.ok && (await memoryPermission(db, "u1")) === "sync", "memory can be shared");
await grantScope(db, "u1", "memory.ai_assist");
assert(
  (await memoryPermission(db, "u1")) === "ai_assist",
  "ai_assist wins over sync"
);

const revoked = await revokeScope(db, "u1", "mail.read");
assert(revoked.ok && !revoked.scopes.includes("mail.read"), "a scope can be revoked");
const revokedAgain = await revokeScope(db, "u1", "mail.read");
assert(!revokedAgain.ok && revokedAgain.error === "not_granted", "revoking twice is a miss");

// --- true deletion ----------------------------------------------------------

const refused = await purgeUserData(db, "u1", { confirm: false });
assert(!refused.ok && refused.error === "confirmation_required", "the purge needs confirmation");

// Give the purge something to delete beyond the user row.
await db
  .prepare(
    `INSERT INTO commitments (id, user_id, title, status, created_at, updated_at)
     VALUES ('c1', 'u1', 'Work', 'captured', ?, ?)`
  )
  .run(now, now);
await db
  .prepare(
    `INSERT INTO raw_inputs (id, user_id, content, source, processing_status, created_at, updated_at)
     VALUES ('r1', 'u1', 'text', 'text', 'processed', ?, ?)`
  )
  .run(now, now);

const purged = await purgeUserData(db, "u1", { confirm: true });
assert(purged.ok, "the purge runs with confirmation");
if (purged.ok) {
  assert(purged.result.total > 0, "rows are deleted");
  assert(purged.result.purged.commitments === 1, "the commitment is gone");
  assert(purged.result.purged.raw_inputs === 1, "the raw input is gone");
  assert(purged.result.purged.users === 1, "the user row is gone");
}

for (const { table, where } of PURGE_TABLES) {
  const row = (await db
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`)
    .get("u1")) as { count: number };
  assert(Number(row.count) === 0, `${table} is empty after the purge`);
}

finish("privacy tests passed.");
