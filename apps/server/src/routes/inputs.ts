import { Hono } from "hono";
import { z } from "zod";
import {
  actionSummary,
  claimEnrichment,
  getLatestPendingClarification,
  getLocalParts,
  isRealLLMProvider,
  localeOf,
  looksLikeShortClarificationReply,
  matchClarificationReply,
  newId,
  nowIso,
  observePlanningOutcome,
  processRawInput,
  recordEnrichmentFailure,
  recordUserTodayArrangement,
  resolveClarificationByOption,
  type SqlDatabase,
  writeActionLog,
} from "@aldus-palace/core";
import type { AppVariables } from "../middleware/auth.js";
import { requireUser } from "../middleware/auth.js";
import type { AppDeps } from "../context.js";

const createSchema = z.object({
  content: z.string().min(1),
  source: z
    .enum(["text", "voice", "shortcut", "menu_bar", "widget", "system_event"])
    .default("text"),
  client_context: z.record(z.unknown()).optional(),
  process: z.boolean().default(true),
  /**
   * progressive (default): local rules first → client calls /enrich for AI
   * sync: full AI in one request (eval / non-UI clients)
   * local: only local rules, no AI
   */
  mode: z.enum(["progressive", "sync", "local"]).default("progressive"),
});

async function observeCreatedCommitments(
  db: SqlDatabase,
  userId: string,
  timezone: string,
  actionCard: { commitments: Array<Record<string, unknown>> }
): Promise<void> {
  for (const commitment of actionCard.commitments) {
    if (typeof commitment.id !== "string") continue;
    const row = (await db
      .prepare(
        `SELECT window_start, window_end, deadline
         FROM commitments WHERE id = ? AND user_id = ?`
      )
      .get(commitment.id, userId)) as
      | {
          window_start: string | null;
          window_end: string | null;
          deadline: string | null;
        }
      | undefined;
    if (row && isExplicitlyForToday(row, timezone, new Date())) {
      await recordUserTodayArrangement(db, userId, timezone, commitment.id);
    }
    const outcome = await observePlanningOutcome(db, userId, {
      kind: "commitment_created",
      commitmentId: commitment.id,
    });
    if (outcome) break;
  }
}

function isExplicitlyForToday(
  row: {
    window_start: string | null;
    window_end: string | null;
    deadline: string | null;
  },
  timezone: string,
  at: Date
): boolean {
  const todayKey = getLocalParts(timezone, at).dateKey;
  const isToday = (value: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    return (
      Number.isFinite(date.getTime()) &&
      getLocalParts(timezone, date).dateKey === todayKey
    );
  };
  return (
    isToday(row.deadline) ||
    (isToday(row.window_start) && isToday(row.window_end))
  );
}

export function createInputsRoutes(deps: AppDeps): Hono<{
  Variables: AppVariables;
}> {
  const { db, llm } = deps;
  const inputsRoutes = new Hono<{ Variables: AppVariables }>();

  inputsRoutes.post("/", async (c) => {
    const user = await requireUser(c, db);
    const body = createSchema.parse(await c.req.json());
    const id = newId("inp");
    const t = nowIso();

    // If user answers a pending time clarification in plain language ("今天"),
    // resolve it instead of treating as a brand-new capture.
    const pending = await getLatestPendingClarification(db, user.id);
    if (pending && looksLikeShortClarificationReply(body.content)) {
      const options = JSON.parse(pending.options_json as string) as Array<{
        id: string;
        label: string;
        window_start: string;
        window_end: string;
      }>;
      const optionId = matchClarificationReply(
        body.content,
        options,
        (pending.token as string) ?? null
      );
      if (optionId) {
        await db
          .prepare(
            `INSERT INTO raw_inputs
             (id, user_id, content, source, client_context, processing_status, processed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'processed', ?, ?, ?)`
          )
          .run(
            id,
            user.id,
            body.content,
            body.source,
            JSON.stringify({
              kind: "clarification_reply",
              clarification_id: pending.id,
              ...(body.client_context ?? {}),
            }),
            t,
            t,
            t
          );

        await writeActionLog(db, {
          user_id: user.id,
          actor: "user",
          action_type: "input_captured",
          summary: actionSummary("input_captured", { kind: "clarification_reply" }, localeOf(user.language)),
          entity_type: "raw_input",
          entity_id: id,
          payload: { kind: "clarification_reply" },
        });

        try {
          const result = await resolveClarificationByOption(
            db,
            user.id,
            pending.id as string,
            optionId
          );
          return c.json({
            id,
            processing_status: "processed",
            stage: "enriched",
            enriching: false,
            resolved_clarification: true,
            action_card: {
              summary: `已确认：${result.chosen.label}`,
              thoughts: [],
              commitments: result.commitment ? [result.commitment] : [],
              decisions: [],
              memory_candidates: [],
              clarifications: [],
              project_match: null,
              project_suggestion: null,
              warnings: [],
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return c.json({ id, processing_status: "failed", error: message }, 400);
        }
      }
    }

    await db
      .prepare(
        `INSERT INTO raw_inputs
         (id, user_id, content, source, client_context, processing_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(
        id,
        user.id,
        body.content,
        body.source,
        body.client_context ? JSON.stringify(body.client_context) : null,
        t,
        t
      );

    await writeActionLog(db, {
      user_id: user.id,
      actor: "user",
      action_type: "input_captured",
      summary: actionSummary("input_captured", undefined, localeOf(user.language)),
      entity_type: "raw_input",
      entity_id: id,
    });

    if (!body.process) {
      return c.json({
        id,
        processing_status: "pending",
        stage: "raw",
        enriching: false,
        action_card: null,
      });
    }

    // Progressive: instant local card; client calls POST /:id/enrich for AI.
    // If no real LLM, local is final (no enrich needed).
    const canEnrich = body.mode === "progressive" && isRealLLMProvider(llm);
    const wantSyncFull = body.mode === "sync" && isRealLLMProvider(llm);

    try {
      if (wantSyncFull) {
        const action_card = await processRawInput(db, llm, user, id, "full");
        await observeCreatedCommitments(db, user.id, user.timezone, action_card);
        return c.json({
          id,
          processing_status: "processed",
          stage: "enriched",
          enriching: false,
          action_card,
        });
      }

      // Local first (progressive or local mode, or no real LLM)
      const action_card = await processRawInput(db, llm, user, id, "local");
      await observeCreatedCommitments(db, user.id, user.timezone, action_card);

      // Server-side auto-enrich so AI still runs even if client forgets / is stale.
      // Client may also call POST /:id/enrich; second call is safe (replaces again).
      if (canEnrich) {
        const inputId = id;
        const userId = user.id;
        const generationId = await claimEnrichment(db, inputId, userId);
        if (!generationId) throw new Error("enrichment_claim_failed");
        const enrichInBackground = async () => {
          try {
            const actionCard = await processRawInput(
              db,
              llm,
              user,
              inputId,
              "full",
              generationId
            );
            await observeCreatedCommitments(db, userId, user.timezone, actionCard);
          } catch (e) {
            console.error("[enrich] background failed", inputId, e);
            await recordEnrichmentFailure(
              db,
              inputId,
              generationId,
              e instanceof Error ? e.message : String(e)
            );
          }
        };
        let executionContext:
          | { waitUntil(promise: Promise<unknown>): void }
          | undefined;
        try {
          executionContext = c.executionCtx;
        } catch {
          // The Node adapter has no Workers execution context.
        }
        if (executionContext) {
          executionContext.waitUntil(enrichInBackground());
        } else {
          setImmediate(() => void enrichInBackground());
        }
      }

      return c.json({
        id,
        processing_status: canEnrich ? "local" : "processed",
        stage: canEnrich ? "local" : "enriched",
        enriching: canEnrich,
        action_card,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json(
        {
          id,
          processing_status: "failed",
          stage: "failed",
          enriching: false,
          error: message,
          action_card: null,
        },
        502
      );
    }
  });

  /**
   * AI enrich: replace local derivatives with full LLM understanding.
   * Client calls after showing local action_card.
   */
  inputsRoutes.post("/:id/enrich", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const raw = await db
      .prepare(`SELECT * FROM raw_inputs WHERE id = ? AND user_id = ?`)
      .get(id, user.id);
    if (!raw) return c.json({ error: "not_found" }, 404);

    if (!isRealLLMProvider(llm)) {
      // Already local-only world — re-run local as final
      try {
        const action_card = await processRawInput(db, llm, user, id, "local");
        await observeCreatedCommitments(db, user.id, user.timezone, action_card);
        return c.json({
          id,
          processing_status: "processed",
          stage: "enriched",
          enriching: false,
          action_card,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ id, processing_status: "failed", error: message }, 502);
      }
    }

    const generationId = await claimEnrichment(db, id, user.id);
    if (!generationId) {
      return c.json(
        {
          id,
          processing_status: "enriching",
          stage: "local",
          enriching: true,
          action_card: null,
        },
        202
      );
    }

    try {
      const action_card = await processRawInput(
        db,
        llm,
        user,
        id,
        "full",
        generationId
      );
      await observeCreatedCommitments(db, user.id, user.timezone, action_card);
      return c.json({
        id,
        processing_status: "processed",
        stage: "enriched",
        enriching: false,
        action_card,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Keep local results if AI fails — don't leave empty
      await recordEnrichmentFailure(db, id, generationId, message);
      return c.json(
        {
          id,
          processing_status: "local",
          stage: "local",
          enriching: false,
          error: message,
          enrich_failed: true,
        },
        502
      );
    }
  });

  inputsRoutes.post("/:id/process", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const raw = await db
      .prepare(`SELECT * FROM raw_inputs WHERE id = ? AND user_id = ?`)
      .get(id, user.id);
    if (!raw) return c.json({ error: "not_found" }, 404);

    const generationId = await claimEnrichment(db, id, user.id);
    if (!generationId) {
      return c.json(
        { id, processing_status: "enriching", enriching: true },
        202
      );
    }

    try {
      const action_card = await processRawInput(
        db,
        llm,
        user,
        id,
        "full",
        generationId
      );
      await observeCreatedCommitments(db, user.id, user.timezone, action_card);
      return c.json({
        id,
        processing_status: "processed",
        stage: "enriched",
        enriching: false,
        action_card,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordEnrichmentFailure(db, id, generationId, message);
      return c.json({ id, processing_status: "failed", error: message }, 502);
    }
  });

  inputsRoutes.get("/:id", async (c) => {
    const user = await requireUser(c, db);
    const id = c.req.param("id");
    const raw = (await db
      .prepare(`SELECT * FROM raw_inputs WHERE id = ? AND user_id = ?`)
      .get(id, user.id)) as Record<string, unknown> | undefined;
    if (!raw) return c.json({ error: "not_found" }, 404);

    const thoughts = await db
      .prepare(`SELECT * FROM thoughts WHERE source_input_id = ?`)
      .all(id);
    const commitments = await db
      .prepare(`SELECT * FROM commitments WHERE source_input_id = ?`)
      .all(id);
    const decisions = await db
      .prepare(`SELECT * FROM decisions WHERE source_input_id = ?`)
      .all(id);
    const memories = await db
      .prepare(`SELECT * FROM memories WHERE source_input_id = ?`)
      .all(id);

    return c.json({ raw_input: raw, thoughts, commitments, decisions, memories });
  });

  return inputsRoutes;
}
