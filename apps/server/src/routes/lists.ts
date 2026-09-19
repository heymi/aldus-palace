import { Hono } from "hono";
import {
  actionSummary,
  buildToday,
  commitmentsAreNearDuplicate,
  commitmentTitleFromThought,
  conceptsForMemory,
  confirmMemory,
  getOrCreateConcept,
  isLowValueSummary,
  linkMemoryToConcepts,
  listActionLogs,
  listCommitmentsPage,
  listConcepts,
  listMemoriesByState,
  listMemoryVersions,
  listWorkStreams,
  localeOf,
  makeThoughtSummary,
  makeThoughtTitle,
  matchProjectFromContent,
  memoryState,
  newId,
  normalizeCommitmentKey,
  normalizeMemoryKey,
  nowIso,
  observePlanningOutcome,
  overrideCommitmentClassification,
  rebuildCommitmentClassifications,
  reconcileTodayPlan,
  recordUserTodayArrangement,
  rejectMemory,
  removeFromToday,
  resolveClarificationByOption,
  suggestConceptNamesForMemory,
  type MemoryListState,
  writeActionLog,
} from "@aldus-palace/core";
import type { AppVariables } from "../middleware/auth.js";
import { requireUser } from "../middleware/auth.js";
import type { AppDeps } from "../context.js";

export function createListRoutes(deps: AppDeps): Hono<{
  Variables: AppVariables;
}> {
  const { db, llm } = deps;
  const listRoutes = new Hono<{ Variables: AppVariables }>();
  const titleOf = makeThoughtTitle;

  listRoutes.get("/me", async (c) => {
    return c.json({ user: await requireUser(c, db) });
  });

  listRoutes.get("/thoughts", async (c) => {
    const user = await requireUser(c, db);
    const rows = (await db
      .prepare(
        `SELECT t.*,
        ri.content AS source_input_content,
        ri.source AS source_input_source,
        ri.created_at AS source_input_created_at
       FROM thoughts t
       LEFT JOIN raw_inputs ri ON ri.id = t.source_input_id
       WHERE t.user_id = ? AND t.status != 'archived'
       ORDER BY t.created_at DESC LIMIT 100`
      )
      .all(user.id)) as Array<Record<string, unknown>>;
    const items = rows.map((r) => ({
      ...r,
      title: (r.title as string | null) || titleOf(String(r.content ?? "")),
    }));
    return c.json({ items });
  });

  /**
   * Re-generate understanding summaries for thoughts that still equal raw paste
   * or are low-value first/last reassembly (e.g. 要点=hook + 联想=punchline).
   */
  listRoutes.post("/thoughts/rewrite-summaries", async (c) => {
    const user = await requireUser(c, db);
    const rows = (await db
      .prepare(
        `SELECT t.id, t.content, t.title, t.project_id, t.source_input_id,
              ri.content AS raw,
              p.name AS project_name, p.description AS project_description,
              p.aliases AS project_aliases
       FROM thoughts t
       LEFT JOIN raw_inputs ri ON ri.id = t.source_input_id
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.user_id = ?`
      )
      .all(user.id)) as Array<{
      id: string;
      content: string;
      title: string | null;
      project_id: string | null;
      source_input_id: string | null;
      raw: string | null;
      project_name: string | null;
      project_description: string | null;
      project_aliases: string | null;
    }>;

    const t = nowIso();
    let updated = 0;
    for (const row of rows) {
      const raw = (row.raw || row.content || "").trim();
      if (!raw) continue;
      const same =
        row.content.trim() === raw ||
        (raw.length > 160 && row.content.length > raw.length * 0.8);
      const lowValue = isLowValueSummary(raw, row.content);
      // Skip only when already a solid, non-low-value summary
      if (!same && !lowValue && row.content.length < 400 && raw.length > 160) {
        continue;
      }
      if (!same && !lowValue && raw.length <= 160) continue;

      // Infer project from title when not linked
      let pname = row.project_name;
      let pdesc = row.project_description;
      let palias = row.project_aliases;
      if (!pname && row.title) {
        const m = row.title.match(
          /对\s*([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff]{1,24})\s*的启发/
        );
        if (m?.[1]) {
          const p = (await db
            .prepare(
              `SELECT name, description, aliases FROM projects
               WHERE user_id = ? AND lower(name) = lower(?) LIMIT 1`
            )
            .get(user.id, m[1])) as
            | { name: string; description: string | null; aliases: string | null }
            | undefined;
          if (p) {
            pname = p.name;
            pdesc = p.description;
            palias = p.aliases;
          } else {
            pname = m[1];
          }
        }
      }

      const summary = makeThoughtSummary(raw, undefined, {
        projectName: pname,
        projectDescription: pdesc,
        aliases: palias,
        title: row.title,
      });
      // Keep a good transfer title; only fill missing titles
      const title =
        (row.title && row.title.trim()) || makeThoughtTitle(raw);
      if (summary === row.content && title === row.title) continue;
      await db
        .prepare(
          `UPDATE thoughts SET content = ?, title = ?, original_excerpt = ?, updated_at = ? WHERE id = ?`
        )
        .run(summary, title, raw, t, row.id);
      updated++;
    }
    return c.json({ ok: true, updated_count: updated });
  });

  /** Single thought + original raw input record */
  listRoutes.get("/thoughts/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const row = (await db
      .prepare(
        `SELECT t.*,
        ri.content AS source_input_content,
        ri.source AS source_input_source,
        ri.created_at AS source_input_created_at,
        ri.id AS raw_input_id
       FROM thoughts t
       LEFT JOIN raw_inputs ri ON ri.id = t.source_input_id
       WHERE t.id = ? AND t.user_id = ?`
      )
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({
      thought: {
        ...row,
        title: (row.title as string | null) || titleOf(String(row.content ?? "")),
      },
    });
  });

  /**
   * Convert a Thought (requirement/idea) into a Commitment.
   * Does not delete the thought; marks status=converted.
   */
  listRoutes.post("/thoughts/:id/convert-to-commitment", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
    };
    const thought = (await db
      .prepare(`SELECT * FROM thoughts WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!thought) return c.json({ error: "not_found" }, 404);

    // Idempotent: by thought id, same input, or near-duplicate open title
    const byThought = (await db
      .prepare(
        `SELECT * FROM commitments
         WHERE user_id = ? AND source_thought_id = ?
           AND status NOT IN ('completed', 'cancelled')
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(user.id, id)) as Record<string, unknown> | undefined;

    let byInput: Record<string, unknown> | undefined;
    if (thought.source_input_id) {
      byInput = (await db
        .prepare(
          `SELECT * FROM commitments
           WHERE user_id = ? AND source_input_id = ?
             AND status NOT IN ('completed', 'cancelled')
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(user.id, thought.source_input_id)) as
        | Record<string, unknown>
        | undefined;
    }

    const proposedTitle =
      body.title?.trim() ||
      commitmentTitleFromThought(
        thought.title as string | null,
        String(thought.content ?? "")
      );

    const openAll = (await db
      .prepare(
        `SELECT * FROM commitments
         WHERE user_id = ? AND status NOT IN ('completed', 'cancelled')`
      )
      .all(user.id)) as Array<Record<string, unknown>>;
    const byNear = openAll.find((row) =>
      commitmentsAreNearDuplicate(String(row.title ?? ""), proposedTitle)
    );

    const existing = byThought || byInput || byNear;
    if (existing) {
      const t = nowIso();
      // Link thought → existing commitment if missing
      if (!existing.source_thought_id) {
        await db
          .prepare(
            `UPDATE commitments SET source_thought_id = ?, updated_at = ? WHERE id = ?`
          )
          .run(id, t, existing.id);
      }
      await db
        .prepare(
          `UPDATE thoughts SET status = 'converted', updated_at = ? WHERE id = ?`
        )
        .run(t, id);
      // Same input: convert sibling thoughts too
      if (thought.source_input_id) {
        await db
          .prepare(
            `UPDATE thoughts SET status = 'converted', updated_at = ?
             WHERE source_input_id = ? AND user_id = ? AND status != 'archived'`
          )
          .run(t, thought.source_input_id, user.id);
      }
      return c.json(
        {
          commitment: await db
            .prepare(`SELECT * FROM commitments WHERE id = ?`)
            .get(existing.id),
          thought: await db.prepare(`SELECT * FROM thoughts WHERE id = ?`).get(id),
          already_exists: true,
          message: "已有对应的要做的事，未重复创建",
        },
        200
      );
    }

    const title = proposedTitle;

    const t = nowIso();
    const cmtId = newId("cmt");
    await db
      .prepare(
        `INSERT INTO commitments
         (id, user_id, title, goal, optimized_content, project_id, status, source_thought_id, source_input_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'captured', ?, ?, ?, ?)`
      )
      .run(
        cmtId,
        user.id,
        title,
        null,
        String(thought.content ?? "").slice(0, 500),
        thought.project_id ?? null,
        id,
        thought.source_input_id ?? null,
        t,
        t
      );

    await db
      .prepare(
        `UPDATE thoughts SET status = 'converted', updated_at = ? WHERE id = ?`
      )
      .run(t, id);
    if (thought.source_input_id) {
      await db
        .prepare(
          `UPDATE thoughts SET status = 'converted', updated_at = ?
           WHERE source_input_id = ? AND user_id = ? AND status != 'archived'`
        )
        .run(t, thought.source_input_id, user.id);
    }

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "thought_converted",
      summary: actionSummary("thought_converted", { title }, localeOf(user.language)),
      entity_type: "commitment",
      entity_id: cmtId,
      payload: { thought_id: id, title },
    });
    await observePlanningOutcome(db, user.id, {
      kind: "commitment_created",
      commitmentId: cmtId,
    });

    const commitment = await db
      .prepare(`SELECT * FROM commitments WHERE id = ?`)
      .get(cmtId);
    const thoughtOut = await db
      .prepare(`SELECT * FROM thoughts WHERE id = ?`)
      .get(id);
    return c.json(
      { commitment, thought: thoughtOut, already_exists: false },
      201
    );
  });

  listRoutes.get("/commitments", async (c) => {
    const user = await requireUser(c, db);
    const status = c.req.query("status");
    const requestedLimit = Number(c.req.query("limit") ?? "100");
    const page = await listCommitmentsPage(db, user.id, {
      status,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 100,
      cursor: c.req.query("cursor"),
    });
    return c.json(page);
  });

  listRoutes.post("/commitment-classifications/rebuild", async (c) => {
    const user = await requireUser(c, db);
    const result = await rebuildCommitmentClassifications(
      db,
      llm,
      user.id
    );
    return c.json(result);
  });

  listRoutes.patch("/commitments/:id/classification", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { group_key?: string };
    const groupKey = body.group_key?.trim();
    if (!groupKey) return c.json({ error: "group_key_required" }, 400);
    try {
      const classification = await overrideCommitmentClassification(
        db,
        user.id,
        id,
        groupKey
      );
      if (!classification) return c.json({ error: "not_found" }, 404);
      return c.json({ classification });
    } catch (error) {
      if (error instanceof Error && error.message === "unknown_work_group") {
        return c.json({ error: "unknown_work_group" }, 400);
      }
      throw error;
    }
  });

  /** Today: Now + Timeline + Risks + open unscheduled (Phase 1a) */
  listRoutes.get("/today", async (c) => {
    const user = await requireUser(c, db);
    const payload = await buildToday(
      db,
      user.id,
      user.timezone,
      new Date(),
      localeOf(user.language)
    );
    return c.json(payload);
  });

  listRoutes.post("/plan/today", async (c) => {
    const user = await requireUser(c, db);
    const body = (await c.req.json().catch(() => ({}))) as {
      plan_version?: string;
    };
    const result = await reconcileTodayPlan(
      db,
      user.id,
      user.timezone,
      {
        planVersion: body.plan_version?.trim() || `server:${nowIso()}`,
      }
    );
    return c.json(result);
  });

  listRoutes.post("/commitments/:id/complete", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const existing = (await db
      .prepare(`SELECT * FROM commitments WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!existing || existing.status === "cancelled") {
      return c.json({ error: "not_found" }, 404);
    }
    if (existing.status === "completed") {
      return c.json({ commitment: existing, already_completed: true });
    }
    const t = nowIso();
    const complete = await db.transaction(async () => {
      const result = await db
        .prepare(
          `UPDATE commitments SET status = 'completed', completed_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
        )
        .run(t, t, id, user.id);
      if (result.changes === 0) throw new Error("commitment_state_changed");
      await db
        .prepare(
          `UPDATE today_assignments SET status = 'completed'
           WHERE user_id = ? AND commitment_id = ? AND status = 'active'`
        )
        .run(user.id, id);
      await writeActionLog(db, {
        user_id: user.id,
        actor: "user",
        action_type: "user_completed",
        summary: actionSummary("user_completed", undefined, localeOf(user.language)),
        entity_type: "commitment",
        entity_id: id,
      });
      await observePlanningOutcome(db, user.id, {
        kind: "completed",
        commitmentId: id,
      });
      return await db.prepare(`SELECT * FROM commitments WHERE id = ?`).get(id);
    });
    const row = await complete();
    return c.json({ commitment: row });
  });

  listRoutes.post("/commitments/:id/arrange-today", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    try {
      const result = await recordUserTodayArrangement(
        db,
        user.id,
        user.timezone,
        id
      );
      await observePlanningOutcome(db, user.id, {
        kind: "scheduled_today",
        commitmentId: id,
      });
      const commitment = await db
        .prepare(`SELECT * FROM commitments WHERE id = ? AND user_id = ?`)
        .get(id, user.id);
      return c.json({ commitment, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 404);
    }
  });

  listRoutes.post("/commitments/:id/remove-from-today", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    try {
      const result = await removeFromToday(
        db,
        user.id,
        user.timezone,
        id
      );
      return c.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 404);
    }
  });

  listRoutes.post("/commitments/:id/cancel", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const existing = (await db
      .prepare(`SELECT * FROM commitments WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!existing || existing.status === "completed" || existing.status === "cancelled") {
      return c.json({ error: "not_found" }, 404);
    }
    const t = nowIso();
    const cancel = await db.transaction(async () => {
      const result = await db
        .prepare(
          `UPDATE commitments SET status = 'cancelled', updated_at = ?
           WHERE id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
        )
        .run(t, id, user.id);
      if (result.changes === 0) throw new Error("commitment_state_changed");
      await db
        .prepare(
          `UPDATE today_assignments
           SET status = 'removed', removed_at = ?
           WHERE user_id = ? AND commitment_id = ? AND status = 'active'`
        )
        .run(t, user.id, id);
      await writeActionLog(db, {
        user_id: user.id,
        actor: "user",
        action_type: "commitment_cancelled",
        summary: actionSummary("commitment_cancelled", undefined, localeOf(user.language)),
        entity_type: "commitment",
        entity_id: id,
      });
      return await db.prepare(`SELECT * FROM commitments WHERE id = ?`).get(id);
    });
    const row = await cancel();
    return c.json({ commitment: row });
  });

  /**
   * Dedupe open commitments:
   * - same source_thought_id → keep newest
   * - near-identical titles → keep newest / prefer with window
   */
  /**
   * Rewrite open commitment titles into executable "推进：…" form (P0).
   * Uses goal/full text when available; keeps original in goal if empty.
   */
  listRoutes.post("/commitments/rewrite-titles", async (c) => {
    const user = await requireUser(c, db);
    const open = (await db
      .prepare(
        `SELECT * FROM commitments WHERE user_id = ? AND status NOT IN ('completed','cancelled')`
      )
      .all(user.id)) as Array<Record<string, unknown>>;

    const t = nowIso();
    const updated: Array<{ id: string; from: string; to: string }> = [];

    for (const row of open) {
      const oldTitle = String(row.title ?? "");
      const source =
        String(row.goal ?? "").trim() ||
        oldTitle;
      const next = commitmentTitleFromThought(
        row.source_thought_id ? null : oldTitle,
        source
      );
      // Always rewrite if from thought or looks like musing / not already 推进
      const needs =
        Boolean(row.source_thought_id) ||
        /如果|呢$|但在|处理上$|可能需要/.test(oldTitle) ||
        !/^推进/.test(oldTitle);

      if (!needs || next === oldTitle) continue;

      const goal =
        String(row.goal ?? "").trim() ||
        (oldTitle !== next ? oldTitle : null);

      await db
        .prepare(
          `UPDATE commitments SET title = ?, goal = COALESCE(goal, ?), updated_at = ? WHERE id = ?`
        )
        .run(next, goal, t, row.id);

      updated.push({ id: row.id as string, from: oldTitle, to: next });
    }

    if (updated.length) {
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "commitment_titles_rewritten",
        summary: actionSummary("commitment_titles_rewritten", { count: updated.length }, localeOf(user.language)),
        payload: { updated, count: updated.length },
      });
    }

    return c.json({ ok: true, updated_count: updated.length, updated });
  });

  listRoutes.post("/commitments/dedupe", async (c) => {
    const user = await requireUser(c, db);
    const open = (await db
      .prepare(
        `SELECT * FROM commitments WHERE user_id = ? AND status NOT IN ('completed','cancelled') ORDER BY created_at DESC`
      )
      .all(user.id)) as Array<Record<string, unknown>>;

    const cancelled: string[] = [];
    const t = nowIso();

    // 1) per source_thought_id
    const byThought = new Map<string, Record<string, unknown>[]>();
    for (const row of open) {
      const st = row.source_thought_id as string | null;
      if (!st) continue;
      const list = byThought.get(st) ?? [];
      list.push(row);
      byThought.set(st, list);
    }
    for (const [, list] of byThought) {
      if (list.length <= 1) continue;
      // keep first (newest)
      for (const dup of list.slice(1)) {
        await db
          .prepare(
            `UPDATE commitments SET status = 'cancelled', updated_at = ? WHERE id = ?`
          )
          .run(t, dup.id);
        cancelled.push(dup.id as string);
      }
    }

    // 2) near-identical / near-duplicate titles among remaining open
    const stillOpen = (await db
      .prepare(
        `SELECT * FROM commitments WHERE user_id = ? AND status NOT IN ('completed','cancelled') ORDER BY created_at DESC`
      )
      .all(user.id)) as Array<Record<string, unknown>>;

    const seenKeys = new Map<string, Record<string, unknown>>();
    const keepers: Record<string, unknown>[] = [];
    for (const row of stillOpen) {
      if (cancelled.includes(row.id as string)) continue;
      const key = normalizeCommitmentKey(String(row.title ?? ""));
      const prevByKey = key.length >= 4 ? seenKeys.get(key) : undefined;
      const prevNear = keepers.find((k) =>
        commitmentsAreNearDuplicate(String(k.title ?? ""), String(row.title ?? ""))
      );
      const prev = prevByKey || prevNear;
      if (!prev) {
        if (key.length >= 4) seenKeys.set(key, row);
        keepers.push(row);
        continue;
      }
      // Prefer one with window/deadline / thought link / newer
      const rowScore =
        (row.window_start ? 2 : 0) +
        (row.deadline ? 2 : 0) +
        (row.source_thought_id ? 1 : 0) +
        (String(row.title).length < 40 ? 1 : 0);
      const prevScore =
        (prev.window_start ? 2 : 0) +
        (prev.deadline ? 2 : 0) +
        (prev.source_thought_id ? 1 : 0) +
        (String(prev.title).length < 40 ? 1 : 0);
      const drop = rowScore > prevScore ? prev : row;
      const keep = drop === prev ? row : prev;
      await db
        .prepare(
          `UPDATE commitments SET status = 'cancelled', updated_at = ? WHERE id = ?`
        )
        .run(t, drop.id);
      cancelled.push(drop.id as string);
      if (key.length >= 4) seenKeys.set(key, keep);
      const idx = keepers.indexOf(prev);
      if (idx >= 0) keepers[idx] = keep;
    }

    // 3) Mark thoughts converted when open commitment shares input or thought id
    const openNow = (await db
      .prepare(
        `SELECT source_thought_id, source_input_id FROM commitments
         WHERE user_id = ? AND status NOT IN ('completed','cancelled')`
      )
      .all(user.id)) as Array<{
      source_thought_id: string | null;
      source_input_id: string | null;
    }>;
    for (const o of openNow) {
      if (o.source_thought_id) {
        await db
          .prepare(
            `UPDATE thoughts SET status = 'converted', updated_at = ? WHERE id = ? AND user_id = ?`
          )
          .run(t, o.source_thought_id, user.id);
      }
      if (o.source_input_id) {
        await db
          .prepare(
            `UPDATE thoughts SET status = 'converted', updated_at = ?
             WHERE source_input_id = ? AND user_id = ? AND status != 'archived'`
          )
          .run(t, o.source_input_id, user.id);
      }
    }

    if (cancelled.length) {
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "commitments_deduped",
        summary: actionSummary("commitments_deduped", { count: cancelled.length }, localeOf(user.language)),
        payload: { cancelled_ids: cancelled, count: cancelled.length },
      });
    }

    return c.json({ ok: true, cancelled_count: cancelled.length, cancelled_ids: cancelled });
  });

  listRoutes.post("/commitments/:id/start", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const existing = (await db
      .prepare(`SELECT * FROM commitments WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!existing || existing.status === "completed" || existing.status === "cancelled") {
      return c.json({ error: "not_found" }, 404);
    }
    if (existing.started_at) {
      return c.json({ commitment: existing, already_started: true });
    }
    const t = nowIso();
    const result = await db
      .prepare(
        `UPDATE commitments SET started_at = ?, status = CASE WHEN status = 'captured' THEN 'planned' ELSE status END, updated_at = ?
         WHERE id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
      )
      .run(t, t, id, user.id);
    if (result.changes === 0) return c.json({ error: "not_found" }, 404);
    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "user_started",
      summary: actionSummary("user_started", undefined, localeOf(user.language)),
      entity_type: "commitment",
      entity_id: id,
    });
    await observePlanningOutcome(db, user.id, {
      kind: "started",
      commitmentId: id,
    });
    const row = await db.prepare(`SELECT * FROM commitments WHERE id = ?`).get(id);
    return c.json({ commitment: row });
  });

  listRoutes.get("/memories", async (c) => {
    const user = await requireUser(c, db);
    // `state` understands the derived lifecycle (a superseded memory is archived
    // plus a pointer to its replacement); `status` stays the raw column.
    const state = c.req.query("state");
    const status = c.req.query("status");

    let rows: Array<Record<string, unknown>>;
    if (state) {
      rows = await listMemoriesByState(db, user.id, state as MemoryListState, 100);
    } else if (status) {
      rows = (await db
        .prepare(
          `SELECT * FROM memories WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100`
        )
        .all(user.id, status)) as Array<Record<string, unknown>>;
    } else {
      rows = (await db
        .prepare(
          `SELECT * FROM memories WHERE user_id = ? AND status != 'archived' ORDER BY created_at DESC LIMIT 100`
        )
        .all(user.id)) as Array<Record<string, unknown>>;
    }

    const items = await Promise.all(
      rows.map(async (r) => {
        const concepts = await conceptsForMemory(db, r.id as string);
        const concept_names =
          concepts.length > 0
            ? concepts.map((x) => x.name)
            : suggestConceptNamesForMemory(String(r.type), String(r.content));
        return { ...r, state: memoryState(r), concepts, concept_names };
      })
    );
    return c.json({ items });
  });

  /** The version chain of a memory: what it replaced, and what replaced it. */
  listRoutes.get("/memories/:id/versions", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const versions = await listMemoryVersions(db, user.id, id);
    return c.json({
      versions: versions.map((row) => ({ ...row, state: memoryState(row) })),
    });
  });

  /** Work streams — a rebuildable projection over commitments. */
  listRoutes.get("/work-streams", async (c) => {
    const user = await requireUser(c, db);
    const limitPerGroup = Number(c.req.query("limit") ?? 3);
    const result = await listWorkStreams(db, user.id, {
      status: c.req.query("status") ?? undefined,
      limitPerGroup: Number.isFinite(limitPerGroup) ? limitPerGroup : 3,
      includeClosed: c.req.query("include_closed") === "true",
    });
    return c.json(result);
  });

  listRoutes.post("/memories/:id/confirm", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      concept_names?: string[];
      /** Id of a confirmed memory this one replaces (memory evolution). */
      supersedes?: string;
      reason?: string;
    };
    const result = await confirmMemory(db, user.id, id, body.concept_names, {
      supersedes: body.supersedes,
      reason: body.reason,
    });
    if (!result.ok) {
      return c.json(
        { error: result.error },
        result.error === "not_found" ? 404 : 400
      );
    }
    return c.json({ memory: result.memory });
  });

  listRoutes.post("/memories/:id/reject", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const result = await rejectMemory(db, user.id, id);
    if (!result.ok) return c.json({ error: "not_found_or_not_candidate" }, 404);
    return c.json({ success: true });
  });

  /**
   * Archive near-duplicate memories (same normalized key), keep one active preferred.
   */
  listRoutes.post("/memories/dedupe", async (c) => {
    const user = await requireUser(c, db);
    const rows = (await db
      .prepare(
        `SELECT id, type, content, status, created_at FROM memories
         WHERE user_id = ? AND status IN ('candidate', 'active')
         ORDER BY status ASC, created_at ASC`
      )
      .all(user.id)) as Array<{
      id: string;
      type: string;
      content: string;
      status: string;
      created_at: string;
    }>;

    // Prefer active over candidate; among same status keep oldest
    const rank = (s: string) => (s === "active" ? 0 : 1);
    const sorted = [...rows].sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      return a.created_at.localeCompare(b.created_at);
    });

    const keep = new Map<string, string>();
    const archived: string[] = [];
    const t = nowIso();
    for (const row of sorted) {
      const key = normalizeMemoryKey(row.type, row.content);
      if (!keep.has(key)) {
        keep.set(key, row.id);
        continue;
      }
      await db
        .prepare(
          `UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?`
        )
        .run(t, row.id);
      archived.push(row.id);
    }

    if (archived.length) {
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "memories_deduped",
        summary: actionSummary("memories_deduped", { count: archived.length }, localeOf(user.language)),
        payload: { archived_ids: archived, count: archived.length },
      });
    }
    return c.json({ ok: true, archived_count: archived.length, archived_ids: archived });
  });

  listRoutes.get("/concepts", async (c) => {
    const user = await requireUser(c, db);
    const items = await listConcepts(db, user.id);
    return c.json({ items });
  });

  listRoutes.post("/concepts", async (c) => {
    const user = await requireUser(c, db);
    const body = (await c.req.json()) as { name?: string; description?: string };
    if (!body.name?.trim()) return c.json({ error: "name_required" }, 400);
    const cpt = await getOrCreateConcept(
      db,
      user.id,
      body.name.trim(),
      body.description
    );
    return c.json({ concept: cpt }, cpt.created ? 201 : 200);
  });

  listRoutes.get("/concepts/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const concept = await db
      .prepare(`SELECT * FROM concepts WHERE id = ? AND user_id = ?`)
      .get(id, user.id);
    if (!concept) return c.json({ error: "not_found" }, 404);
    const memories = await db
      .prepare(
        `SELECT m.* FROM memories m
         INNER JOIN memory_concepts mc ON mc.memory_id = m.id
         WHERE mc.concept_id = ? AND m.user_id = ?
         ORDER BY m.updated_at DESC LIMIT 50`
      )
      .all(id, user.id);
    return c.json({ concept, memories });
  });

  listRoutes.get("/activity", async (c) => {
    const user = await requireUser(c, db);
    const items = await listActionLogs(db, user.id, 100);
    return c.json({ items });
  });

  listRoutes.get("/projects", async (c) => {
    const user = await requireUser(c, db);
    const includeArchived = c.req.query("include_archived") === "1";
    const rows = (await db
      .prepare(
        includeArchived
          ? `SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC`
          : `SELECT * FROM projects WHERE user_id = ? AND IFNULL(status,'active') != 'archived' ORDER BY created_at DESC`
      )
      .all(user.id)) as Array<Record<string, unknown>>;

    const items = await Promise.all(
      rows.map(async (p) => {
        const id = p.id as string;
        const thoughts = (
          (await db
            .prepare(
              `SELECT COUNT(*) as c FROM thoughts WHERE user_id = ? AND project_id = ?`
            )
            .get(user.id, id)) as { c: number }
        ).c;
        const commitments = (
          (await db
            .prepare(
              `SELECT COUNT(*) as c FROM commitments WHERE user_id = ? AND project_id = ?`
            )
            .get(user.id, id)) as { c: number }
        ).c;
        return { ...p, thought_count: thoughts, commitment_count: commitments };
      })
    );
    return c.json({ items });
  });

  listRoutes.get("/projects/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const project = await db
      .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
      .get(id, user.id);
    if (!project) return c.json({ error: "not_found" }, 404);
    const thoughts = await db
      .prepare(
        `SELECT * FROM thoughts WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(user.id, id);
    const commitments = await db
      .prepare(
        `SELECT * FROM commitments WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(user.id, id);
    return c.json({ project, thoughts, commitments });
  });

  listRoutes.post("/projects", async (c) => {
    const user = await requireUser(c, db);
    const body = (await c.req.json()) as {
      name?: string;
      description?: string;
      brief?: string;
      aliases?: string[] | string;
    };
    if (!body.name?.trim()) return c.json({ error: "name_required" }, 400);
    const id = newId("proj");
    const t = nowIso();
    let aliases: string | null = null;
    if (Array.isArray(body.aliases)) {
      aliases = JSON.stringify(body.aliases.map(String));
    } else if (typeof body.aliases === "string" && body.aliases.trim()) {
      aliases = body.aliases.trim();
    }
    const brief = body.brief?.trim() || null;
    await db
      .prepare(
        `INSERT INTO projects (id, user_id, name, description, brief, aliases, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        id,
        user.id,
        body.name.trim(),
        body.description ?? null,
        brief,
        aliases,
        t,
        t
      );
    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "project_created",
      summary: actionSummary("project_created", { name: body.name.trim() }, localeOf(user.language)),
      entity_type: "project",
      entity_id: id,
    });
    const row = await db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    return c.json({ project: row }, 201);
  });

  /** Attach recent unscoped objects mentioning this project name (best-effort backfill). */
  listRoutes.post("/projects/:id/relink", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const project = (await db
      .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!project) return c.json({ error: "not_found" }, 404);

    const thoughts = (await db
      .prepare(
        `SELECT id, content FROM thoughts WHERE user_id = ? AND (project_id IS NULL OR project_id = '') LIMIT 200`
      )
      .all(user.id)) as Array<{ id: string; content: string }>;
    const commitments = (await db
      .prepare(
        `SELECT id, title, goal FROM commitments WHERE user_id = ? AND (project_id IS NULL OR project_id = '') LIMIT 200`
      )
      .all(user.id)) as Array<{ id: string; title: string; goal: string | null }>;

    let linkedThoughts = 0;
    let linkedCommitments = 0;
    const projRow = {
      id: project.id as string,
      name: project.name as string,
      description: project.description as string | null,
      aliases: project.aliases as string | null,
      status: project.status as string,
    };

    for (const th of thoughts) {
      const m = matchProjectFromContent(th.content, [projRow], 70);
      if (m.kind === "matched" && m.project_id === id) {
        await db
          .prepare(`UPDATE thoughts SET project_id = ?, updated_at = ? WHERE id = ?`)
          .run(id, nowIso(), th.id);
        linkedThoughts++;
      }
    }
    for (const cm of commitments) {
      const text = `${cm.title} ${cm.goal ?? ""}`;
      const m = matchProjectFromContent(text, [projRow], 70);
      if (m.kind === "matched" && m.project_id === id) {
        await db
          .prepare(
            `UPDATE commitments SET project_id = ?, updated_at = ? WHERE id = ?`
          )
          .run(id, nowIso(), cm.id);
        linkedCommitments++;
      }
    }

    return c.json({ ok: true, linked_thoughts: linkedThoughts, linked_commitments: linkedCommitments });
  });

  listRoutes.get("/clarifications", async (c) => {
    const user = await requireUser(c, db);
    const status = c.req.query("status") ?? "pending";
    const rows = (await db
      .prepare(
        `SELECT * FROM clarifications WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 20`
      )
      .all(user.id, status)) as Record<string, unknown>[];

    const items = rows.map((row) => {
      const options = JSON.parse(row.options_json as string) as Array<{
        id: string;
        label: string;
      }>;
      return {
        id: row.id,
        kind: row.kind,
        token: row.token,
        prompt: row.prompt,
        commitment_id: row.commitment_id,
        status: row.status,
        options: options.map((o) => ({ id: o.id, label: o.label })),
        created_at: row.created_at,
      };
    });
    return c.json({ items });
  });

  /**
   * Resolve early-morning 明天/后天 ambiguity (and similar clarifications).
   * Body: { "option_id": "today_daytime" | "next_calendar_day" | ... }
   */
  listRoutes.post("/clarifications/:id/resolve", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json()) as { option_id?: string };
    if (!body.option_id) return c.json({ error: "option_id_required" }, 400);

    try {
      const result = await resolveClarificationByOption(
        db,
        user.id,
        id,
        body.option_id
      );
      return c.json(result);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status: number }).status)
          : 500;
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, status as 400 | 404 | 500);
    }
  });


  // ─── Edit / Delete (user-facing CRUD) ───────────────────────────────────────

  listRoutes.patch("/thoughts/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      content?: string;
      status?: string;
    };
    const row = (await db
      .prepare(`SELECT * FROM thoughts WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);

    const title =
      body.title !== undefined ? (body.title.trim() || null) : (row.title as string | null);
    const content =
      body.content !== undefined ? body.content.trim() : String(row.content ?? "");
    if (!content) return c.json({ error: "content_required" }, 400);

    let status = String(row.status ?? "captured");
    if (body.status) {
      const allowed = new Set(["captured", "exploring", "converted", "archived"]);
      if (!allowed.has(body.status)) return c.json({ error: "invalid_status" }, 400);
      status = body.status;
    }

    const t = nowIso();
    await db
      .prepare(
        `UPDATE thoughts SET title = ?, content = ?, status = ?, updated_at = ? WHERE id = ?`
      )
      .run(title, content, status, t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "thought_updated",
      summary: actionSummary("thought_updated", undefined, localeOf(user.language)),
      entity_type: "thought",
      entity_id: id,
    });

    const out = await db.prepare(`SELECT * FROM thoughts WHERE id = ?`).get(id);
    return c.json({ thought: out });
  });

  listRoutes.delete("/thoughts/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const row = await db
      .prepare(`SELECT * FROM thoughts WHERE id = ? AND user_id = ?`)
      .get(id, user.id);
    if (!row) return c.json({ error: "not_found" }, 404);

    // Soft-delete: archive (reversible, keeps history)
    const t = nowIso();
    await db
      .prepare(
        `UPDATE thoughts SET status = 'archived', updated_at = ? WHERE id = ?`
      )
      .run(t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "thought_deleted",
      summary: actionSummary("thought_deleted", undefined, localeOf(user.language)),
      entity_type: "thought",
      entity_id: id,
      reversible: true,
    });
    return c.json({ ok: true });
  });

  listRoutes.patch("/commitments/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      optimized_content?: string | null;
      goal?: string | null;
      deadline?: string | null;
      window_start?: string | null;
      window_end?: string | null;
    };
    const row = (await db
      .prepare(`SELECT * FROM commitments WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);

    const title =
      body.title !== undefined ? body.title.trim() : String(row.title ?? "");
    if (!title) return c.json({ error: "title_required" }, 400);

    const goal =
      body.goal !== undefined
        ? body.goal?.trim() || null
        : (row.goal as string | null);
    const optimizedContent =
      body.optimized_content !== undefined
        ? body.optimized_content?.trim() || null
        : (row.optimized_content as string | null);
    const deadline =
      body.deadline !== undefined ? body.deadline : (row.deadline as string | null);
    const window_start =
      body.window_start !== undefined
        ? body.window_start
        : (row.window_start as string | null);
    const window_end =
      body.window_end !== undefined
        ? body.window_end
        : (row.window_end as string | null);

    const t = nowIso();
    await db
      .prepare(
        `UPDATE commitments
         SET title = ?, goal = ?, optimized_content = ?, deadline = ?, window_start = ?, window_end = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, goal, optimizedContent, deadline, window_start, window_end, t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "commitment_updated",
      summary: actionSummary("commitment_updated", undefined, localeOf(user.language)),
      entity_type: "commitment",
      entity_id: id,
    });

    const out = await db.prepare(`SELECT * FROM commitments WHERE id = ?`).get(id);
    return c.json({ commitment: out });
  });

  listRoutes.delete("/commitments/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const row = (await db
      .prepare(`SELECT * FROM commitments WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);

    const t = nowIso();
    // Soft-delete via cancelled (status machine); already terminal states stay
    const status = String(row.status ?? "");
    if (status === "completed") {
      // hard-hide completed by cancelling is wrong — keep completed, mark via update only
      // For user "delete" of completed: leave as completed and return ok after no-op? Better cancel archive pattern
    }
    await db
      .prepare(
        `UPDATE commitments SET status = 'cancelled', updated_at = ? WHERE id = ?`
      )
      .run(t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "commitment_deleted",
      summary: actionSummary("commitment_deleted", undefined, localeOf(user.language)),
      entity_type: "commitment",
      entity_id: id,
      reversible: true,
    });
    return c.json({ ok: true });
  });

  listRoutes.patch("/memories/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      content?: string;
      type?: string;
    };
    const row = (await db
      .prepare(`SELECT * FROM memories WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.status) === "archived") {
      return c.json({ error: "already_archived" }, 400);
    }

    const content =
      body.content !== undefined ? body.content.trim() : String(row.content ?? "");
    if (!content) return c.json({ error: "content_required" }, 400);

    let type = String(row.type);
    if (body.type) {
      const allowed = new Set([
        "preference",
        "principle",
        "project_context",
        "decision",
        "experience",
      ]);
      if (!allowed.has(body.type)) return c.json({ error: "invalid_type" }, 400);
      type = body.type;
    }

    const t = nowIso();
    await db
      .prepare(
        `UPDATE memories SET content = ?, type = ?, updated_at = ? WHERE id = ?`
      )
      .run(content, type, t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "memory_updated",
      summary: actionSummary("memory_updated", undefined, localeOf(user.language)),
      entity_type: "memory",
      entity_id: id,
    });

    const out = (await db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id)) as
      | Record<string, unknown>
      | undefined;
    return c.json({
      memory: { ...(out ?? {}), concepts: await conceptsForMemory(db, id) },
    });
  });

  listRoutes.delete("/memories/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const row = await db
      .prepare(`SELECT * FROM memories WHERE id = ? AND user_id = ?`)
      .get(id, user.id);
    if (!row) return c.json({ error: "not_found" }, 404);

    const t = nowIso();
    await db
      .prepare(
        `UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?`
      )
      .run(t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "memory_deleted",
      summary: actionSummary("memory_deleted", undefined, localeOf(user.language)),
      entity_type: "memory",
      entity_id: id,
      reversible: true,
    });
    return c.json({ ok: true });
  });

  listRoutes.patch("/projects/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      description?: string | null;
      brief?: string | null;
      aliases?: string[] | string | null;
    };
    const row = (await db
      .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);

    const name =
      body.name !== undefined ? body.name.trim() : String(row.name ?? "");
    if (!name) return c.json({ error: "name_required" }, 400);

    const description =
      body.description !== undefined
        ? body.description?.trim() || null
        : (row.description as string | null);

    const brief =
      body.brief !== undefined
        ? body.brief?.trim() || null
        : (row.brief as string | null);

    let aliases: string | null = row.aliases as string | null;
    if (body.aliases !== undefined) {
      if (body.aliases === null || body.aliases === "") {
        aliases = null;
      } else if (Array.isArray(body.aliases)) {
        aliases = JSON.stringify(body.aliases.map(String).filter(Boolean));
      } else {
        aliases = String(body.aliases).trim() || null;
      }
    }

    const t = nowIso();
    await db
      .prepare(
        `UPDATE projects SET name = ?, description = ?, brief = ?, aliases = ?, updated_at = ? WHERE id = ?`
      )
      .run(name, description, brief, aliases, t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "project_updated",
      summary: actionSummary("project_updated", { name }, localeOf(user.language)),
      entity_type: "project",
      entity_id: id,
      payload: { name },
    });

    const out = await db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    return c.json({ project: out });
  });

  listRoutes.delete("/projects/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const row = (await db
      .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);

    const name = String(row.name ?? "");
    const t = nowIso();
    // Soft-delete project; detach is not required — objects keep project_id
    await db
      .prepare(
        `UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`
      )
      .run(t, id);

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "project_deleted",
      summary: actionSummary("project_deleted", { name }, localeOf(user.language)),
      entity_type: "project",
      entity_id: id,
      payload: { name },
      reversible: true,
    });
    return c.json({ ok: true });
  });

  return listRoutes;
}
