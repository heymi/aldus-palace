/**
 * Today + work streams, standalone.
 *
 *   pnpm --filter @aldus-palace/example-today-only start
 *
 * Seeds five commitments that exercise the four time models and prints:
 *   - the Today projection (now / next / risks / unscheduled)
 *   - the work-stream grouping (AI-maintained, rebuildable)
 *
 * Note what is *not* here: no “overdue” state. Time is a scheduling result, so
 * a missed date becomes a risk, never a guilt label.
 */

import {
  buildToday,
  formatTodayText,
  listWorkStreams,
  newId,
  nowIso,
  type SqlDatabase,
} from "@aldus-palace/core";
import { openSqliteDatabase } from "@aldus-palace/core/db/sqlite";

const timezone = "Asia/Tokyo";

const db = await openSqliteDatabase(":memory:", { wal: false });
await seed(db, timezone);

const today = await buildToday(db, "u1", timezone, new Date());

console.log(formatTodayText(today, "en"));

const streams = await listWorkStreams(db, "u1", { limitPerGroup: 5 });
console.log(`\n▸ Work streams (${streams.groups.length} groups, ${streams.total} commitments)`);
for (const group of streams.groups) {
  console.log(`  ${group.label} (${group.source}, ${group.total} total, ${group.risk_count} at risk)`);
  for (const row of group.commitments) {
    console.log(`    · ${String((row as { title?: string }).title)}`);
  }
}
if (streams.unassigned.length) {
  console.log(`  unassigned: ${streams.unassigned.length}`);
}

db.close();

async function seed(database: SqlDatabase, timezone: string): Promise<void> {
  const t = nowIso();
  await database
    .prepare(
      `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
       VALUES ('u1', 'Demo', ?, 'zh-CN', ?, ?)`
    )
    .run(timezone, t, t);
  await database
    .prepare(
      `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
       VALUES ('p-launch', 'u1', 'Launch', 'active', ?, ?)`
    )
    .run(t, t);

  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const rows: Array<[string, string, string | null, Partial<Record<string, string>>]> = [
    // title, status, project, time fields
    ["Prep the launch checklist", "planned", "p-launch", { deadline: `${day(1)}T09:00:00.000Z` }],
    ["Review the pricing page", "scheduled", "p-launch", { window_start: `${day(0)}T01:00:00.000Z`, window_end: `${day(0)}T09:00:00.000Z` }],
    ["Fix the signup bug", "captured", "p-launch", { ai_slot_start: `${day(0)}T02:00:00.000Z`, ai_slot_end: `${day(0)}T03:00:00.000Z` }],
    ["Write the release notes", "risk", null, { deadline: `${day(-2)}T09:00:00.000Z` }],
    ["Read the pricing teardown", "captured", null, {}],
  ];

  for (const [title, status, projectId, times] of rows) {
    await database
      .prepare(
        `INSERT INTO commitments
         (id, user_id, title, project_id, status, deadline, window_start, window_end,
          ai_slot_start, ai_slot_end, created_at, updated_at)
         VALUES (?, 'u1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId("cmt"),
        title,
        projectId,
        status,
        times.deadline ?? null,
        times.window_start ?? null,
        times.window_end ?? null,
        times.ai_slot_start ?? null,
        times.ai_slot_end ?? null,
        t,
        t
      );
  }
}
