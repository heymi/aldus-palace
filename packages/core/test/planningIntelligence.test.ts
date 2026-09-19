import { classifyDay } from "../src/lib/dayPlan.js";
import { scoreNow } from "../src/lib/nowScore.js";
import { buildToday } from "../src/services/today.js";
import { createTestDb, finish } from "./support/db.js";
import type { SqlDatabase } from "../src/db/port.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const AT = new Date("2026-07-19T04:00:00.000Z");

// --- the Now score ----------------------------------------------------------

const urgent = scoreNow({
  importance: 0.8,
  deadline: "2026-07-19T08:00:00.000Z",
  status: "planned",
  projectId: "p-a",
  durationMinutes: 30,
  availableMinutes: 240,
  contextProjectId: "p-a",
  at: AT,
});
const calm = scoreNow({
  importance: 0.3,
  deadline: "2026-07-30T08:00:00.000Z",
  status: "planned",
  projectId: "p-b",
  durationMinutes: 30,
  availableMinutes: 240,
  contextProjectId: "p-a",
  at: AT,
});
assert(urgent.score > calm.score, `urgency and context win, got ${urgent.score} vs ${calm.score}`);
assert(urgent.reasons.includes("临近截止"), "the deadline reason is reported");
assert(urgent.reasons.includes("延续当前上下文"), "continuing the context is reported");
assert(calm.reasons.includes("需要切换项目"), "a switch is reported");

const tooLong = scoreNow({
  durationMinutes: 300,
  availableMinutes: 60,
  at: AT,
});
const fits = scoreNow({
  durationMinutes: 45,
  availableMinutes: 60,
  at: AT,
});
assert(fits.score > tooLong.score, "work that fits scores higher");
assert(tooLong.reasons.includes("当前时间不够"), "the fit problem is reported");

// --- the morning plan -------------------------------------------------------

const items = [
  { id: "risk", status: "risk", duration_minutes: 60 },
  { id: "started", started_at: "2026-07-19T03:00:00.000Z", duration_minutes: 60 },
  { id: "soon", deadline: "2026-07-20T04:00:00.000Z", duration_minutes: 60 },
  { id: "fits", duration_minutes: 120, deadline: "2026-07-25T04:00:00.000Z" },
  { id: "later", duration_minutes: 400, deadline: "2026-07-30T04:00:00.000Z" },
];
const plan = classifyDay(items, { at: AT, capacityMinutes: 405 });
assert(plan.core.includes("risk"), "a risk item is core");
assert(plan.core.includes("started"), "a started item is core");
assert(plan.core.includes("soon"), "a deadline within a day is core");
assert(plan.optional.includes("fits"), "work that fits the remaining capacity is optional");
assert(plan.deferred.includes("later"), "work that does not fit is deferred");
assert(
  plan.core.length + plan.optional.length + plan.deferred.length === items.length,
  "every item lands in exactly one bucket"
);

// --- Now picks the context match, not the first row -------------------------

const db: SqlDatabase = await createTestDb();
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
  )
  .run(AT.toISOString(), AT.toISOString());

for (const projectId of ["p-other", "p-context"]) {
  await db
    .prepare(
      `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
       VALUES (?, 'u1', ?, 'active', ?, ?)`
    )
    .run(projectId, projectId, AT.toISOString(), AT.toISOString());
}

async function addWindowed(id: string, title: string, projectId: string, start: string, end: string, duration: number) {
  await db
    .prepare(
      `INSERT INTO commitments
       (id, user_id, title, project_id, status, window_start, window_end,
        duration_minutes, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, 'planned', ?, ?, ?, ?, ?)`
    )
    .run(id, title, projectId, start, end, duration, AT.toISOString(), AT.toISOString());
}

// "context" matches the project the user is already in; it starts later, so
// ordering alone would pick "first".
await addWindowed("first", "Other work", "p-other", "2026-07-19T05:00:00.000Z", "2026-07-19T09:00:00.000Z", 60);
await addWindowed("context", "Continue this", "p-context", "2026-07-19T06:00:00.000Z", "2026-07-19T09:00:00.000Z", 45);
await db
  .prepare(
    `INSERT INTO commitments
     (id, user_id, title, project_id, status, started_at, created_at, updated_at)
     VALUES ('current', 'u1', 'In progress', 'p-context', 'planned', ?, ?, ?)`
  )
  .run(AT.toISOString(), AT.toISOString(), AT.toISOString());

const today = await buildToday(db, "u1", "Asia/Shanghai", AT, "en");
assert(today.now !== null, "Now is set");
assert(today.now?.id === "current", "an in-progress item is Now first");

const nowReason = today.now?.now_reason as string[] | undefined;
assert(nowReason?.[0] === "进行中", "the reason travels with Now");

// Without an in-progress item the score decides, and the context match wins.
await db.prepare(`UPDATE commitments SET started_at = NULL WHERE id = 'current'`).run();
await db
  .prepare(
    `INSERT INTO commitments
     (id, user_id, title, project_id, status, completed_at, created_at, updated_at)
     VALUES ('finished', 'u1', 'Finished earlier', 'p-context', 'completed', ?, ?, ?)`
  )
  .run("2026-07-19T03:00:00.000Z", AT.toISOString(), AT.toISOString());
const scored = await buildToday(db, "u1", "Asia/Shanghai", AT, "en");
assert(scored.now?.id === "context", `the context match becomes Now, got ${scored.now?.id}`);
assert(
  (scored.now?.now_reason as string[]).includes("延续当前上下文"),
  "the context reason is reported"
);

assert(Array.isArray(scored.plan?.core), "the payload carries the morning plan");
assert(
  (scored.plan?.core.length ?? 0) + (scored.plan?.optional.length ?? 0) + (scored.plan?.deferred.length ?? 0) ===
    scored.timeline.length,
  "the plan covers the timeline"
);

finish("planning intelligence tests passed.");
