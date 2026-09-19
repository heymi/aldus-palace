import {
  reconcileTodayPlan,
  recordUserTodayArrangement,
  removeFromToday,
  observePlanningOutcome,
} from "../src/services/adaptivePlanning.js";
import { buildToday } from "../src/services/today.js";
import { createTestDb, finish } from "./support/db.js";
import type { SqlDatabase } from "../src/db/port.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function makeDb(): Promise<SqlDatabase> {
  const db = await createTestDb();
  const now = "2026-07-19T04:00:00.000Z";
  await db.prepare(
    `INSERT INTO users (id, name, timezone, language, created_at, updated_at)
     VALUES ('u1', 'Tester', 'Asia/Shanghai', 'zh', ?, ?)`
  ).run(now, now);
  await db.prepare(
    `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
     VALUES (?, 'u1', ?, 'active', ?, ?)`
  ).run("p-related", "Related", now, now);
  await db.prepare(
    `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
     VALUES (?, 'u1', ?, 'active', ?, ?)`
  ).run("p-other", "Other", now, now);
  return db;
}

async function addCommitment(
  db: SqlDatabase,
  input: {
    id: string;
    title: string;
    projectId?: string;
    status?: string;
    completedAt?: string;
    slotStart?: string;
    slotEnd?: string;
    windowStart?: string;
    windowEnd?: string;
    deadline?: string;
    duration?: number | null;
  }
) {
  const created = "2026-07-18T04:00:00.000Z";
  await db.prepare(
    `INSERT INTO commitments
     (id, user_id, title, project_id, status, duration_minutes,
      ai_slot_start, ai_slot_end, window_start, window_end, deadline,
      completed_at, created_at, updated_at)
     VALUES (?, 'u1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.title,
    input.projectId ?? null,
    input.status ?? "captured",
    input.duration === undefined ? 45 : input.duration,
    input.slotStart ?? null,
    input.slotEnd ?? null,
    input.windowStart ?? null,
    input.windowEnd ?? null,
    input.deadline ?? null,
    input.completedAt ?? null,
    created,
    created
  );
}

async function fillsPartialTodayFromRelatedWork() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "done-related",
    title: "完成 Related 登录页",
    projectId: "p-related",
    status: "completed",
    completedAt: "2026-07-19T03:30:00.000Z",
  });
  await addCommitment(db, {
    id: "already-today",
    title: "今日已有安排",
    projectId: "p-other",
    status: "scheduled",
    slotStart: "2026-07-19T05:00:00.000Z",
    slotEnd: "2026-07-19T05:45:00.000Z",
  });
  await addCommitment(db, {
    id: "related-1",
    title: "调整 Related 发送按钮",
    projectId: "p-related",
  });
  await addCommitment(db, {
    id: "related-2",
    title: "修复 Related 设置页面错误",
    projectId: "p-related",
  });
  await addCommitment(db, {
    id: "other",
    title: "修复 Other 崩溃",
    projectId: "p-other",
  });

  const result = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T04:00:00.000Z"),
    planVersion: "2026-07-19:1",
  });

  assert(result.picked.length === 2, `expected two picks, got ${result.picked.length}`);
  assert(
    result.picked.every((item) => item.project_id === "p-related"),
    `expected related project first, got ${JSON.stringify(result.picked)}`
  );
}

async function deadlineRiskOverridesRelatedWorkRanking() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "risk-done-related",
    title: "完成 Related 工作",
    projectId: "p-related",
    status: "completed",
    completedAt: "2026-07-19T03:30:00.000Z",
  });
  for (let index = 0; index < 2; index++) {
    await addCommitment(db, {
      id: `risk-existing-${index}`,
      title: `今日已有 ${index}`,
      status: "scheduled",
      slotStart: `2026-07-19T0${5 + index}:00:00.000Z`,
      slotEnd: `2026-07-19T0${5 + index}:30:00.000Z`,
    });
  }
  await addCommitment(db, {
    id: "risk-related",
    title: "修复 Related 具体问题",
    projectId: "p-related",
  });
  await addCommitment(db, {
    id: "risk-deadline",
    title: "提交明早材料",
    projectId: "p-other",
    deadline: "2026-07-19T20:00:00.000Z",
  });
  const result = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T04:00:00.000Z"),
    planVersion: "2026-07-19:risk-priority",
  });
  assert(
    result.picked[0]?.id === "risk-deadline",
    "near deadline must outrank related-work experience"
  );
}

async function respectsCrossDayWindowsFixedEventsAndExpiredWindows() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "cross-day",
    title: "跨日有效工作",
    windowStart: "2026-07-18T20:00:00.000Z",
    windowEnd: "2026-07-19T20:00:00.000Z",
  });
  await addCommitment(db, {
    id: "expired-window",
    title: "修复 A 已失效任务",
    windowStart: "2026-07-18T01:00:00.000Z",
    windowEnd: "2026-07-18T02:00:00.000Z",
  });
  await addCommitment(db, { id: "valid-window", title: "修复 Z 有效任务" });
  await addCommitment(db, { id: "valid-window-2", title: "调整 Z 第二任务" });
  const now = "2026-07-19T04:00:00.000Z";
  await db.prepare(
    `INSERT INTO events
     (id, user_id, title, kind, start_at, end_at, source, created_at, updated_at)
     VALUES ('fixed-1', 'u1', '固定会议', 'fixed_external', ?, ?, 'app', ?, ?)`
  ).run(now, "2026-07-19T05:00:00.000Z", now, now);

  const result = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date(now),
    planVersion: "2026-07-19:availability",
  });
  assert(result.picked.length === 2, "cross-day window must count as one Today item");
  assert(
    result.picked.every((item) => item.id !== "expired-window"),
    "expired flexible window must not be selected"
  );
  const slots = (await db
    .prepare(
      `SELECT ai_slot_start FROM commitments
       WHERE id IN ('valid-window', 'valid-window-2') AND ai_slot_start IS NOT NULL`
    )
    .all()) as Array<{ ai_slot_start: string }>;
  assert(
    slots.every((slot) => Date.parse(slot.ai_slot_start) >= Date.parse("2026-07-19T05:00:00.000Z")),
    "automatic slots must not overlap fixed events"
  );

  const removed = await removeFromToday(db, "u1", "Asia/Shanghai", "cross-day", {
    at: new Date(now),
  });
  assert(removed.assignment_source === "user", "cross-day Today item must be removable");
}

async function skipsNonFittingCandidatesAndRemovesRiskOnlyNow() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "fit-done",
    title: "完成 Related 工作",
    projectId: "p-related",
    status: "completed",
    completedAt: "2026-07-19T14:30:00.000Z",
  });
  for (let index = 0; index < 2; index++) {
    await addCommitment(db, {
      id: `fit-existing-${index}`,
      title: `今日已有 ${index}`,
      status: "scheduled",
      slotStart: `2026-07-19T1${2 + index}:00:00.000Z`,
      slotEnd: `2026-07-19T1${2 + index}:30:00.000Z`,
    });
  }
  await addCommitment(db, {
    id: "fit-long",
    title: "修复 Related 长任务",
    projectId: "p-related",
    duration: 120,
  });
  await addCommitment(db, {
    id: "fit-short",
    title: "修复 Other 短任务",
    projectId: "p-other",
    duration: 30,
  });
  const result = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T15:00:00.000Z"),
    planVersion: "2026-07-19:fitting-fallback",
  });
  assert(
    result.picked[0]?.id === "fit-short",
    "planner must continue to a lower-ranked candidate that fits"
  );

  const riskDb = await makeDb();
  await addCommitment(riskDb, {
    id: "risk-only-now",
    title: "明早截止但不安排今天",
    deadline: "2026-07-19T20:00:00.000Z",
  });
  const at = new Date("2026-07-19T04:00:00.000Z");
  const before = await buildToday(riskDb, "u1", "Asia/Shanghai", at);
  assert(before.now?.id === "risk-only-now", "precondition: risk is shown as Now");
  await removeFromToday(riskDb, "u1", "Asia/Shanghai", "risk-only-now", { at });
  const after = await buildToday(riskDb, "u1", "Asia/Shanghai", at);
  assert(after.now?.id !== "risk-only-now", "risk-only Now must support 先不做");
  assert(
    after.risks.some((item) => item.id === "risk-only-now"),
    "risk remains visible after removing the Today focus"
  );
}

async function relatesChineseTitlesWithoutProjectIds() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "zh-done",
    title: "完成登录页面",
    status: "completed",
    completedAt: "2026-07-19T03:30:00.000Z",
  });
  for (let index = 0; index < 2; index++) {
    await addCommitment(db, {
      id: `zh-existing-${index}`,
      title: `今日已有 ${index}`,
      status: "scheduled",
      slotStart: `2026-07-19T0${5 + index}:00:00.000Z`,
      slotEnd: `2026-07-19T0${5 + index}:30:00.000Z`,
    });
  }
  await addCommitment(db, { id: "zh-related", title: "修复登录按钮" });
  await addCommitment(db, { id: "zh-other", title: "修复支付按钮" });
  const result = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T04:00:00.000Z"),
    planVersion: "2026-07-19:zh-related",
  });
  assert(
    result.picked[0]?.id === "zh-related",
    "shared Chinese concepts should count as recent-work relation"
  );
}

async function stopsAtFiveAndShowsOneTip() {
  const db = await makeDb();
  for (let index = 0; index < 5; index++) {
    await addCommitment(db, {
      id: `done-${index}`,
      title: `完成任务 ${index}`,
      status: "completed",
      completedAt: `2026-07-19T0${index}:10:00.000Z`,
    });
  }
  await addCommitment(db, { id: "candidate", title: "修复一个具体问题" });

  const first = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T05:00:00.000Z"),
    planVersion: "2026-07-19:cap-1",
  });
  assert(first.picked.length === 0, "must not add work after five completions");
  assert(first.tip?.includes("休息") === true, `expected rest tip, got ${first.tip}`);

  const second = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T05:01:00.000Z"),
    planVersion: "2026-07-19:cap-2",
  });
  assert(second.tip === null, "rest tip should only be emitted once per threshold");
}

async function activeContinuationRaisesCapToTen() {
  const db = await makeDb();
  for (let index = 0; index < 5; index++) {
    await addCommitment(db, {
      id: `high-done-${index}`,
      title: `完成任务 ${index}`,
      status: "completed",
      completedAt: `2026-07-19T0${index}:10:00.000Z`,
    });
  }
  await addCommitment(db, { id: "user-choice", title: "用户明确安排的任务" });
  await addCommitment(db, { id: "next-1", title: "修复候选一" });
  await addCommitment(db, { id: "next-2", title: "调整候选二" });

  await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T05:00:00.000Z"),
    planVersion: "2026-07-19:before-continue",
  });
  const continuation = await recordUserTodayArrangement(
    db,
    "u1",
    "Asia/Shanghai",
    "user-choice",
    { at: new Date("2026-07-19T05:01:00.000Z") }
  );
  assert(continuation.elevated_cap === true, "explicit continuation should raise cap");

  const after = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T05:02:00.000Z"),
    planVersion: "2026-07-19:after-continue",
  });
  assert(after.effective_cap === 10, `expected cap 10, got ${after.effective_cap}`);
  assert(after.remaining_today === 3, `expected today filled to 3, got ${after.remaining_today}`);

  const nextDay = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-20T00:00:00.000Z"),
    planVersion: "2026-07-20:cap-reset",
  });
  assert(
    nextDay.effective_cap === 5,
    `active continuation raises only that day's cap, got ${nextDay.effective_cap}`
  );
}

async function retryingExistingTodayIntentDoesNotRaiseCap() {
  const db = await makeDb();
  await addCommitment(db, { id: "existing-user-choice", title: "已有今日安排" });
  await recordUserTodayArrangement(
    db,
    "u1",
    "Asia/Shanghai",
    "existing-user-choice",
    { at: new Date("2026-07-19T03:00:00.000Z") }
  );
  for (let index = 0; index < 5; index++) {
    await addCommitment(db, {
      id: `retry-done-${index}`,
      title: `已完成 ${index}`,
      status: "completed",
      completedAt: `2026-07-19T0${index}:10:00.000Z`,
    });
  }
  await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T05:00:00.000Z"),
    planVersion: "2026-07-19:existing-before-tip",
  });
  const retry = await recordUserTodayArrangement(
    db,
    "u1",
    "Asia/Shanghai",
    "existing-user-choice",
    { at: new Date("2026-07-19T05:01:00.000Z") }
  );
  assert(
    retry.elevated_cap === false,
    "retrying old Today intent is not a new active continuation"
  );
}

async function arrangingFirstOnNextDayStartsAtDefaultCap() {
  const db = await makeDb();
  for (let index = 0; index < 5; index++) {
    await addCommitment(db, {
      id: `next-day-done-${index}`,
      title: `完成任务 ${index}`,
      status: "completed",
      completedAt: `2026-07-19T0${index}:10:00.000Z`,
    });
  }
  await addCommitment(db, { id: "day-one-continue", title: "第一天继续" });
  await addCommitment(db, { id: "day-two-first", title: "第二天首个安排" });
  await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T05:00:00.000Z"),
    planVersion: "2026-07-19:next-day-tip",
  });
  await recordUserTodayArrangement(db, "u1", "Asia/Shanghai", "day-one-continue", {
    at: new Date("2026-07-19T05:01:00.000Z"),
  });
  const nextDayRead = await buildToday(
    db,
    "u1",
    "Asia/Shanghai",
    new Date("2026-07-20T00:00:00.000Z")
  );
  assert(
    nextDayRead.planning.mode === "balanced",
    "GET Today must expire yesterday's high-capacity mode"
  );
  assert(
    nextDayRead.planning.effective_cap === 5,
    "GET Today must expose the next day's default cap"
  );
  const nextDay = await recordUserTodayArrangement(
    db,
    "u1",
    "Asia/Shanghai",
    "day-two-first",
    { at: new Date("2026-07-20T00:00:00.000Z") }
  );
  assert(nextDay.elevated_cap === false, "next day starts from the default cap");
  const state = (await db
    .prepare(
      `SELECT effective_cap FROM planning_day_states
       WHERE user_id = 'u1' AND date_key = '2026-07-20'`
    )
    .get()) as { effective_cap: number };
  assert(state.effective_cap === 5, `expected next-day cap 5, got ${state.effective_cap}`);
}

async function planningForeignKeysAllowInputDerivativeReplacement() {
  const db = await makeDb();
  await addCommitment(db, { id: "replace-me", title: "会被富化替换" });
  const now = "2026-07-19T04:00:00.000Z";
  await db.prepare(
    `INSERT INTO today_assignments
     (id, user_id, commitment_id, date_key, source, status, assigned_at)
     VALUES ('replace-assignment', 'u1', 'replace-me', '2026-07-19', 'user', 'active', ?)`
  ).run(now);
  await db.prepare(
    `INSERT INTO planning_feedback_episodes
     (id, user_id, status, opened_at, expires_at, dismissed_assignment_ids,
      dismissed_project_ids, outcome, target_commitment_id, closed_at, created_at, updated_at)
     VALUES ('replace-episode', 'u1', 'closed', ?, ?, '[]', '[]',
             'self_defined_task', 'replace-me', ?, ?, ?)`
  ).run(now, "2026-07-19T05:00:00.000Z", now, now, now);
  await db.prepare(`DELETE FROM commitments WHERE id = 'replace-me'`).run();
  const assignment = await db
    .prepare(`SELECT id FROM today_assignments WHERE id = 'replace-assignment'`)
    .get();
  const episode = (await db
    .prepare(
      `SELECT target_commitment_id FROM planning_feedback_episodes
       WHERE id = 'replace-episode'`
    )
    .get()) as { target_commitment_id: string | null };
  assert(!assignment, "assignment should cascade when an input derivative is replaced");
  assert(episode.target_commitment_id === null, "feedback evidence should detach safely");
}

async function pausesStalledQueueAndRecoversAfterThreeCompletions() {
  const db = await makeDb();
  for (let index = 0; index < 3; index++) {
    await addCommitment(db, {
      id: `stalled-${index}`,
      title: `调整停滞任务 ${index}`,
    });
  }
  const firstAt = new Date("2026-07-18T04:00:00.000Z");
  const first = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: firstAt,
    planVersion: "2026-07-18:stalled-start",
  });
  assert(first.remaining_today === 3, "precondition: planner filled three items");

  const pausedAt = new Date(firstAt.getTime() + 24 * 3600 * 1000 + 60_000);
  const paused = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: pausedAt,
    planVersion: "2026-07-19:stalled-check",
  });
  assert(paused.mode === "paused", `expected paused, got ${paused.mode}`);
  assert(paused.auto_fill_paused === true, "stalled queue must suspend auto fill");

  for (let index = 0; index < 3; index++) {
    const completedAt = new Date(pausedAt.getTime() + (index + 1) * 60_000).toISOString();
    await db.prepare(
      `UPDATE commitments SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`
    ).run(completedAt, completedAt, `stalled-${index}`);
    await addCommitment(db, {
      id: `recovery-${index}`,
      title: `修复恢复候选 ${index}`,
    });
  }

  const recovered = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date(pausedAt.getTime() + 5 * 60_000),
    planVersion: "2026-07-19:recovered",
  });
  assert(recovered.mode === "balanced", `expected balanced, got ${recovered.mode}`);
  assert(recovered.remaining_today === 3, "recovered planner should fill today again");
}

async function removesAgentSuggestionAndOpensFeedbackEpisode() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "dismiss-recent",
    title: "完成 Related 前置任务",
    projectId: "p-related",
    status: "completed",
    completedAt: "2026-07-19T03:30:00.000Z",
  });
  await addCommitment(db, {
    id: "dismiss-me",
    title: "调整自动补充任务",
    projectId: "p-related",
  });
  await addCommitment(db, { id: "wait-1", title: "修复候选一", projectId: "p-other" });
  await addCommitment(db, { id: "wait-2", title: "修复候选二", projectId: "p-other" });
  await addCommitment(db, { id: "wait-3", title: "修复候选三", projectId: "p-other" });
  const at = new Date("2026-07-19T04:00:00.000Z");
  const planned = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at,
    planVersion: "2026-07-19:dismiss-start",
  });
  const dismissId = planned.picked[0]?.id;
  assert(typeof dismissId === "string", "precondition: at least one item planned");

  const removed = await removeFromToday(db, "u1", "Asia/Shanghai", dismissId, {
    at: new Date(at.getTime() + 60_000),
  });
  assert(removed.assignment_source === "agent", "must retain agent provenance");
  assert(removed.feedback_episode_id !== null, "agent rejection should open an episode");
  const commitment = (await db
    .prepare(`SELECT status, ai_slot_start, ai_slot_end FROM commitments WHERE id = ?`)
    .get(dismissId)) as { status: string; ai_slot_start: string | null; ai_slot_end: string | null };
  assert(commitment.status === "planned", `expected planned, got ${commitment.status}`);
  assert(!commitment.ai_slot_start && !commitment.ai_slot_end, "AI slot must be cleared");

  const waiting = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date(at.getTime() + 2 * 60_000),
    planVersion: "2026-07-19:dismiss-wait",
  });
  assert(waiting.picked.length === 0, "open feedback episode must pause replacement suggestions");
  assert(
    waiting.remaining_today === 2,
    `feedback wait should report the two remaining Today items, got ${waiting.remaining_today}`
  );

  const outcome = await observePlanningOutcome(db, "u1", {
    kind: "started",
    commitmentId: "wait-1",
    at: new Date(at.getTime() + 3 * 60_000),
  });
  assert(outcome === "project_switch", `expected project switch, got ${outcome}`);

  const afterOutcome = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date(at.getTime() + 4 * 60_000),
    planVersion: "2026-07-19:dismiss-after-outcome",
  });
  assert(
    afterOutcome.picked.every((item) => item.id !== dismissId),
    "removed suggestion must stay excluded for the day"
  );
}

async function removesAnyTodayItemButKeepsDeadlineRisk() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "manual-deadline",
    title: "提交今日截止材料",
    status: "planned",
    deadline: "2026-07-19T08:00:00.000Z",
    slotStart: "2026-07-20T05:00:00.000Z",
    slotEnd: "2026-07-20T05:45:00.000Z",
  });
  const at = new Date("2026-07-19T04:00:00.000Z");

  const before = await buildToday(db, "u1", "Asia/Shanghai", at);
  assert(
    before.timeline.some((item) => item.id === "manual-deadline"),
    "precondition: deadline item appears in Today"
  );
  const removed = await removeFromToday(
    db,
    "u1",
    "Asia/Shanghai",
    "manual-deadline",
    { at }
  );
  assert(removed.assignment_source === "user", "non-agent Today item is a user plan");
  const preservedFutureSlot = (await db
    .prepare(`SELECT ai_slot_start FROM commitments WHERE id = 'manual-deadline'`)
    .get()) as { ai_slot_start: string | null };
  assert(
    preservedFutureSlot.ai_slot_start === "2026-07-20T05:00:00.000Z",
    "removing a user Today plan must preserve an AI slot on another day"
  );

  const after = await buildToday(db, "u1", "Asia/Shanghai", at);
  assert(
    !after.timeline.some((item) => item.id === "manual-deadline"),
    "removed item must leave Today timeline"
  );
  assert(
    after.risks.some((item) => item.id === "manual-deadline"),
    "removal must preserve deadline risk"
  );

  const retry = await removeFromToday(
    db,
    "u1",
    "Asia/Shanghai",
    "manual-deadline",
    { at }
  );
  assert(retry.assignment_source === "user", "retry must be idempotent");
  const revisedLogs = (await db
    .prepare(
      `SELECT COUNT(*) AS count FROM action_logs
       WHERE user_id = 'u1' AND action_type = 'user_plan_revised'
         AND entity_id = 'manual-deadline'`
    )
    .get()) as { count: number };
  assert(revisedLogs.count === 1, "retry must not duplicate action logs");
}

async function reconcileIsIdempotentForSamePlanVersion() {
  const db = await makeDb();
  for (let index = 0; index < 3; index++) {
    await addCommitment(db, { id: `retry-${index}`, title: `修复重试候选 ${index}` });
  }
  const input = {
    at: new Date("2026-07-19T04:00:00.000Z"),
    planVersion: "2026-07-19:idempotent",
  };
  await reconcileTodayPlan(db, "u1", "Asia/Shanghai", input);
  await reconcileTodayPlan(db, "u1", "Asia/Shanghai", input);
  await db.prepare(
    `UPDATE commitments SET status = 'completed', completed_at = ?, updated_at = ?
     WHERE id = 'retry-0'`
  ).run("2026-07-19T04:01:00.000Z", "2026-07-19T04:01:00.000Z");
  await addCommitment(db, { id: "retry-late", title: "修复稍后出现的候选" });
  const replay = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", input);

  const assignments = (await db
    .prepare(
      `SELECT COUNT(*) AS count FROM today_assignments
       WHERE user_id = 'u1' AND date_key = '2026-07-19' AND status = 'active'`
    )
    .get()) as { count: number };
  const logs = (await db
    .prepare(
      `SELECT COUNT(*) AS count FROM action_logs
       WHERE user_id = 'u1' AND action_type = 'ai_slot_assigned'`
    )
    .get()) as { count: number };
  assert(assignments.count === 3, "reconcile retry must not duplicate assignments");
  assert(logs.count === 3, "reconcile retry must not duplicate action logs");
  assert(replay.picked.length === 0, "applied plan version must not schedule after state changes");
}

async function learnsRepeatedProjectSwitchWithinFifteenDays() {
  const db = await makeDb();
  await addCommitment(db, {
    id: "recent-related",
    title: "完成 Related 工作",
    projectId: "p-related",
    status: "completed",
    completedAt: "2026-07-19T03:30:00.000Z",
  });
  await addCommitment(db, {
    id: "today-one",
    title: "今日安排一",
    status: "scheduled",
    slotStart: "2026-07-19T05:00:00.000Z",
    slotEnd: "2026-07-19T05:30:00.000Z",
  });
  await addCommitment(db, {
    id: "today-two",
    title: "今日安排二",
    status: "scheduled",
    slotStart: "2026-07-19T06:00:00.000Z",
    slotEnd: "2026-07-19T06:30:00.000Z",
  });
  await addCommitment(db, {
    id: "candidate-related",
    title: "修复 Related 具体问题",
    projectId: "p-related",
  });
  await addCommitment(db, {
    id: "candidate-other",
    title: "修复 Other 具体问题",
    projectId: "p-other",
  });

  const insertEpisode = db.prepare(
    `INSERT INTO planning_feedback_episodes
     (id, user_id, status, opened_at, expires_at, dismissed_assignment_ids,
      dismissed_project_ids, outcome, target_project_id, closed_at, created_at, updated_at)
     VALUES (?, 'u1', 'closed', ?, ?, '[]', '["p-related"]',
             'project_switch', 'p-other', ?, ?, ?)`
  );
  for (const [index, date] of ["2026-07-10", "2026-07-13", "2026-07-16"].entries()) {
    const opened = `${date}T04:00:00.000Z`;
    const closed = `${date}T04:05:00.000Z`;
    await insertEpisode.run(`episode-${index}`, opened, `${date}T05:00:00.000Z`, closed, opened, closed);
  }

  const planned = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T04:00:00.000Z"),
    planVersion: "2026-07-19:experience",
  });
  assert(planned.picked.length === 1, `expected one pick, got ${planned.picked.length}`);
  assert(
    planned.picked[0]?.id === "candidate-other",
    `expected learned target project, got ${JSON.stringify(planned.picked)}`
  );
}

async function learnsSameProjectAndStoppedOutcomesWithinFifteenDays() {
  const insertEpisodes = async (
    db: SqlDatabase,
    outcome: "same_project_task_switch" | "stopped_working",
    targetProjectId: string | null
  ) => {
    const statement = db.prepare(
      `INSERT INTO planning_feedback_episodes
       (id, user_id, status, opened_at, expires_at, dismissed_assignment_ids,
        dismissed_project_ids, outcome, target_project_id, closed_at, created_at, updated_at)
       VALUES (?, 'u1', 'closed', ?, ?, '[]', '[]', ?, ?, ?, ?, ?)`
    );
    for (const [index, date] of ["2026-07-10", "2026-07-13", "2026-07-16"].entries()) {
      const opened = `${date}T04:00:00.000Z`;
      const closed = `${date}T04:05:00.000Z`;
      await statement.run(
        `${outcome}-${index}`,
        opened,
        `${date}T05:00:00.000Z`,
        outcome,
        targetProjectId,
        closed,
        opened,
        closed
      );
    }
  };

  const sameProjectDb = await makeDb();
  await addCommitment(sameProjectDb, {
    id: "same-existing-1",
    title: "今日已有一",
    status: "scheduled",
    slotStart: "2026-07-19T05:00:00.000Z",
    slotEnd: "2026-07-19T05:30:00.000Z",
  });
  await addCommitment(sameProjectDb, {
    id: "same-existing-2",
    title: "今日已有二",
    status: "scheduled",
    slotStart: "2026-07-19T06:00:00.000Z",
    slotEnd: "2026-07-19T06:30:00.000Z",
  });
  await addCommitment(sameProjectDb, {
    id: "same-preferred",
    title: "修复 Z 项目具体问题",
    projectId: "p-related",
  });
  await addCommitment(sameProjectDb, {
    id: "same-other",
    title: "修复 A 项目具体问题",
    projectId: "p-other",
  });
  await insertEpisodes(sameProjectDb, "same_project_task_switch", "p-related");
  const sameProject = await reconcileTodayPlan(
    sameProjectDb,
    "u1",
    "Asia/Shanghai",
    {
      at: new Date("2026-07-19T04:00:00.000Z"),
      planVersion: "2026-07-19:same-project-experience",
    }
  );
  assert(
    sameProject.picked[0]?.id === "same-preferred",
    "three same-project switches should favor another task in that project"
  );

  const stoppedDb = await makeDb();
  await addCommitment(stoppedDb, {
    id: "stop-existing-1",
    title: "今日已有一",
    status: "scheduled",
    slotStart: "2026-07-19T05:00:00.000Z",
    slotEnd: "2026-07-19T05:30:00.000Z",
  });
  await addCommitment(stoppedDb, {
    id: "stop-existing-2",
    title: "今日已有二",
    status: "scheduled",
    slotStart: "2026-07-19T06:00:00.000Z",
    slotEnd: "2026-07-19T06:30:00.000Z",
  });
  await addCommitment(stoppedDb, {
    id: "stop-short",
    title: "修复 Z 短任务",
    duration: 20,
  });
  await addCommitment(stoppedDb, {
    id: "stop-long",
    title: "修复 A 长任务",
    duration: 60,
  });
  await insertEpisodes(stoppedDb, "stopped_working", null);
  const stopped = await reconcileTodayPlan(stoppedDb, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T04:00:00.000Z"),
    planVersion: "2026-07-19:stopped-experience",
  });
  assert(
    stopped.picked[0]?.id === "stop-short",
    "three stopped episodes should favor a shorter feasible next step"
  );
}

async function readingTodayDoesNotWrite() {
  const db = await makeDb();
  await addCommitment(db, { id: "read-only", title: "修复只读检查" });
  const tables = [
    "commitments",
    "today_assignments",
    "planning_profiles",
    "planning_day_states",
    "planning_feedback_episodes",
    "action_logs",
  ];
  const snapshot = async () =>
    JSON.stringify(
      Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => [
            table,
            await db.prepare(`SELECT * FROM ${table}`).all(),
          ])
        )
      )
    );
  const before = await snapshot();
  await buildToday(
    db,
    "u1",
    "Asia/Shanghai",
    new Date("2026-07-19T04:00:00.000Z")
  );
  assert((await snapshot()) === before, "GET Today assembly must not mutate persisted state");
}

await fillsPartialTodayFromRelatedWork();
await deadlineRiskOverridesRelatedWorkRanking();
await respectsCrossDayWindowsFixedEventsAndExpiredWindows();
await skipsNonFittingCandidatesAndRemovesRiskOnlyNow();
await relatesChineseTitlesWithoutProjectIds();
await stopsAtFiveAndShowsOneTip();
await activeContinuationRaisesCapToTen();
await retryingExistingTodayIntentDoesNotRaiseCap();
await arrangingFirstOnNextDayStartsAtDefaultCap();
await pausesStalledQueueAndRecoversAfterThreeCompletions();
await removesAgentSuggestionAndOpensFeedbackEpisode();
await removesAnyTodayItemButKeepsDeadlineRisk();
await reconcileIsIdempotentForSamePlanVersion();
await learnsRepeatedProjectSwitchWithinFifteenDays();
await learnsSameProjectAndStoppedOutcomesWithinFifteenDays();
await planningForeignKeysAllowInputDerivativeReplacement();
await readingTodayDoesNotWrite();
await sizesSlotsFromProjectHistory();
finish("adaptive planning tests passed.");

async function sizesSlotsFromProjectHistory() {
  const db = await makeDb();
  for (const [index, id] of ["done-a", "done-b", "done-c"].entries()) {
    await addCommitment(db, {
      id,
      title: `完成 Related ${index}`,
      projectId: "p-related",
      status: "completed",
      completedAt: `2026-07-1${7 + index}T03:30:00.000Z`,
      duration: 30,
    });
  }
  await addCommitment(db, {
    id: "no-duration",
    title: "调整 Related 空状态",
    projectId: "p-related",
    duration: null,
  });

  const result = await reconcileTodayPlan(db, "u1", "Asia/Shanghai", {
    at: new Date("2026-07-19T04:00:00.000Z"),
    planVersion: "2026-07-19:history",
  });
  const picked = result.picked.find((item) => item.id === "no-duration");
  assert(picked !== undefined, "the untimed commitment is picked");
  assert(
    picked!.reason.includes("时长按历史估算"),
    `the reason names the history estimate, got: ${picked!.reason}`
  );
  const row = (await db
    .prepare(
      `SELECT ai_slot_start, ai_slot_end FROM commitments WHERE id = 'no-duration'`
    )
    .get()) as { ai_slot_start: string; ai_slot_end: string };
  const minutes =
    (Date.parse(row.ai_slot_end) - Date.parse(row.ai_slot_start)) / 60000;
  assert(minutes === 30, `the slot follows the history median, got ${minutes}`);
}
