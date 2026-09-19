import { processRawInput } from "../src/agent/understand.js";
import { nowIso } from "../src/db/port.js";
import { newId } from "../src/lib/id.js";
import { addDaysToDateKey, getLocalParts } from "../src/lib/time.js";
import type { LLMProvider } from "../src/providers/types.js";
import { ensureDevUser } from "../src/repos/users.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function providerReturning(extraction: unknown): LLMProvider {
  return {
    name: "fake-model",
    async complete() {
      return JSON.stringify(extraction);
    },
  };
}

async function store(
  input: string,
  extraction: unknown,
  timezone = "UTC",
  title?: string
): Promise<Record<string, unknown> | undefined> {
  const db = await createTestDb();
  const user = await ensureDevUser(db, { name: "T", timezone, language: "en" });
  const id = newId("inp");
  const t = nowIso();
  await db
    .prepare(
      `INSERT INTO raw_inputs
       (id, user_id, content, source, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, 'text', 'pending', ?, ?)`
    )
    .run(id, user.id, input, t, t);
  await processRawInput(db, providerReturning(extraction), user, id, "full");
  const row = (await db
    .prepare(
      title
        ? `SELECT * FROM commitments WHERE user_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1`
        : `SELECT * FROM commitments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(...(title ? [user.id, title] : [user.id]))) as
    | Record<string, unknown>
    | undefined;
  db.close();
  return row;
}

// Free text the model returned is resolved with the server rules.
const freeText = await store("Ship the onboarding page next week", {
  object_mode: "commitment",
  commitments: [{ title: "Ship the onboarding page", window_start: "next week" }],
});
assert(freeText !== undefined, "a commitment is stored");
assert(
  freeText!.window_start !== "next week",
  "the free-text window is not stored verbatim"
);
assert(
  Number.isFinite(Date.parse(String(freeText!.window_start))),
  "the resolved window is an ISO date"
);

// A hallucinated past date for a phrase that points at the future is dropped
// and re-resolved from the words.
const today = getLocalParts("UTC", new Date()).dateKey;
const allowed = [0, 1, 2, 3, 4, 5, 6, 7].map((offset) =>
  addDaysToDateKey(today, offset)
);
const hallucinated = await store("Ship the onboarding page next week", {
  object_mode: "commitment",
  commitments: [
    {
      title: "Ship the onboarding page",
      window_start: "2020-01-01",
      window_end: "2020-01-07",
    },
  ],
});
assert(
  hallucinated!.window_start !== new Date("2020-01-01").toISOString(),
  "a past date for a future phrase is not stored"
);
assert(
  allowed.includes(
    getLocalParts("UTC", new Date(String(hallucinated!.window_start))).dateKey
  ),
  `the window is re-resolved to next week, got ${String(hallucinated!.window_start)}`
);

// "Friday" resolves to a Friday.
const friday = await store("Follow up with legal on Friday", {
  object_mode: "commitment",
  commitments: [{ title: "Follow up with legal", deadline: "Friday" }],
});
const fridayKey = getLocalParts("UTC", new Date(String(friday!.deadline))).dateKey;
assert(
  new Date(`${fridayKey}T12:00:00Z`).getUTCDay() === 5,
  `Friday resolves to a Friday, got ${fridayKey}`
);

// A valid ISO date the model returned is kept.
const iso = await store("Ship the onboarding page", {
  object_mode: "commitment",
  commitments: [
    { title: "Ship the onboarding page", deadline: addDaysToDateKey(today, 3) },
  ],
});
assert(
  getLocalParts("UTC", new Date(String(iso!.deadline))).dateKey ===
    addDaysToDateKey(today, 3),
  "a clear future date is kept"
);

// A date-only value is the user's local day, not UTC midnight.
const dateKey = addDaysToDateKey(today, 3);
const localDay = await store(
  `Ship the onboarding page on ${dateKey}`,
  {
    object_mode: "commitment",
    commitments: [{ title: "Ship the onboarding page", deadline: dateKey }],
  },
  "America/Los_Angeles"
);
assert(
  getLocalParts("America/Los_Angeles", new Date(String(localDay!.deadline))).dateKey ===
    dateKey,
  `a date-only deadline stays on the local day, got ${String(localDay!.deadline)}`
);

// A future word in another clause does not drop a real past date in this one.
const pastClause = await store(
  "上周归档完成，下周交报告",
  {
    object_mode: "commitment",
    commitments: [
      { title: "归档完成", optimized_content: "上周归档完成", deadline: "2020-01-01" },
    ],
  },
  "UTC",
  "归档完成"
);
assert(
  String(pastClause!.deadline) === new Date("2020-01-01").toISOString(),
  `a past date in a past clause is kept, got ${String(pastClause!.deadline)}`
);

// A window phrase fills a deadline with the window end, not its start.
const nextWeek = await store("Ship the onboarding page next week", {
  object_mode: "commitment",
  commitments: [{ title: "Ship the onboarding page", deadline: "next week" }],
});
assert(
  getLocalParts("UTC", new Date(String(nextWeek!.deadline))).dateKey ===
    addDaysToDateKey(today, 7),
  `a "next week" deadline is the end of the window, got ${String(nextWeek!.deadline)}`
);

// "next month" resolves, and the weekday table is not Friday-only.
const [ty, tm] = today.split("-").map(Number);
const nextMonthPrefix =
  tm === 12 ? `${ty + 1}-01` : `${ty}-${String(tm + 1).padStart(2, "0")}`;
const nextMonth = await store(
  "交报告",
  {
    object_mode: "commitment",
    commitments: [{ title: "交报告", deadline: "下个月" }],
  },
  "Asia/Shanghai",
  "交报告"
);
assert(
  getLocalParts("Asia/Shanghai", new Date(String(nextMonth!.deadline))).dateKey.startsWith(
    nextMonthPrefix
  ),
  `"下个月" resolves into next month, got ${String(nextMonth!.deadline)}`
);

const monday = await store("Follow up with legal on Monday", {
  object_mode: "commitment",
  commitments: [{ title: "Follow up with legal", deadline: "Monday" }],
});
assert(
  new Date(String(monday!.deadline)).getUTCDay() === 1,
  `Monday resolves to a Monday, got ${String(monday!.deadline)}`
);

finish("model date normalization tests passed.");
