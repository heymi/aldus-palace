import {
  MIGRATION_CONFIRMATION_THRESHOLD,
  migrateStaleWork,
} from "../src/services/workMigration.js";
import { createTestDb, finish } from "./support/db.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const NOW = new Date("2026-09-19T04:00:00.000Z");

const db = await createTestDb();
await db
  .prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'en', ?, ?)`
  )
  .run(NOW.toISOString(), NOW.toISOString());

async function addCommitment(input: {
  id: string;
  title: string;
  status?: string;
  slotStart?: string | null;
  slotEnd?: string | null;
  windowEnd?: string | null;
  deadline?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<void> {
  const t = NOW.toISOString();
  await db
    .prepare(
      `INSERT INTO commitments
       (id, user_id, title, status, duration_minutes, ai_slot_start, ai_slot_end,
        window_end, deadline, started_at, completed_at, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, 45, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.title,
      input.status ?? "scheduled",
      input.slotStart ?? null,
      input.slotEnd ?? null,
      input.windowEnd ?? null,
      input.deadline ?? null,
      input.startedAt ?? null,
      input.completedAt ?? null,
      t,
      t
    );
}

await addCommitment({
  id: "slipped-slot",
  title: "Slipped slot",
  slotStart: "2026-09-18T05:00:00.000Z",
  slotEnd: "2026-09-18T06:00:00.000Z",
});
await addCommitment({
  id: "slipped-window",
  title: "Slipped window",
  status: "planned",
  windowEnd: "2026-09-18T10:00:00.000Z",
});
await addCommitment({
  id: "deadline-missed",
  title: "Missed deadline",
  status: "risk",
  slotStart: "2026-09-18T05:00:00.000Z",
  slotEnd: "2026-09-18T06:00:00.000Z",
  deadline: "2026-09-18T09:00:00.000Z",
});
await addCommitment({
  id: "started",
  title: "Already started",
  slotStart: "2026-09-18T05:00:00.000Z",
  slotEnd: "2026-09-18T06:00:00.000Z",
  startedAt: "2026-09-18T05:30:00.000Z",
});
await addCommitment({
  id: "done",
  title: "Completed",
  status: "completed",
  slotStart: "2026-09-18T05:00:00.000Z",
  slotEnd: "2026-09-18T06:00:00.000Z",
  completedAt: "2026-09-18T06:00:00.000Z",
});
await addCommitment({
  id: "future",
  title: "Tomorrow",
  slotStart: "2026-09-20T05:00:00.000Z",
  slotEnd: "2026-09-20T06:00:00.000Z",
});

const first = await migrateStaleWork(db, "u1", { at: NOW });
assert(first.migrated.length === 2, `two items migrate, got ${first.migrated.length}`);
assert(
  first.migrated.every((item) => item.deferral_count === 1),
  "the first migration counts one deferral"
);
assert(
  first.migrated.some((item) => item.reason === "slot_slipped"),
  "a slipped slot is the reason"
);
assert(
  first.migrated.some((item) => item.reason === "window_slipped"),
  "a slipped window is the reason"
);
assert(first.needs_confirmation.length === 0, "nothing needs confirmation yet");

const slippedSlot = (await db
  .prepare(`SELECT ai_slot_start, status FROM commitments WHERE id = 'slipped-slot'`)
  .get()) as { ai_slot_start: string | null; status: string };
assert(slippedSlot.ai_slot_start === null, "the slot is cleared for re-planning");
assert(slippedSlot.status === "planned", "a scheduled item returns to planned");

const untouched = (await db
  .prepare(
    `SELECT id, deferral_count FROM commitments
     WHERE id IN ('deadline-missed', 'started', 'done', 'future')
     ORDER BY id`
  )
  .all()) as Array<{ id: string; deferral_count: number }>;
assert(
  untouched.every((row) => Number(row.deferral_count) === 0),
  "a deadline, a started item, a completed item and future work never migrate"
);

// The second run finds nothing: the slot is gone.
const second = await migrateStaleWork(db, "u1", { at: NOW });
assert(second.migrated.length === 1, "only the slipped window migrates again");
assert(
  second.migrated[0].id === "slipped-window",
  "the window slip is what remains"
);

// The window keeps slipping until the deferral limit is reached.
await migrateStaleWork(db, "u1", { at: NOW });
const third = await migrateStaleWork(db, "u1", { at: NOW });
assert(third.migrated.length === 0, "the limit stops automatic migration");
assert(third.needs_confirmation.length === 1, "the item surfaces for a decision");
assert(
  third.needs_confirmation[0].deferral_count === MIGRATION_CONFIRMATION_THRESHOLD,
  "the count reached the threshold"
);

// Surfacing is logged once, not on every run.
const fourth = await migrateStaleWork(db, "u1", { at: NOW });
assert(fourth.needs_confirmation.length === 1, "the item keeps surfacing");
const logs = (await db
  .prepare(
    `SELECT action_type, COUNT(*) AS count FROM action_logs
     WHERE user_id = 'u1' GROUP BY action_type`
  )
  .all()) as Array<{ action_type: string; count: number }>;
const byType = new Map(logs.map((row) => [row.action_type, Number(row.count)]));
assert((byType.get("work_migrated") ?? 0) === 4, "every migration is logged");
assert(
  (byType.get("work_needs_confirmation") ?? 0) === 1,
  "the confirmation request is logged once"
);

finish("work migration tests passed.");
