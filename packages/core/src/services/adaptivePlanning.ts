import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import {
  DEFAULT_DURATION_MINUTES,
  estimateDurationMinutes,
} from "../lib/durationEstimate.js";
import { newId } from "../lib/id.js";
import { planCapacityMinutes } from "../lib/planCapacity.js";
import { getLocalParts, localDayWindow } from "../lib/time.js";
import { writeActionLog } from "../repos/actionLogs.js";
import { blockedCommitmentIds } from "./dependencies.js";

export type ReconcileTodayPlanResult = {
  date_key: string;
  mode: "balanced" | "high_capacity" | "paused";
  effective_cap: 5 | 10;
  completed_today: number;
  remaining_today: number;
  picked: Array<{
    id: string;
    title: string;
    project_id: string | null;
    reason: string;
  }>;
  tip: string | null;
  auto_fill_paused: boolean;
};

export type PlanningOutcome =
  | "same_project_task_switch"
  | "project_switch"
  | "self_defined_task"
  | "stopped_working";

type CommitmentRow = Record<string, unknown> & {
  id: string;
  title: string;
  project_id: string | null;
};

export async function reconcileTodayPlan(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  options: { at?: Date; planVersion: string }
): Promise<ReconcileTodayPlanResult> {
  const at = options.at ?? new Date();
  const local = getLocalParts(timezone, at);
  const day = localDayWindow(timezone, local.dateKey, "full");
  const daytime = localDayWindow(timezone, local.dateKey, "daytime");
  // The planner keeps a quarter of the daytime window free.
  const capacityMinutes = planCapacityMinutes(daytime.start, daytime.end);
  const now = at.toISOString();

  await ensurePlanningProfile(db, userId, now);
  let profile = await normalizeCapacityForDate(
    db,
    userId,
    timezone,
    local.dateKey,
    now
  );
  const priorDayState = await db
    .prepare(
      `SELECT plan_version, effective_cap FROM planning_day_states
       WHERE user_id = ? AND date_key = ?`
    )
    .get(userId, local.dateKey) as
    | { plan_version: string | null; effective_cap: 5 | 10 }
    | undefined;
  if (priorDayState?.plan_version === options.planVersion) {
    const completedToday = await countCompleted(db, userId, day.start, now);
    return {
      date_key: local.dateKey,
      mode: profile.mode,
      effective_cap: priorDayState.effective_cap,
      completed_today: completedToday,
      remaining_today: await countOpenOnDay(
        db,
        userId,
        local.dateKey,
        day.start,
        day.end
      ),
      picked: [],
      tip: null,
      auto_fill_paused:
        profile.mode === "paused" ||
        completedToday >= priorDayState.effective_cap,
    };
  }
  await ensureDayState(
    db,
    userId,
    local.dateKey,
    profile.mode === "high_capacity" ? 10 : 5,
    now
  );
  if (profile.mode === "paused") {
    if (await countRollingCompletions(db, userId, at, 24) >= 3) {
      await db.prepare(
        `UPDATE planning_profiles
         SET mode = 'balanced', paused_at = NULL, pause_reason = NULL,
             last_behavior_at = ?, updated_at = ?
         WHERE user_id = ?`
      ).run(now, now, userId);
      profile = await getPlanningProfile(db, userId);
      await db.prepare(
        `UPDATE planning_day_states SET effective_cap = 5, updated_at = ?
         WHERE user_id = ? AND date_key = ?`
      ).run(now, userId, local.dateKey);
      await writeActionLog(db, {
        user_id: userId,
        actor: "agent",
        action_type: "auto_fill_resumed",
        summary: "已恢复今日自动补充",
        reason: "滚动 24 小时内完成了 3 件事",
      });
    } else {
      const result = await pausedResult(
        db,
        userId,
        local.dateKey,
        day.start,
        day.end,
        now,
        5
      );
      await markPlanApplied(db, userId, local.dateKey, options.planVersion, now);
      return result;
    }
  } else if (await hasStalledQueue(db, userId, at)) {
    await db.prepare(
      `UPDATE planning_profiles
       SET mode = 'paused', paused_at = ?, pause_reason = 'stalled_queue',
           last_behavior_at = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(now, now, now, userId);
    await writeActionLog(db, {
      user_id: userId,
      actor: "agent",
      action_type: "auto_fill_paused",
      summary: "已暂停今日自动补充",
      reason: "同一组今日安排 24 小时内没有完成记录",
    });
    const result = await pausedResult(
      db,
      userId,
      local.dateKey,
      day.start,
      day.end,
      now,
      profile.mode === "high_capacity" ? 10 : 5
    );
    await markPlanApplied(db, userId, local.dateKey, options.planVersion, now);
    return result;
  }
  await closeExpiredFeedbackEpisode(db, userId, at);
  const openFeedback = await getOpenFeedbackEpisode(db, userId);
  if (openFeedback && Date.parse(openFeedback.expires_at) > at.getTime()) {
    const result = await waitingForFeedbackResult(
      db,
      userId,
      local.dateKey,
      day.start,
      day.end,
      now,
      profile.mode,
      profile.mode === "high_capacity" ? 10 : 5
    );
    await markPlanApplied(db, userId, local.dateKey, options.planVersion, now);
    return result;
  }
  const dayState = await db
    .prepare(
      `SELECT effective_cap, tip_shown_level FROM planning_day_states
       WHERE user_id = ? AND date_key = ?`
    )
    .get(userId, local.dateKey) as {
    effective_cap: 5 | 10;
    tip_shown_level: number | null;
  };
  const completedToday = await countCompleted(db, userId, day.start, now);
  if (completedToday >= dayState.effective_cap) {
    const shouldShowTip = dayState.tip_shown_level !== dayState.effective_cap;
    await db.prepare(
      `UPDATE planning_day_states
       SET plan_version = ?, tip_shown_level = ?, updated_at = ?
       WHERE user_id = ? AND date_key = ?`
    ).run(
      options.planVersion,
      shouldShowTip ? dayState.effective_cap : dayState.tip_shown_level,
      now,
      userId,
      local.dateKey
    );
    return {
      date_key: local.dateKey,
      mode: profile.mode,
      effective_cap: dayState.effective_cap,
      completed_today: completedToday,
      remaining_today: await countOpenOnDay(
        db,
        userId,
        local.dateKey,
        day.start,
        day.end
      ),
      picked: [],
      tip: shouldShowTip
        ? "今天已经工作很久了，可以休息休息。"
        : null,
      auto_fill_paused: true,
    };
  }

  const rows = await db
    .prepare(
      `SELECT * FROM commitments
       WHERE user_id = ? AND status NOT IN ('completed', 'cancelled')
       ORDER BY created_at DESC`
    )
    .all(userId) as CommitmentRow[];
  const assignmentRows = await db
    .prepare(
      `SELECT commitment_id, status FROM today_assignments
       WHERE user_id = ? AND date_key = ? AND status IN ('active', 'removed')`
    )
    .all(userId, local.dateKey) as Array<{
    commitment_id: string;
    status: "active" | "removed";
  }>;
  const assignedToday = new Set(
    assignmentRows
      .filter((row) => row.status === "active")
      .map((row) => row.commitment_id)
  );
  const removedToday = new Set(
    assignmentRows
      .filter(
        (row) =>
          row.status === "removed" && !assignedToday.has(row.commitment_id)
      )
      .map((row) => row.commitment_id)
  );
  const today = rows.filter(
    (row) =>
      !removedToday.has(row.id) &&
      (assignedToday.has(row.id) || isOnDay(row, day.start, day.end))
  );
  const needed = Math.max(0, 3 - today.length);

  const recent = await db
    .prepare(
      `SELECT project_id, title, completed_at
       FROM commitments
       WHERE user_id = ? AND status = 'completed' AND completed_at >= ?
       ORDER BY completed_at DESC LIMIT 3`
    )
    .all(
      userId,
      new Date(at.getTime() - 7 * 24 * 3600 * 1000).toISOString()
    ) as Array<{ project_id: string | null; title: string; completed_at: string }>;
  const experience = await loadPlanningExperience(db, userId, at);
  const durationHistory = await loadDurationHistory(db, userId, at);
  const blockedIds = await blockedCommitmentIds(db, userId);

  const todayIds = new Set(today.map((row) => row.id));
  const excludedIds = new Set(
    (
      await db
        .prepare(
          `SELECT commitment_id FROM today_assignments
           WHERE user_id = ? AND status = 'removed'
             AND excluded_until IS NOT NULL AND excluded_until >= ?`
        )
        .all(userId, now) as Array<{ commitment_id: string }>
    ).map((row) => row.commitment_id)
  );
  const candidates = rows
    .filter(
      (row) =>
        !todayIds.has(row.id) &&
        !excludedIds.has(row.id) &&
        !blockedIds.has(row.id) &&
        isEligibleUnscheduled(row, at)
    )
    .map((row) => ({ row, ...scoreCandidate(row, recent, experience, at) }))
    .sort(
      (a, b) =>
        b.priorityTier - a.priorityTier ||
        b.score - a.score ||
        a.row.title.localeCompare(b.row.title)
    );

  const pickedMeta = candidates;
  const occupied = today
    .map((row) => ({
      start: Date.parse(String(row.ai_slot_start ?? "")),
      end: Date.parse(String(row.ai_slot_end ?? "")),
    }))
    .filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end))
    .sort((a, b) => a.start - b.start);
  const fixedEvents = await db
    .prepare(
      `SELECT start_at, end_at FROM events
       WHERE user_id = ? AND kind = 'fixed_external'
         AND start_at < ? AND end_at > ?`
    )
    .all(userId, day.end, now) as Array<{
    start_at: string;
    end_at: string;
  }>;
  for (const event of fixedEvents) {
    const start = Date.parse(event.start_at);
    const end = Date.parse(event.end_at);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      occupied.push({ start, end });
    }
  }
  occupied.sort((a, b) => a.start - b.start);

  // Load already on the day: the items on it plus the fixed events. The buffer
  // stops auto-fill before the daytime window is full.
  let plannedMinutes = 0;
  for (const row of today) {
    plannedMinutes +=
      positiveNumber(row.duration_minutes) ?? DEFAULT_DURATION_MINUTES;
  }
  for (const event of fixedEvents) {
    const minutes = (Date.parse(event.end_at) - Date.parse(event.start_at)) / 60000;
    if (Number.isFinite(minutes) && minutes > 0) plannedMinutes += minutes;
  }

  const picked: ReconcileTodayPlanResult["picked"] = [];
  const persist = await db.transaction(async () => {
    for (const meta of pickedMeta) {
      if (picked.length >= needed) break;
      const estimate = estimateDurationMinutes({
        stated: positiveNumber(meta.row.duration_minutes),
        history: meta.row.project_id
          ? durationHistory.get(String(meta.row.project_id))
          : undefined,
      });
      if (estimate.source === "history" || estimate.source === "blended") {
        meta.reasons.push(
          estimate.source === "blended" ? "时长按历史校准" : "时长按历史估算"
        );
      }
      if (plannedMinutes + estimate.minutes > capacityMinutes) break;
      const slot = findSlot(at.getTime(), Date.parse(day.end), estimate.minutes, occupied);
      if (!slot) continue;
      plannedMinutes += estimate.minutes;
      occupied.push(slot);
      occupied.sort((a, b) => a.start - b.start);

      await db.prepare(
        `UPDATE commitments
         SET ai_slot_start = ?, ai_slot_end = ?, status = 'scheduled', updated_at = ?
         WHERE id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
      ).run(
        new Date(slot.start).toISOString(),
        new Date(slot.end).toISOString(),
        now,
        meta.row.id,
        userId
      );
      await db.prepare(
        `INSERT INTO today_assignments
         (id, user_id, commitment_id, date_key, source, status, assigned_at, plan_version, reason)
         VALUES (?, ?, ?, ?, 'agent', 'active', ?, ?, ?)`
      ).run(
        newId("tda"),
        userId,
        meta.row.id,
        local.dateKey,
        now,
        options.planVersion,
        meta.reasons.join(" · ")
      );
      await writeActionLog(db, {
        user_id: userId,
        actor: "agent",
        action_type: "ai_slot_assigned",
        summary: "已补充到今日安排",
        reason: meta.reasons.join(" · "),
        entity_type: "commitment",
        entity_id: meta.row.id,
        payload: { plan_version: options.planVersion, date_key: local.dateKey },
      });
      picked.push({
        id: meta.row.id,
        title: meta.row.title,
        project_id: meta.row.project_id,
        reason: meta.reasons.join(" · "),
      });
    }
    await db.prepare(
      `UPDATE planning_day_states SET plan_version = ?, updated_at = ?
       WHERE user_id = ? AND date_key = ?`
    ).run(options.planVersion, now, userId, local.dateKey);
  });
  await persist();
  await updateQueueObservation(
    db,
    userId,
    local.dateKey,
    [...today.map((row) => row.id), ...picked.map((row) => row.id)],
    now
  );

  return {
    date_key: local.dateKey,
    mode: profile.mode,
    effective_cap: dayState.effective_cap,
    completed_today: completedToday,
    remaining_today: today.length + picked.length,
    picked,
    tip: null,
    auto_fill_paused: false,
  };
}

async function pausedResult(
  db: SqlDatabase,
  userId: string,
  dateKey: string,
  dayStart: string,
  dayEnd: string,
  completedUntil: string,
  cap: 5 | 10
): Promise<ReconcileTodayPlanResult> {
  return {
    date_key: dateKey,
    mode: "paused",
    effective_cap: cap,
    completed_today: await countCompleted(db, userId, dayStart, completedUntil),
    remaining_today: await countOpenOnDay(
      db,
      userId,
      dateKey,
      dayStart,
      dayEnd
    ),
    picked: [],
    tip: null,
    auto_fill_paused: true,
  };
}

async function countRollingCompletions(
  db: SqlDatabase,
  userId: string,
  at: Date,
  hours: number
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT id) AS count FROM commitments
       WHERE user_id = ? AND status = 'completed'
         AND completed_at >= ? AND completed_at <= ?`
    )
    .get(
      userId,
      new Date(at.getTime() - hours * 3600 * 1000).toISOString(),
      at.toISOString()
    ) as { count: number };
  return Number(row.count);
}

async function hasStalledQueue(
  db: SqlDatabase,
  userId: string,
  at: Date
): Promise<boolean> {
  const state = await db
    .prepare(
      `SELECT queue_fingerprint, queue_observed_at
       FROM planning_day_states
       WHERE user_id = ? AND queue_fingerprint IS NOT NULL
         AND queue_observed_at IS NOT NULL
       ORDER BY queue_observed_at DESC LIMIT 1`
    )
    .get(userId) as
    | { queue_fingerprint: string; queue_observed_at: string }
    | undefined;
  if (!state) return false;
  const observedAt = Date.parse(state.queue_observed_at);
  if (!Number.isFinite(observedAt) || at.getTime() - observedAt < 24 * 3600 * 1000) {
    return false;
  }
  const ids = parseIds(state.queue_fingerprint);
  if (ids.length < 1 || ids.length > 3) return false;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT id, status, completed_at FROM commitments
       WHERE user_id = ? AND id IN (${placeholders})`
    )
    .all(userId, ...ids) as Array<{
    id: string;
    status: string;
    completed_at: string | null;
  }>;
  if (rows.length !== ids.length) return false;
  const completedDuringObservation = rows.some(
    (row) =>
      row.status === "completed" &&
      row.completed_at &&
      Date.parse(row.completed_at) >= observedAt
  );
  return !completedDuringObservation && rows.every((row) => row.status !== "cancelled");
}

async function updateQueueObservation(
  db: SqlDatabase,
  userId: string,
  dateKey: string,
  ids: string[],
  atIso: string
) {
  const unique = [...new Set(ids)].sort();
  const fingerprint = unique.length >= 1 && unique.length <= 3
    ? JSON.stringify(unique)
    : null;
  const current = await db
    .prepare(
      `SELECT queue_fingerprint, queue_observed_at FROM planning_day_states
       WHERE user_id = ? AND date_key = ?`
    )
    .get(userId, dateKey) as {
    queue_fingerprint: string | null;
    queue_observed_at: string | null;
  };
  const observedAt = current.queue_fingerprint === fingerprint
    ? current.queue_observed_at
    : fingerprint
      ? atIso
      : null;
  await db.prepare(
    `UPDATE planning_day_states
     SET queue_fingerprint = ?, queue_observed_at = ?, updated_at = ?
     WHERE user_id = ? AND date_key = ?`
  ).run(fingerprint, observedAt, atIso, userId, dateKey);
}

function parseIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function recordUserTodayArrangement(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  commitmentId: string,
  options?: { at?: Date }
): Promise<{ elevated_cap: boolean }> {
  const at = options?.at ?? new Date();
  const now = at.toISOString();
  const dateKey = getLocalParts(timezone, at).dateKey;
  const commitment = await db
    .prepare(
      `SELECT id FROM commitments
       WHERE id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
    )
    .get(commitmentId, userId);
  if (!commitment) throw new Error("commitment_not_found");

  await ensurePlanningProfile(db, userId, now);
  const profile = await normalizeCapacityForDate(
    db,
    userId,
    timezone,
    dateKey,
    now
  );
  await ensureDayState(
    db,
    userId,
    dateKey,
    profile.mode === "high_capacity" ? 10 : 5,
    now
  );
  const state = await db
    .prepare(
      `SELECT effective_cap, tip_shown_level FROM planning_day_states
       WHERE user_id = ? AND date_key = ?`
    )
    .get(userId, dateKey) as {
    effective_cap: 5 | 10;
    tip_shown_level: number | null;
  };
  const alreadyActive = Boolean(
    await db
      .prepare(
        `SELECT 1 FROM today_assignments
         WHERE user_id = ? AND commitment_id = ? AND date_key = ?
           AND status = 'active' LIMIT 1`
      )
      .get(userId, commitmentId, dateKey)
  );
  const elevated = !alreadyActive &&
    state.effective_cap === 5 &&
    state.tip_shown_level === 5;

  const persist = await db.transaction(async () => {
    const inserted = await db.prepare(
      `INSERT INTO today_assignments
       (id, user_id, commitment_id, date_key, source, status, assigned_at, reason)
       SELECT ?, ?, ?, ?, 'user', 'active', ?, '用户明确安排到今天'
       WHERE NOT EXISTS (
         SELECT 1 FROM today_assignments
         WHERE user_id = ? AND commitment_id = ? AND date_key = ? AND status = 'active'
       )`
    ).run(
      newId("tda"),
      userId,
      commitmentId,
      dateKey,
      now,
      userId,
      commitmentId,
      dateKey
    );
    if (elevated) {
      await db.prepare(
        `UPDATE planning_day_states
         SET effective_cap = 10, updated_at = ?
         WHERE user_id = ? AND date_key = ?`
      ).run(now, userId, dateKey);
      await db.prepare(
        `UPDATE planning_profiles
         SET mode = 'high_capacity', paused_at = NULL, pause_reason = NULL,
             last_behavior_at = ?, updated_at = ?
         WHERE user_id = ?`
      ).run(now, now, userId);
    }
    if (inserted.changes > 0) {
      await resetQueueObservation(db, userId, now);
    }
    if (inserted.changes > 0 || elevated) {
      await writeActionLog(db, {
        user_id: userId,
        actor: "user",
        action_type: "user_scheduled_today",
        summary: "安排到今天",
        entity_type: "commitment",
        entity_id: commitmentId,
        payload: { date_key: dateKey, elevated_cap: elevated },
      });
    }
  });
  await persist();
  return { elevated_cap: elevated };
}

export async function removeFromToday(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  commitmentId: string,
  options?: { at?: Date }
): Promise<{
  assignment_source: "user" | "agent";
  feedback_episode_id: string | null;
}> {
  const at = options?.at ?? new Date();
  const now = at.toISOString();
  const local = getLocalParts(timezone, at);
  const day = localDayWindow(timezone, local.dateKey, "full");
  let assignment = await db
    .prepare(
      `SELECT ta.id, ta.source, c.project_id
       FROM today_assignments ta
       INNER JOIN commitments c ON c.id = ta.commitment_id
       WHERE ta.user_id = ? AND ta.commitment_id = ? AND ta.date_key = ?
         AND ta.status = 'active'
       ORDER BY ta.assigned_at DESC LIMIT 1`
    )
    .get(userId, commitmentId, local.dateKey) as
    | { id: string; source: "user" | "agent"; project_id: string | null }
    | undefined;
  let inferredAssignment = false;
  if (!assignment) {
    const removed = await db
      .prepare(
        `SELECT id, source FROM today_assignments
         WHERE user_id = ? AND commitment_id = ? AND date_key = ?
           AND status = 'removed'
         ORDER BY removed_at DESC LIMIT 1`
      )
      .get(userId, commitmentId, local.dateKey) as
      | { id: string; source: "user" | "agent" }
      | undefined;
    if (removed) {
      return {
        assignment_source: removed.source,
        feedback_episode_id: null,
      };
    }

    const commitment = await db
      .prepare(`SELECT * FROM commitments WHERE id = ? AND user_id = ?`)
      .get(commitmentId, userId) as CommitmentRow | undefined;
    const deadlineMs = commitment?.deadline
      ? Date.parse(String(commitment.deadline))
      : Number.NaN;
    const isVisibleRisk = Boolean(
      commitment &&
        (commitment.status === "risk" ||
          (Number.isFinite(deadlineMs) &&
            deadlineMs <= at.getTime() + 24 * 3600 * 1000))
    );
    if (
      !commitment ||
      (!isOnDay(commitment, day.start, day.end) &&
        !commitment.started_at &&
        !isVisibleRisk)
    ) {
      throw new Error("today_assignment_not_found");
    }
    const source = overlapsRange(
      commitment.ai_slot_start,
      commitment.ai_slot_end,
      Date.parse(day.start),
      Date.parse(day.end)
    )
      ? "agent"
      : "user";
    assignment = {
      id: newId("tda"),
      source,
      project_id: commitment.project_id,
    };
    inferredAssignment = true;
  }

  let feedbackEpisodeId: string | null = null;
  const persist = await db.transaction(async () => {
    if (inferredAssignment) {
      await db.prepare(
        `INSERT INTO today_assignments
         (id, user_id, commitment_id, date_key, source, status, assigned_at, reason)
         VALUES (?, ?, ?, ?, ?, 'active', ?, '沿用现有今日安排')`
      ).run(
        assignment.id,
        userId,
        commitmentId,
        local.dateKey,
        assignment.source,
        now
      );
    }
    await db.prepare(
      `UPDATE today_assignments
       SET status = 'removed', removed_at = ?, excluded_until = ?
       WHERE id = ? AND status = 'active'`
    ).run(now, day.end, assignment.id);
    await db.prepare(
      `UPDATE commitments SET started_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(now, commitmentId, userId);
    if (assignment.source === "agent") {
      await db.prepare(
        `UPDATE commitments
         SET ai_slot_start = NULL, ai_slot_end = NULL,
             status = CASE WHEN status = 'scheduled' THEN 'planned' ELSE status END,
             updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(now, commitmentId, userId);
      feedbackEpisodeId = await appendFeedbackDismissal(
        db,
        userId,
        assignment.id,
        assignment.project_id,
        at
      );
    }
    await writeActionLog(db, {
      user_id: userId,
      actor: "user",
      action_type:
        assignment.source === "agent"
          ? "agent_recommendation_rejected"
          : "user_plan_revised",
      summary: "已退回未排期",
      entity_type: "commitment",
      entity_id: commitmentId,
      payload: {
        assignment_id: assignment.id,
        assignment_source: assignment.source,
        feedback_episode_id: feedbackEpisodeId,
      },
    });
    await resetQueueObservation(db, userId, now);
  });
  await persist();
  return {
    assignment_source: assignment.source,
    feedback_episode_id: feedbackEpisodeId,
  };
}

export async function observePlanningOutcome(
  db: SqlDatabase,
  userId: string,
  input: {
    kind: "started" | "completed" | "scheduled_today" | "commitment_created";
    commitmentId: string;
    at?: Date;
  }
): Promise<PlanningOutcome | null> {
  const at = input.at ?? new Date();
  const open = await getOpenFeedbackEpisode(db, userId);
  if (!open) return null;
  if (Date.parse(open.expires_at) <= at.getTime()) {
    await closeFeedbackEpisode(db, userId, open.id, "stopped_working", null, null, at);
    return "stopped_working";
  }

  const target = await db
    .prepare(
      `SELECT id, project_id FROM commitments WHERE id = ? AND user_id = ?`
    )
    .get(input.commitmentId, userId) as
    | { id: string; project_id: string | null }
    | undefined;
  if (!target) return null;
  const dismissedProjects = parseIds(open.dismissed_project_ids);
  let outcome: PlanningOutcome;
  if (input.kind === "commitment_created") {
    outcome = "self_defined_task";
  } else if (target.project_id && dismissedProjects.includes(target.project_id)) {
    outcome = "same_project_task_switch";
  } else {
    outcome = "project_switch";
  }
  await closeFeedbackEpisode(
    db,
    userId,
    open.id,
    outcome,
    target.id,
    target.project_id,
    at
  );
  return outcome;
}

async function closeExpiredFeedbackEpisode(
  db: SqlDatabase,
  userId: string,
  at: Date
) {
  const open = await getOpenFeedbackEpisode(db, userId);
  if (!open || Date.parse(open.expires_at) > at.getTime()) return;
  await closeFeedbackEpisode(db, userId, open.id, "stopped_working", null, null, at);
}

async function closeFeedbackEpisode(
  db: SqlDatabase,
  userId: string,
  episodeId: string,
  outcome: PlanningOutcome,
  targetCommitmentId: string | null,
  targetProjectId: string | null,
  at: Date
) {
  const now = at.toISOString();
  const changed = await db
    .prepare(
      `UPDATE planning_feedback_episodes
       SET status = 'closed', outcome = ?, target_commitment_id = ?,
           target_project_id = ?, closed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'open'`
    )
    .run(
      outcome,
      targetCommitmentId,
      targetProjectId,
      now,
      now,
      episodeId,
      userId
    );
  if (changed.changes === 0) return;
  await writeActionLog(db, {
    user_id: userId,
    actor: "agent",
    action_type: "planning_feedback_observed",
    summary: "已记录任务选择结果",
    reason: outcome,
    entity_type: "planning_feedback_episode",
    entity_id: episodeId,
    payload: {
      outcome,
      target_commitment_id: targetCommitmentId,
      target_project_id: targetProjectId,
    },
  });
}

async function appendFeedbackDismissal(
  db: SqlDatabase,
  userId: string,
  assignmentId: string,
  projectId: string | null,
  at: Date
): Promise<string> {
  const now = at.toISOString();
  const open = await getOpenFeedbackEpisode(db, userId);
  if (open && Date.parse(open.expires_at) > at.getTime()) {
    const assignments = uniqueStrings([
      ...parseIds(open.dismissed_assignment_ids),
      assignmentId,
    ]);
    const projects = uniqueStrings([
      ...parseIds(open.dismissed_project_ids),
      ...(projectId ? [projectId] : []),
    ]);
    await db.prepare(
      `UPDATE planning_feedback_episodes
       SET dismissed_assignment_ids = ?, dismissed_project_ids = ?, updated_at = ?
       WHERE id = ?`
    ).run(JSON.stringify(assignments), JSON.stringify(projects), now, open.id);
    return open.id;
  }

  const id = newId("pfe");
  await db.prepare(
    `INSERT INTO planning_feedback_episodes
     (id, user_id, status, opened_at, expires_at,
      dismissed_assignment_ids, dismissed_project_ids, created_at, updated_at)
     VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    now,
    new Date(at.getTime() + 24 * 3600 * 1000).toISOString(),
    JSON.stringify([assignmentId]),
    JSON.stringify(projectId ? [projectId] : []),
    now,
    now
  );
  return id;
}

async function getOpenFeedbackEpisode(
  db: SqlDatabase,
  userId: string
): Promise<
  | {
      id: string;
      expires_at: string;
      dismissed_assignment_ids: string;
      dismissed_project_ids: string;
    }
  | undefined
> {
  return await db
    .prepare(
      `SELECT id, expires_at, dismissed_assignment_ids, dismissed_project_ids
       FROM planning_feedback_episodes
       WHERE user_id = ? AND status = 'open'
       ORDER BY opened_at DESC LIMIT 1`
    )
    .get(userId) as
    | {
        id: string;
        expires_at: string;
        dismissed_assignment_ids: string;
        dismissed_project_ids: string;
      }
    | undefined;
}

async function waitingForFeedbackResult(
  db: SqlDatabase,
  userId: string,
  dateKey: string,
  dayStart: string,
  dayEnd: string,
  atIso: string,
  mode: "balanced" | "high_capacity" | "paused",
  cap: 5 | 10
): Promise<ReconcileTodayPlanResult> {
  return {
    date_key: dateKey,
    mode,
    effective_cap: cap,
    completed_today: await countCompleted(db, userId, dayStart, atIso),
    remaining_today: await countOpenOnDay(
      db,
      userId,
      dateKey,
      dayStart,
      dayEnd
    ),
    picked: [],
    tip: null,
    auto_fill_paused: true,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

async function countOpenOnDay(
  db: SqlDatabase,
  userId: string,
  dateKey: string,
  dayStart: string,
  dayEnd: string
): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT * FROM commitments
       WHERE user_id = ? AND status NOT IN ('completed', 'cancelled')`
    )
    .all(userId) as CommitmentRow[];
  const assignments = await db
    .prepare(
      `SELECT commitment_id, status FROM today_assignments
       WHERE user_id = ? AND date_key = ? AND status IN ('active', 'removed')`
    )
    .all(userId, dateKey) as Array<{
    commitment_id: string;
    status: "active" | "removed";
  }>;
  const activeIds = new Set(
    assignments
      .filter((row) => row.status === "active")
      .map((row) => row.commitment_id)
  );
  const removedIds = new Set(
    assignments
      .filter(
        (row) =>
          row.status === "removed" && !activeIds.has(row.commitment_id)
      )
      .map((row) => row.commitment_id)
  );
  return rows.filter(
    (row) =>
      !removedIds.has(row.id) &&
      (activeIds.has(row.id) || isOnDay(row, dayStart, dayEnd))
  ).length;
}

async function ensureDayState(
  db: SqlDatabase,
  userId: string,
  dateKey: string,
  initialCap: 5 | 10,
  atIso: string
) {
  await db.prepare(
    `INSERT INTO planning_day_states
     (user_id, date_key, plan_version, effective_cap, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?)
     ON CONFLICT(user_id, date_key) DO NOTHING`
  ).run(userId, dateKey, initialCap, atIso, atIso);
}

async function markPlanApplied(
  db: SqlDatabase,
  userId: string,
  dateKey: string,
  planVersion: string,
  atIso: string
) {
  await db.prepare(
    `UPDATE planning_day_states SET plan_version = ?, updated_at = ?
     WHERE user_id = ? AND date_key = ?`
  ).run(planVersion, atIso, userId, dateKey);
}

async function ensurePlanningProfile(
  db: SqlDatabase,
  userId: string,
  atIso: string
) {
  await db.prepare(
    `INSERT INTO planning_profiles
     (user_id, mode, created_at, updated_at)
     VALUES (?, 'balanced', ?, ?)
     ON CONFLICT(user_id) DO NOTHING`
  ).run(userId, atIso, atIso);
}

async function getPlanningProfile(
  db: SqlDatabase,
  userId: string
): Promise<{
  mode: "balanced" | "high_capacity" | "paused";
  paused_at: string | null;
  pause_reason: string | null;
  last_behavior_at: string | null;
}> {
  return await db
    .prepare(
      `SELECT mode, paused_at, pause_reason, last_behavior_at
       FROM planning_profiles WHERE user_id = ?`
    )
    .get(userId) as {
    mode: "balanced" | "high_capacity" | "paused";
    paused_at: string | null;
    pause_reason: string | null;
    last_behavior_at: string | null;
  };
}

async function normalizeCapacityForDate(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  dateKey: string,
  atIso: string
) {
  let profile = await getPlanningProfile(db, userId);
  if (
    profile.mode === "high_capacity" &&
    (!profile.last_behavior_at ||
      getLocalParts(timezone, new Date(profile.last_behavior_at)).dateKey !==
        dateKey)
  ) {
    await db.prepare(
      `UPDATE planning_profiles
       SET mode = 'balanced', updated_at = ? WHERE user_id = ?`
    ).run(atIso, userId);
    profile = await getPlanningProfile(db, userId);
  }
  return profile;
}

async function countCompleted(
  db: SqlDatabase,
  userId: string,
  dayStart: string,
  dayEnd: string
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM commitments
       WHERE user_id = ? AND status = 'completed'
         AND completed_at >= ? AND completed_at <= ?`
    )
    .get(userId, dayStart, dayEnd) as { count: number };
  return Number(row.count);
}

function isEligibleUnscheduled(row: CommitmentRow, at: Date): boolean {
  if (row.ai_slot_start || row.ai_slot_end) return false;
  if (row.window_end && Date.parse(String(row.window_end)) < at.getTime()) {
    return false;
  }
  if (row.window_start && Date.parse(String(row.window_start)) > at.getTime()) {
    return false;
  }
  return true;
}

function scoreCandidate(
  row: CommitmentRow,
  recent: Array<{ project_id: string | null; title: string; completed_at: string }>,
  experience: PlanningExperience,
  at: Date
): { priorityTier: number; score: number; reasons: string[] } {
  let score = 10;
  let priorityTier = 0;
  const reasons: string[] = [];
  const deadlineMs = row.deadline
    ? Date.parse(String(row.deadline))
    : Number.NaN;
  if (
    row.status === "risk" ||
    (Number.isFinite(deadlineMs) &&
      deadlineMs <= at.getTime() + 24 * 3600 * 1000)
  ) {
    priorityTier = 2;
    score += 500;
    reasons.push("临近截止");
  } else if (
    Number.isFinite(deadlineMs) &&
    deadlineMs <= at.getTime() + 72 * 3600 * 1000
  ) {
    priorityTier = 1;
    score += 200;
    reasons.push("近期有截止");
  }
  const matchingProject = recent.find(
    (item) => item.project_id && item.project_id === row.project_id
  );
  if (matchingProject) {
    score += 80;
    reasons.push("延续最近完成项目");
  }
  if (/修复|调整|添加|实现|优化|fix|add|update/i.test(row.title)) {
    score += 24;
    reasons.push("任务具体可执行");
  }
  const duration = positiveNumber(row.duration_minutes);
  if (duration && duration <= 90) {
    score += 12;
    reasons.push("预计耗时可控");
  }
  const importance = positiveNumber(row.importance);
  if (importance) score += Math.round(importance * 15);

  const titleTokens = tokens(row.title);
  const overlap = recent.some((item) =>
    tokens(item.title).some((token) => titleTokens.includes(token))
  );
  if (overlap) {
    score += 15;
    reasons.push("内容与最近完成相关");
  }

  if (row.project_id) {
    const projectWeight = experience.projectWeights.get(row.project_id) ?? 0;
    if (projectWeight !== 0) {
      score += projectWeight;
      reasons.push(
        projectWeight > 0
          ? "近期多次切换到该项目"
          : "近期多次从该项目切换"
      );
    }
  }
  if (experience.prefersSelfDefined && createdAtWithin(row, at, 24)) {
    score += 30;
    reasons.push("近期更常主动定义下一步");
  }
  if (
    experience.prefersShortNextStep &&
    duration !== null &&
    duration <= 30
  ) {
    score += 35;
    reasons.push("近期停下后更适合较短下一步");
  }

  const createdAt = Date.parse(String(row.created_at ?? ""));
  if (Number.isFinite(createdAt) && at.getTime() - createdAt < 72 * 3600 * 1000) {
    score += 5;
  }
  return {
    priorityTier,
    score,
    reasons: reasons.length ? reasons : ["当前可推进"],
  };
}

type PlanningExperience = {
  projectWeights: Map<string, number>;
  prefersSelfDefined: boolean;
  prefersShortNextStep: boolean;
};

async function loadPlanningExperience(
  db: SqlDatabase,
  userId: string,
  at: Date
): Promise<PlanningExperience> {
  const rows = await db
    .prepare(
      `SELECT outcome, dismissed_project_ids, target_project_id
       FROM planning_feedback_episodes
       WHERE user_id = ? AND status = 'closed'
         AND closed_at >= ? AND closed_at <= ?`
    )
    .all(
      userId,
      new Date(at.getTime() - 15 * 24 * 3600 * 1000).toISOString(),
      at.toISOString()
    ) as Array<{
    outcome: PlanningOutcome;
    dismissed_project_ids: string;
    target_project_id: string | null;
  }>;

  const switches = new Map<string, number>();
  const sameProjectSwitches = new Map<string, number>();
  let projectSwitchCount = 0;
  let sameProjectSwitchCount = 0;
  let selfDefinedCount = 0;
  let stoppedCount = 0;
  for (const row of rows) {
    if (row.outcome === "self_defined_task") selfDefinedCount++;
    if (row.outcome === "stopped_working") stoppedCount++;
    if (
      row.outcome === "same_project_task_switch" &&
      row.target_project_id
    ) {
      sameProjectSwitchCount++;
      sameProjectSwitches.set(
        row.target_project_id,
        (sameProjectSwitches.get(row.target_project_id) ?? 0) + 1
      );
    }
    if (row.outcome !== "project_switch" || !row.target_project_id) continue;
    projectSwitchCount++;
    for (const source of parseIds(row.dismissed_project_ids)) {
      const key = `${source}\u0000${row.target_project_id}`;
      switches.set(key, (switches.get(key) ?? 0) + 1);
    }
  }

  const projectWeights = new Map<string, number>();
  for (const [key, count] of switches) {
    if (projectSwitchCount < 3) continue;
    const [source, target] = key.split("\u0000");
    if (!source || !target) continue;
    projectWeights.set(source, (projectWeights.get(source) ?? 0) - 30 * count);
    projectWeights.set(target, (projectWeights.get(target) ?? 0) + 60 * count);
  }
  for (const [projectId, count] of sameProjectSwitches) {
    if (sameProjectSwitchCount < 3) continue;
    projectWeights.set(
      projectId,
      (projectWeights.get(projectId) ?? 0) + 30 * count
    );
  }
  return {
    projectWeights,
    prefersSelfDefined: selfDefinedCount >= 3,
    prefersShortNextStep: stoppedCount >= 3,
  };
}

/** Completed durations per project over the last 90 days, for slot sizing. */
async function loadDurationHistory(
  db: SqlDatabase,
  userId: string,
  at: Date
): Promise<Map<string, number[]>> {
  const rows = (await db
    .prepare(
      `SELECT project_id, duration_minutes FROM commitments
       WHERE user_id = ? AND status = 'completed' AND duration_minutes IS NOT NULL
         AND completed_at >= ? AND completed_at <= ?`
    )
    .all(
      userId,
      new Date(at.getTime() - 90 * 24 * 3600 * 1000).toISOString(),
      at.toISOString()
    )) as Array<{ project_id: string | null; duration_minutes: number }>;

  const history = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.project_id) continue;
    const list = history.get(row.project_id) ?? [];
    list.push(Number(row.duration_minutes));
    history.set(row.project_id, list);
  }
  return history;
}

function createdAtWithin(
  row: CommitmentRow,
  at: Date,
  hours: number
): boolean {
  const created = Date.parse(String(row.created_at ?? ""));
  return Number.isFinite(created) && at.getTime() - created <= hours * 3600 * 1000;
}

function tokens(text: string): string[] {
  const segments = text
    .toLowerCase()
    .match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) ?? [];
  const result: string[] = [];
  for (const segment of segments) {
    if (/^[\p{Script=Han}]+$/u.test(segment)) {
      for (let index = 0; index < segment.length - 1; index++) {
        result.push(segment.slice(index, index + 2));
      }
    } else if (segment.length >= 2) {
      result.push(segment);
    }
  }
  return [...new Set(result)];
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function findSlot(
  earliestMs: number,
  dayEndMs: number,
  durationMinutes: number,
  occupied: Array<{ start: number; end: number }>
): { start: number; end: number } | null {
  const step = 15 * 60 * 1000;
  const duration = durationMinutes * 60 * 1000;
  let start = Math.ceil(earliestMs / step) * step;
  while (start + duration <= dayEndMs) {
    const end = start + duration;
    const conflict = occupied.find((slot) => start < slot.end && end > slot.start);
    if (!conflict) return { start, end };
    start = Math.ceil(conflict.end / step) * step;
  }
  return null;
}

function isOnDay(
  row: CommitmentRow,
  dayStart: string,
  dayEnd: string
): boolean {
  const start = Date.parse(dayStart);
  const end = Date.parse(dayEnd);
  if (overlapsRange(row.ai_slot_start, row.ai_slot_end, start, end)) return true;
  if (overlapsRange(row.window_start, row.window_end, start, end)) return true;
  return Boolean(row.deadline && inRange(String(row.deadline), start, end));
}

function overlapsRange(
  from: unknown,
  to: unknown,
  dayStart: number,
  dayEnd: number
): boolean {
  if (!from && !to) return false;
  const fromMs = from ? Date.parse(String(from)) : dayStart;
  const toMs = to ? Date.parse(String(to)) : dayEnd;
  return (
    Number.isFinite(fromMs) &&
    Number.isFinite(toMs) &&
    fromMs <= dayEnd &&
    toMs >= dayStart
  );
}

async function resetQueueObservation(
  db: SqlDatabase,
  userId: string,
  atIso: string
) {
  await db.prepare(
    `UPDATE planning_day_states
     SET queue_fingerprint = NULL, queue_observed_at = NULL, updated_at = ?
     WHERE user_id = ?`
  ).run(atIso, userId);
}

function inRange(value: string, start: number, end: number): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= start && time <= end;
}
