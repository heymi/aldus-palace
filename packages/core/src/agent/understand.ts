import type { SqlDatabase } from "../db/port.js";
import { z } from "zod";
import { nowIso } from "../db/port.js";
import {
  MEMORY_TYPES,
  THOUGHT_TYPES,
  type ActionCard,
  type MemoryType,
  type ThoughtType,
  type User,
} from "../domain/types.js";
import { newId } from "../lib/id.js";
import { writeActionLog } from "../repos/actionLogs.js";
import { actionSummary } from "../lib/actionMessages.js";
import type { LLMProvider } from "../providers/types.js";
import {
  applySimpleRelativePhrases,
  resolveRelativeDay,
} from "../lib/relativeDay.js";

/** Words that point at the future, used to reject a hallucinated past date. */
const FUTURE_DATE_MARKER =
  /下周|下个月|明天|后天|周[一二三四五六日]|这周|next (week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today/i;

/**
 * The text a past-date check looks at.
 *
 * A future word governs the clause it sits in, not every clause of the input:
 * "Archive last week; report next week" must not turn a real past date into a
 * dropped one. The commitment's own text is the first scope; for a single-clause
 * input the whole sentence is.
 */
function dateSuppressionScope(
  content: string,
  commitment: { title?: string | null; optimized_content?: string | null; goal?: string | null }
): string {
  const own = [commitment.title, commitment.optimized_content, commitment.goal]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  if (FUTURE_DATE_MARKER.test(own)) return own;
  const clauses = content.split(/[，,。；;！？!?\n]+/).filter((part) => part.trim());
  return clauses.length <= 1 ? content : own || content;
}

/**
 * Normalise a date a model returned.
 *
 * The model sometimes returns free text ("next week", "Friday") or a date in
 * the past for a phrase that points at the future. Parse what parses, re-resolve
 * free text with the server rules, and drop a past date when the words point at
 * the future so the caller resolves it instead. A date-only value is read as a
 * local day, not UTC midnight, so it does not shift a day for the user. A window
 * phrase resolves to the field it fills: its end for a deadline, its start for a
 * window start.
 */
function normalizeModelDate(
  value: string | null | undefined,
  timezone: string,
  scope: string,
  at: Date,
  field: "deadline" | "window_start" | "window_end" = "window_start"
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  const ms = dateOnly
    ? Date.parse(zonedLocalToIso(`${dateOnly[1]}T00:00:00`, timezone))
    : Date.parse(trimmed);
  if (Number.isFinite(ms)) {
    if (ms < at.getTime() - 24 * 3600 * 1000 && FUTURE_DATE_MARKER.test(scope)) {
      return null;
    }
    return new Date(ms).toISOString();
  }
  const simple = applySimpleRelativePhrases(trimmed, timezone, at);
  if (simple) {
    // A deadline sits at the end of the resolved window; a window start at its
    // beginning, so "next week" does not make a deadline the first day.
    const preferred =
      field === "window_start"
        ? (simple.window_start ?? simple.deadline ?? simple.window_end)
        : (simple.deadline ?? simple.window_end ?? simple.window_start);
    if (preferred) return preferred;
  }
  const relative = resolveRelativeDay(trimmed, timezone, at);
  if (relative.status === "resolved") {
    return field === "window_start" ? relative.window_start : relative.window_end;
  }
  return null;
}
import type { ClarificationDTO } from "../domain/types.js";
import {
  makeThoughtTitle,
  makeThoughtSummary,
  preferModelSummary,
  isLowValueSummary,
  isMisgroundedTransfer,
  makeProductGroundedTransfer,
  commitmentsAreNearDuplicate,
} from "../lib/thoughtTitle.js";
import { missingCommitmentTitles } from "../lib/actionableWork.js";
import { decideInputObjectMode } from "../lib/inputObjectMode.js";
import { matchClassificationSignal } from "../lib/classificationSignals.js";
import {
  objectModeOptions,
  objectModeQuestion,
  shouldAskObjectMode,
} from "../lib/objectAmbiguity.js";
import { commitmentTitleFor } from "../services/reclassify.js";
import {
  matchProjectFromContent,
  suggestNewProjectName,
  type ProjectRow,
} from "../lib/projectMatch.js";
import {
  extractMemoryCandidates,
  filterMemoryCandidatesForConfirm,
  isSimilarMemory,
  normalizeMemoryKey,
} from "../lib/memoryExtract.js";
import {
  decideMemoryActivation,
  memoryImportanceFor,
  type MemoryActivation,
} from "../lib/memoryActivation.js";
import {
  detectMemoryConflict,
  makeModelJudge,
  type MemoryConflict,
} from "../services/memoryEvolution.js";
import { indexMemory, removeMemoryFromIndex } from "../lib/retriever.js";
import { zonedLocalToIso } from "../lib/time.js";
import { isRealLLMProvider } from "../providers/index.js";
import { pick, plural, localeOf, type Locale } from "../lib/locale.js";
import {
  boostProjectMemories,
  formatMemoryContextBlock,
  formatProjectsContextBlock,
  retrieveActiveMemoriesForContext,
  suggestConceptNamesForMemory,
} from "../lib/concepts.js";

/** LLM often returns "0.8" / "1" instead of numbers — never fail the whole capture. */
const optionalNum = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}, z.number().optional());

const ExtractionSchema = z.object({
  object_mode: z.enum(["thought", "commitment", "mixed"]).nullish(),
  thoughts: z
    .array(
      z.object({
        type: z.string(),
        title: z.string().nullish(),
        content: z.string(),
        original_excerpt: z.string().nullish(),
        status: z.string().nullish(),
        importance: optionalNum,
        project_name: z.string().nullish(),
      })
    )
    .default([]),
  commitments: z
    .array(
      z.object({
        title: z.string(),
        optimized_content: z.string().nullish(),
        goal: z.string().nullish(),
        status: z.string().nullish(),
        deadline: z.string().nullish(),
        window_start: z.string().nullish(),
        window_end: z.string().nullish(),
        duration_minutes: optionalNum,
        importance: optionalNum,
        project_name: z.string().nullish(),
      })
    )
    .default([]),
  decisions: z
    .array(
      z.object({
        title: z.string(),
        reason: z.string().nullish(),
        project_name: z.string().nullish(),
      })
    )
    .default([]),
  memory_candidates: z
    .array(
      z.object({
        type: z.string(),
        content: z.string(),
        source: z.string().nullish(),
        confidence: optionalNum,
        evidence: z.string().nullish(),
        project_name: z.string().nullish(),
      })
    )
    .default([]),
  /**
   * Language-agnostic work intent. Server uses this to ensure commitments
   * even when the model only filled thoughts.
   */
  intent: z
    .object({
      has_actionable_work: z.boolean().nullish(),
      work_titles: z.array(z.string()).nullish(),
    })
    .nullish(),
  warnings: z.array(z.string()).nullish().transform((v) => v ?? []),
});

const SYSTEM_PROMPT = `You are the Understanding Agent for Aldus Palace (a personal cognitive OS).

Effect-first: maximize clarity for the user. Cost is secondary.
Language-agnostic: input may be zh / en / ja / mixed — classify by MEANING, not by matching Chinese keywords.

Reply with JSON only:
{
  "object_mode": "thought"|"commitment"|"mixed",
  "intent": {
    "has_actionable_work": true|false,
    "work_titles": ["short executable titles in the USER's language"]
  },
  "thoughts": [{ "type", "title?", "content", "original_excerpt?", "importance?", "project_name?" }],
  "commitments": [{ "title", "optimized_content", "goal?", "status?", "deadline?", "window_start?", "window_end?", "duration_minutes?", "importance?", "project_name?" }],
  "decisions": [{ "title", "reason?", "project_name?" }],
  "memory_candidates": [{ "type", "content", "source?", "confidence?", "evidence?", "project_name?" }],
  "warnings": []
}

Numeric fields (importance, confidence, duration_minutes) MUST be JSON numbers (0.8), never strings ("0.8").

## CRITICAL: Transfer learning / external case-study → user's own project
When the user pastes an EXTERNAL case (a third-party product, teardown, or article) and relates it to one of THEIR registered projects:

1. Separate clearly:
   - Thought A: the MECHANISM of the external case (what actually worked, abstracted)
   - Thought B: the adaptation for the NAMED own project — grounded in that project's domain

2. NEVER copy the case-study product's customer segments onto the target project.
   BAD: personas lifted verbatim from the case (e.g. tax filing / passport photos / students) landing on an unrelated product.
   GOOD: segments derived from the target project's own description + aliases plus the
   common jobs-to-be-done of its category.
   Use ONLY segments that make sense for THAT product category.

3. MUST use the "User's products / projects" block:
   - name + description + aliases define what the product IS
   - value props must fit that domain, never an unrelated vertical
   - if the block is empty, do not invent a category

4. If the project description is thin, still stay in-category:
   - reason from the category implied by name/aliases (native app, CLI, service…)
   - inventing unrelated verticals is worse than saying "需补充项目背景"

5. In 对我/产品的启发, structure as:
   机制迁移：…（抽象层，可跨产品）
   目标产品是什么：…（from projects context）
   可能受众（按目标产品）：…（domain-native）
   每类强调什么：…（domain-native jobs/pains）
   不确定/待验证：…

## thoughts.content = 「系统理解」
- User language (Chinese if input Chinese)
- NEVER dump full raw paste
- NEVER only copy first sentence + last sentence (e.g. "我喜欢这个技巧" + marketing punchline)
- For numbered/bulleted tips: abstract the MECHANISM, compress steps, then product application if transfer
- Prefer structure: 要点(机制) / 步骤 / 对目标产品的启发 / 待验证
- BAD: 要点：我喜欢这个全新的SEO技巧： / 联想：你的帖子将出现在 Google SERP 上
- GOOD: 抽象机制后落到目标项目品类（示例：可索引公开内容 → 该品类的获客路径），不照搬案例客群
- title ≤ 40 chars
- Set project_name when a known project is discussed

## thoughts.type ONLY
idea | insight | observation | research | decision_candidate
NEVER: principle, note, question, identity

## intent + commitments (LANGUAGE-AGNOSTIC)
First choose exactly one object_mode:
- thought: a reflection, observation, idea, hypothesis, or direction with no user commitment to act.
- commitment: the user wants something done. Task context or rationale is NOT a separate Thought.
- mixed: the input contains an independently valuable thought AND a distinct action that advances it.
  Mixed requires two semantic parts; never duplicate one task as both objects.

Examples:
- 「周五前改完官网首页文案」→ object_mode commitment; Commitment only
- 「首页可以像一本安静展开的杂志」→ object_mode thought; Thought only
- 「想做 iOS 版，下个月研究一下可行性」→ object_mode mixed; Thought + Commitment

First set intent.has_actionable_work by meaning:
- TRUE when user wants something BUILT / CHANGED / SHIPPED / FIXED / DONE
  (product work, feature, page, release, bugfix, checklist for launch…)
- FALSE when pure reflection, metaphor, research note, mood, "just thinking"

If has_actionable_work is TRUE:
1. ALWAYS emit ≥1 commitment (same language as user)
2. ALSO set work_titles[] (backup titles if commitments omitted)
3. Emit a Thought alongside only when object_mode is mixed

Examples (same rule, different languages / phrasings):
- ZH 「强化邮件搜索，需要独立搜索页」→ commitment + intent true
- EN "Need a dedicated search page for mail" → commitment
- EN "First release: search + onboarding" → commitment(s)
- ZH 「首发要做搜索和 onboarding」→ commitment
- JA 「検索ページを実装する必要がある」→ commitment
- Pure idea 「这个隐喻很有意思」/ "love this metaphor" → Thought only, intent false

commitments.title: short, executable; no essay paste.
commitments.optimized_content: REQUIRED optimized task content in the user's language. Preserve the
necessary outcome, constraints, and acceptance details, but compress examples and
repetition. Use 1-4 short paragraphs; never paste the raw input verbatim.
commitments.goal: optional reason why the commitment matters; do not use it as task content.
Time phrases (明天/next week/金曜) → fill window/deadline when clear.

## memory_candidates (STRICT — Strategy A)
- Types: preference | project_context | principle | decision | experience
- Candidates only; user will one-tap confirm later. Prefer FEWER high-quality items.
- SKIP (do not emit): temporary mood; one-off ad/creative scripts; campaign metaphors;
  brainstorm fragments; case-study details that are not the user's durable stance.
- One-off creative ideas → thoughts only, NOT memory.
- project_context: only durable product truth (positioning, audience, non-goals, principles).
  Prefer updating project BRIEF (user can paste "X 背景：…") over many small memories.
- If PROJECT BRIEF is present: judge against it; do not invent conflicting preferences.
- confidence ≥ 0.75 required; when unsure → empty memory_candidates.

## Other
- Uncertain about FACTS → Thought; if still clearly WORK → commitment + intent true
- No external send/payment
- Respect active memories
`;

function normalizeThoughtType(raw: string): ThoughtType {
  const t = raw.toLowerCase().replace(/-/g, "_");
  if (t === "principle" || t === "note" || t === "question") {
    return "observation";
  }
  if ((THOUGHT_TYPES as string[]).includes(t)) return t as ThoughtType;
  return "observation";
}

function normalizeMemoryType(raw: string): MemoryType | null {
  const t = raw.toLowerCase().replace(/-/g, "_");
  if (t === "identity" || t === "observation" || t === "relationship") {
    return null;
  }
  // experience may fail old DB CHECK — still try; catch on insert
  if ((MEMORY_TYPES as string[]).includes(t)) return t as MemoryType;
  return null;
}

async function listUserProjects(db: SqlDatabase, userId: string): Promise<ProjectRow[]> {
  return await db
    .prepare(
      `SELECT id, name, description, aliases, status FROM projects WHERE user_id = ?`
    )
    .all(userId) as ProjectRow[];
}

async function findProjectId(
  db: SqlDatabase,
  userId: string,
  name?: string
): Promise<string | null> {
  if (!name) return null;
  const row = await db
    .prepare(
      `SELECT id FROM projects WHERE user_id = ? AND lower(name) = lower(?) AND status = 'active' LIMIT 1`
    )
    .get(userId, name.trim()) as { id: string } | undefined;
  if (row) return row.id;

  // alias match
  const projects = await listUserProjects(db, userId);
  const m = matchProjectFromContent(name, projects, 70);
  return m.kind === "matched" ? m.project_id : null;
}

async function resolveProjectId(
  db: SqlDatabase,
  userId: string,
  content: string,
  explicitName?: string
): Promise<{ projectId: string | null; matchReason?: string; matchName?: string }> {
  if (explicitName) {
    const id = await findProjectId(db, userId, explicitName);
    if (id) {
      return {
      projectId: id,
      matchReason: `explicit project_name=${explicitName}`,
      matchName: explicitName,
    };
    }
  }
  const projects = await listUserProjects(db, userId);
  const m = matchProjectFromContent(content, projects, 70);
  if (m.kind === "matched") {
    return {
      projectId: m.project_id,
      matchReason: m.reason,
      matchName: m.project_name,
    };
  }
  return { projectId: null };
}

export type ProcessMode = "local" | "full";

/**
 * Remove objects derived from a raw input so enrich can replace local results cleanly.
 */
export async function clearInputDerivatives(
  db: SqlDatabase,
  rawInputId: string
): Promise<void> {
  // Order: break FKs from commitments → thoughts, memories, decisions, clarifications
  await db.prepare(
    `UPDATE commitments SET source_thought_id = NULL WHERE source_input_id = ?`
  ).run(rawInputId);
  await db.prepare(`DELETE FROM commitments WHERE source_input_id = ?`).run(rawInputId);
  await db.prepare(`DELETE FROM thoughts WHERE source_input_id = ?`).run(rawInputId);
  // memory_concepts cascade via memory delete if FK; otherwise clean first
  const memIds = await db
    .prepare(`SELECT id FROM memories WHERE source_input_id = ?`)
    .all(rawInputId) as Array<{ id: string }>;
  for (const m of memIds) {
    await db.prepare(`DELETE FROM memory_concepts WHERE memory_id = ?`).run(m.id);
    // The FTS index has no foreign key; drop its row with the memory.
    await removeMemoryFromIndex(db, m.id);
  }
  await db.prepare(`DELETE FROM memories WHERE source_input_id = ?`).run(rawInputId);
  await db.prepare(`DELETE FROM decisions WHERE source_input_id = ?`).run(rawInputId);
  await db.prepare(`DELETE FROM clarifications WHERE raw_input_id = ?`).run(rawInputId);
}

/** Pending object-mode question for this input? Enrichment re-runs must not duplicate it. */
async function hasPendingObjectClarification(
  db: SqlDatabase,
  rawInputId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM clarifications
       WHERE raw_input_id = ? AND kind = 'object_mode' AND status = 'pending'`
    )
    .get(rawInputId);
  return Boolean(row);
}

export async function processRawInput(
  db: SqlDatabase,
  llm: LLMProvider,
  user: User,
  rawInputId: string,
  mode: ProcessMode = "full",
  processingGenerationId?: string
): Promise<ActionCard> {
  const raw = await db
    .prepare(`SELECT * FROM raw_inputs WHERE id = ? AND user_id = ?`)
    .get(rawInputId, user.id) as Record<string, unknown> | undefined;

  if (!raw) throw new Error("RawInput not found");

  const content = raw.content as string;
  const t0 = nowIso();
  // Everything the runtime writes for this user follows their language.
  const locale: Locale = localeOf(user.language);

  // Local phase = deterministic rules (instant). Full = injected provider (DeepSeek…).
  // Clear local derivatives only AFTER LLM parse succeeds (see below).
  const { DevLLMProvider } = await import("../providers/dev.js");
  const runner: LLMProvider =
    mode === "local" ? new DevLLMProvider({ locale }) : llm;

  await writeActionLog(db, {
    user_id: user.id,
    actor: "agent",
    action_type: "processing_input",
    summary: actionSummary("processing_input", undefined, locale),
    entity_type: "raw_input",
    entity_id: rawInputId,
    payload: { mode },
  });

  // Cognitive context: projects (brief + card) + confirmed memories
  const projectRows = await db
    .prepare(
      `SELECT id, name, description, brief, aliases FROM projects
       WHERE user_id = ? AND IFNULL(status,'active') != 'archived'`
    )
    .all(user.id) as Array<{
    id: string;
    name: string;
    description: string | null;
    brief: string | null;
    aliases: string | null;
  }>;

  // Strategy A: if user pastes "<Project> 背景：…", deepen project brief before understand
  const earlyWarnings: string[] = [];
  {
    const { extractProjectBriefUpdate, mergeProjectBrief } = await import(
      "../lib/memoryExtract.js"
    );
    const upd = extractProjectBriefUpdate(
      content,
      projectRows.map((p) => p.name)
    );
    if (upd) {
      const proj = projectRows.find(
        (p) => p.name.toLowerCase() === upd.projectName.toLowerCase()
      );
      if (proj) {
        const merged = mergeProjectBrief(proj.brief, upd.briefChunk);
        await db.prepare(
          `UPDATE projects SET brief = ?, updated_at = ? WHERE id = ?`
        ).run(merged, t0, proj.id);
        proj.brief = merged;
        earlyWarnings.push(pick(locale, `Updated the project brief: ${proj.name}`, `已更新项目背景：${proj.name}`));
        await writeActionLog(db, {
          user_id: user.id,
          actor: "agent",
          action_type: "project_updated",
          summary: actionSummary("project_updated", { name: proj.name }, locale),
          entity_type: "project",
          entity_id: proj.id,
          payload: { name: proj.name, via: "brief_from_input" },
        });
      }
    }
  }

  let activeMemories = await retrieveActiveMemoriesForContext(
    db,
    user.id,
    content,
    12
  );
  activeMemories = boostProjectMemories(
    activeMemories,
    content,
    projectRows.map((p) => p.name)
  );
  // Also pull project_context memories for mentioned products
  const extraProjectCtx = await db
    .prepare(
      `SELECT * FROM memories WHERE user_id = ? AND status = 'active' AND type = 'project_context'
       ORDER BY updated_at DESC LIMIT 10`
    )
    .all(user.id) as Array<Record<string, unknown>>;
  for (const m of extraProjectCtx) {
    const c = String(m.content ?? "").toLowerCase();
    const hit = projectRows.some(
      (p) =>
        content.toLowerCase().includes(p.name.toLowerCase()) &&
        c.includes(p.name.toLowerCase())
    );
    if (hit && !activeMemories.some((x) => x.id === m.id)) {
      activeMemories = [
        {
          ...m,
          concepts: [],
        },
        ...activeMemories,
      ].slice(0, 14);
    }
  }

  const memoryContext = formatMemoryContextBlock(activeMemories);
  const projectsContext = formatProjectsContextBlock(projectRows);

  let parsed: z.infer<typeof ExtractionSchema>;
  try {
    const reply = await runner.complete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `User timezone: ${user.timezone}`,
            `Language: ${user.language}`,
            projectsContext || "User's products / projects: (none registered)",
            memoryContext || "Active user memories: (none)",
            "",
            "Input:",
            content,
          ].join("\n"),
        },
      ],
      { json: true }
    );

    const jsonStart = reply.indexOf("{");
    const jsonEnd = reply.lastIndexOf("}");
    const jsonText =
      jsonStart >= 0 ? reply.slice(jsonStart, jsonEnd + 1) : reply;
    parsed = ExtractionSchema.parse(JSON.parse(jsonText));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Do not wipe local results on AI failure
    if (mode === "full" && processingGenerationId) {
      await db.prepare(
        `UPDATE raw_inputs
         SET processing_status = 'local', error_message = ?, updated_at = ?,
             processing_generation_id = NULL, processing_lease_until = NULL
         WHERE id = ? AND processing_generation_id = ?`
      ).run(message, nowIso(), rawInputId, processingGenerationId);
    } else {
      await db.prepare(
        `UPDATE raw_inputs SET processing_status = ?, error_message = ?, updated_at = ? WHERE id = ?`
      ).run(mode === "full" ? "local" : "failed", message, nowIso(), rawInputId);
    }
    throw err;
  }

  // AI parse ok → replace any prior local derivatives before writing new ones
  if (mode === "full") {
    if (processingGenerationId) {
      const ownsGeneration = await db
        .prepare(
          `SELECT 1 FROM raw_inputs
           WHERE id = ? AND processing_generation_id = ?`
        )
        .get(rawInputId, processingGenerationId);
      if (!ownsGeneration) throw new Error("enrichment_superseded");
    }
    await clearInputDerivatives(db, rawInputId);
  }

  const thoughtsOut: Record<string, unknown>[] = [];
  const commitmentsOut: Record<string, unknown>[] = [];
  const decisionsOut: Record<string, unknown>[] = [];
  const memoriesOut: Record<string, unknown>[] = [];
  const clarificationsOut: ClarificationDTO[] = [];
  const warnings = [...earlyWarnings, ...parsed.warnings];

  // One capture has one primary object mode. Enforce it at the persistence
  // boundary so a model cannot duplicate one semantic unit as two objects.
  const objectMode = decideInputObjectMode(content, parsed);
  if (objectMode.mode === "thought" && parsed.commitments.length > 0) {
    parsed.commitments = [];
    parsed.intent = { has_actionable_work: false, work_titles: [] };
    warnings.push(pick(locale, "Treated as a thought; no commitment created", "已按纯想法处理，未建立要做的事"));
  } else if (objectMode.mode === "commitment" && parsed.thoughts.length > 0) {
    parsed.thoughts = [];
    warnings.push(pick(locale, "Treated as work; the thought was not duplicated", "已按明确行动处理，未重复建立想法"));
  }

  // Project resolution from full input (existing only; never auto-create)
  const contentProject = await resolveProjectId(db, user.id, content);
  const projectSuggestion =
    !contentProject.projectId
      ? suggestNewProjectName(content, await listUserProjects(db, user.id))
      : null;
  if (contentProject.projectId && contentProject.matchReason) {
    warnings.push(pick(locale, `Linked to project ${contentProject.matchName} (${contentProject.matchReason})`, `已关联项目：${contentProject.matchName}（${contentProject.matchReason}）`));
  }
  if (projectSuggestion) {
    warnings.push(
      pick(locale, `New project available: "${projectSuggestion.suggested_name}" — ${projectSuggestion.reason}`, `可新建项目「${projectSuggestion.suggested_name}」：${projectSuggestion.reason}`)
    );
  }

  // Relative day: 明天/后天 — may need early-morning confirmation (00:00–05:00 local)
  const relative = resolveRelativeDay(content, user.timezone);
  const simpleRelative =
    relative.status === "none"
      ? applySimpleRelativePhrases(content, user.timezone)
      : null;

  const insertThought = await db.prepare(
    `INSERT INTO thoughts
     (id, user_id, type, title, content, original_excerpt, project_id, status, importance, source_input_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const th of parsed.thoughts) {
    const id = newId("th");
    const type = normalizeThoughtType(th.type);
    const status = "captured";
    const resolved = await resolveProjectId(
      db,
      user.id,
      content,
      th.project_name ?? undefined
    );
    const projectId = resolved.projectId ?? contentProject.projectId;
    const title =
      (th.title && th.title.trim().slice(0, 48)) || makeThoughtTitle(content);

    const projMeta = projectId
      ? (await db
          .prepare(`SELECT name, description, aliases FROM projects WHERE id = ?`)
          .get(projectId) as
          | { name: string; description: string | null; aliases: string | null }
          | undefined)
      : undefined;
    const pname = th.project_name || projMeta?.name || null;

    const summaryOpts = {
      projectName: pname,
      projectDescription: projMeta?.description,
      aliases: projMeta?.aliases,
      title,
      knownProjects: projectRows.map((p) => p.name),
    };

    // 系统理解: model first, reject low-value / mis-grounded, else product-aware local template
    let body =
      preferModelSummary(content, th.content?.trim()) ||
      makeThoughtSummary(content, th.content?.trim(), summaryOpts);

    if (isLowValueSummary(content, body)) {
      body = makeThoughtSummary(content, undefined, summaryOpts);
    }

    if (
      isMisgroundedTransfer({
        title,
        body,
        projectName: pname,
        projectDescription: projMeta?.description,
      }) &&
      (projMeta || pname)
    ) {
      body = makeProductGroundedTransfer({
        raw: content,
        projectName: projMeta?.name || String(pname),
        projectDescription: projMeta?.description,
        aliases: projMeta?.aliases,
      });
      warnings.push(
        pick(locale, `Rewrote "${title}": the audience follows the target product category`, `已纠正「${title}」：受众按目标产品品类重写，避免照搬案例客群`)
      );
    }

    insertThought.run(
      id,
      user.id,
      type,
      title,
      body,
      content, // original_excerpt keeps full user text as backup
      projectId,
      status,
      th.importance ?? null,
      rawInputId,
      t0,
      t0
    );
    const row = {
      id,
      type,
      title,
      content: body,
      original_excerpt: content,
      source_input_content: content,
      status,
      project_id: projectId,
      source_input_id: rawInputId,
    };
    thoughtsOut.push(row);
    await writeActionLog(db, {
      user_id: user.id,
      actor: "agent",
      action_type: "thought_created",
      summary: actionSummary("thought_created", { type }, locale),
      entity_type: "thought",
      entity_id: id,
      payload: { type },
    });
  }

  const insertCommitment = await db.prepare(
    `INSERT INTO commitments
     (id, user_id, title, goal, optimized_content, project_id, status, deadline, window_start, window_end,
      duration_minutes, importance, source_thought_id, source_input_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Open commitments for cross-input near-dedupe
  const openCommitments = await db
    .prepare(
      `SELECT id, title, source_input_id, source_thought_id, status FROM commitments
       WHERE user_id = ? AND status NOT IN ('completed','cancelled')`
    )
    .all(user.id) as Array<{
    id: string;
    title: string;
    source_input_id: string | null;
    source_thought_id: string | null;
    status: string;
  }>;

  // Language-agnostic safety net: model intent + multilingual heuristic
  // ensure work is not Thought-only (see lib/actionableWork.ts)
  if (objectMode.mode !== "thought") {
    const ensureTitles = missingCommitmentTitles({
      input: content,
      modelIntent: parsed.intent ?? null,
      existingCommitmentTitles: parsed.commitments.map((c) => c.title),
      thoughtTitles: parsed.thoughts
        .map((t) => t.title || t.content?.slice(0, 40) || "")
        .filter(Boolean),
      projectName: contentProject.projectId
        ? (
            await db
              .prepare(`SELECT name FROM projects WHERE id = ?`)
              .get(contentProject.projectId) as { name?: string } | undefined
          )?.name
        : null,
    });
    for (const title of ensureTitles) {
      parsed.commitments.push({
        title,
        optimized_content: content.trim(),
        goal: undefined,
        status: undefined,
        deadline: undefined,
        window_start: undefined,
        window_end: undefined,
        duration_minutes: undefined,
        importance: 0.75,
        project_name: undefined,
      });
      warnings.push(pick(locale, `Added the commitment the model omitted: ${title}`, `已补建要做的事（模型未给出 commitment）：${title}`));
    }
  }

  let pendingRelativeClarification: ReturnType<
    typeof resolveRelativeDay
  > | null =
    relative.status === "needs_confirmation" ? relative : null;
  let relativeAppliedToCommitment = false;

  // Prefer linking first thought from this capture
  const primaryThoughtId =
    (thoughtsOut[0]?.id as string | undefined) ?? null;

  for (const c of parsed.commitments) {
    // Skip near-duplicates already open (same intent, different phrasing / re-capture)
    const dup = openCommitments.find((o) =>
      commitmentsAreNearDuplicate(o.title, c.title)
    );
    if (dup) {
      warnings.push(pick(locale, `Already tracked, so this repeat was skipped: ${dup.title}`, `跳过重复要做的事（已有）：${dup.title}`));
      // Still surface existing in action card once
      if (!commitmentsOut.some((x) => x.id === dup.id)) {
        const full = await db
          .prepare(`SELECT * FROM commitments WHERE id = ?`)
          .get(dup.id) as Record<string, unknown>;
        commitmentsOut.push({
          id: full.id,
          title: full.title,
          status: full.status,
          deadline: full.deadline,
          window_start: full.window_start,
          window_end: full.window_end,
          project_id: full.project_id,
          source_input_id: full.source_input_id,
          source_thought_id: full.source_thought_id,
          already_linked: true,
        });
      }
      continue;
    }

    // One open commitment per source_input is enough when titles collide within batch
    if (
      commitmentsOut.some(
        (x) =>
          x.source_input_id === rawInputId &&
          commitmentsAreNearDuplicate(String(x.title), c.title)
      )
    ) {
      continue;
    }

    const id = newId("cmt");
    const modelAt = new Date();
    const dateScope = dateSuppressionScope(content, c);
    let deadline = normalizeModelDate(c.deadline, user.timezone, dateScope, modelAt, "deadline");
    let window_start = normalizeModelDate(c.window_start, user.timezone, dateScope, modelAt, "window_start");
    let window_end = normalizeModelDate(c.window_end, user.timezone, dateScope, modelAt, "window_end");

    // Server-side relative day overrides ambiguous auto dates
    if (relative.status === "needs_confirmation") {
      // Do not guess — clear any model-inferred window for this phrase
      window_start = null;
      window_end = null;
      // keep explicit deadline only if not derived from 明天/后天 (leave null)
      if (!deadline || /明天|后天|tomorrow/i.test(content)) {
        deadline = null;
      }
    } else if (relative.status === "resolved" && !relativeAppliedToCommitment) {
      window_start = relative.window_start;
      window_end = relative.window_end;
      relativeAppliedToCommitment = true;
    } else if (
      simpleRelative &&
      !window_start &&
      !window_end &&
      !deadline &&
      !relativeAppliedToCommitment
    ) {
      window_start = simpleRelative.window_start ?? null;
      window_end = simpleRelative.window_end ?? null;
      deadline = simpleRelative.deadline ?? null;
      relativeAppliedToCommitment = true;
    }

    const status =
      deadline || window_start || window_end ? "planned" : "captured";
    const resolved = await resolveProjectId(db, user.id, content, c.project_name ?? undefined);
    const projectId = resolved.projectId ?? contentProject.projectId;
    insertCommitment.run(
      id,
      user.id,
      c.title,
      c.goal?.trim() || null,
      c.optimized_content?.trim() || content.trim(),
      projectId,
      status,
      deadline,
      window_start,
      window_end,
      c.duration_minutes ?? null,
      c.importance ?? null,
      primaryThoughtId,
      rawInputId,
      t0,
      t0
    );
    openCommitments.push({
      id,
      title: c.title,
      source_input_id: rawInputId,
      source_thought_id: primaryThoughtId,
      status,
    });
    commitmentsOut.push({
      id,
      title: c.title,
      goal: c.goal?.trim() || null,
      optimized_content: c.optimized_content?.trim() || content.trim(),
      status,
      deadline,
      window_start,
      window_end,
      project_id: projectId,
      source_input_id: rawInputId,
      source_thought_id: primaryThoughtId,
    });
    await writeActionLog(db, {
      user_id: user.id,
      actor: "agent",
      action_type: "commitment_created",
      summary: actionSummary("commitment_created", { title: c.title }, locale),
      entity_type: "commitment",
      entity_id: id,
      payload: { title: c.title },
    });

    if (
      pendingRelativeClarification &&
      pendingRelativeClarification.status === "needs_confirmation"
    ) {
      const clar = pendingRelativeClarification.clarification;
      const clarId = newId("clr");
      await db.prepare(
        `INSERT INTO clarifications
         (id, user_id, raw_input_id, commitment_id, kind, token, prompt, options_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).run(
        clarId,
        user.id,
        rawInputId,
        id,
        clar.kind,
        clar.token,
        clar.prompt,
        JSON.stringify(clar.options),
        t0
      );
      clarificationsOut.push({
        id: clarId,
        kind: clar.kind,
        token: clar.token,
        prompt: clar.prompt,
        commitment_id: id,
        options: clar.options.map((o) => ({ id: o.id, label: o.label })),
      });
      warnings.push(clar.prompt);
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "clarification_requested",
        summary: actionSummary("clarification_requested", { token: clar.token }, locale),
        reason: clar.prompt,
        entity_type: "commitment",
        entity_id: id,
        payload: { token: clar.token },
      });
      // only attach to first commitment from this input
      pendingRelativeClarification = null;
    }
  }

  // Only the Thought actually linked to a newly created Commitment is converted.
  // Other Thoughts from a genuinely mixed capture remain independently useful.
  const createdCommitmentFromThisInput = commitmentsOut.some(
    (commitment) =>
      commitment.source_input_id === rawInputId && !commitment.already_linked
  );
  if (createdCommitmentFromThisInput && primaryThoughtId) {
    await db.prepare(
      `UPDATE thoughts SET status = 'converted', updated_at = ?
       WHERE id = ? AND user_id = ? AND status != 'archived'`
    ).run(t0, primaryThoughtId, user.id);
    for (const th of thoughtsOut) {
      if (th.id === primaryThoughtId) th.status = "converted";
    }
  }

  // Relative day on input but no commitment yet — still ask if phrase present with action-like content
  if (
    pendingRelativeClarification &&
    pendingRelativeClarification.status === "needs_confirmation" &&
    commitmentsOut.length === 0 &&
    objectMode.mode !== "thought"
  ) {
    // create a lightweight commitment from raw text so time can attach
    const id = newId("cmt");
    const title = content.slice(0, 80);
    insertCommitment.run(
      id,
      user.id,
      title,
      null,
      content.trim(),
      null,
      "captured",
      null,
      null,
      null,
      60,
      null,
      null,
      rawInputId,
      t0,
      t0
    );
    commitmentsOut.push({
      id,
      title,
      goal: null,
      optimized_content: content.trim(),
      status: "captured",
      deadline: null,
      window_start: null,
      window_end: null,
      project_id: null,
      source_input_id: rawInputId,
    });
    const clar = pendingRelativeClarification.clarification;
    const clarId = newId("clr");
    await db.prepare(
      `INSERT INTO clarifications
       (id, user_id, raw_input_id, commitment_id, kind, token, prompt, options_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(
      clarId,
      user.id,
      rawInputId,
      id,
      clar.kind,
      clar.token,
      clar.prompt,
      JSON.stringify(clar.options),
      t0
    );
    clarificationsOut.push({
      id: clarId,
      kind: clar.kind,
      token: clar.token,
      prompt: clar.prompt,
      commitment_id: id,
      options: clar.options.map((o) => ({ id: o.id, label: o.label })),
    });
    warnings.push(clar.prompt);
  }

  // Grey zone: some work signal, below the bar to act, nothing extracted. Do not
  // guess a thought — ask once, or apply what the user already taught us.
  if (
    objectMode.mode === "thought" &&
    commitmentsOut.length === 0 &&
    shouldAskObjectMode(content) &&
    !(await hasPendingObjectClarification(db, rawInputId))
  ) {
    const learned = await matchClassificationSignal(db, user.id, content);
    if (learned) {
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "input_reclassified",
        summary: actionSummary("input_reclassified", { choice: learned }, locale),
        reason: "classification_signal",
        entity_type: "raw_input",
        entity_id: rawInputId,
        payload: { choice: learned, via: "signal" },
      });
    }
    if (learned === "bug" || learned === "task") {
      const id = newId("cmt");
      const title = commitmentTitleFor(content, learned, locale);
      insertCommitment.run(
        id,
        user.id,
        title,
        null,
        content.trim(),
        null,
        "captured",
        null,
        null,
        null,
        60,
        null,
        null,
        rawInputId,
        t0,
        t0
      );
      commitmentsOut.push({
        id,
        title,
        goal: null,
        optimized_content: content.trim(),
        status: "captured",
        deadline: null,
        window_start: null,
        window_end: null,
        project_id: null,
        source_input_id: rawInputId,
      });
      if (primaryThoughtId) {
        await db
          .prepare(
            `UPDATE thoughts SET status = 'converted', updated_at = ?
             WHERE id = ? AND user_id = ? AND status != 'archived'`
          )
          .run(t0, primaryThoughtId, user.id);
      }
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "commitment_created",
        summary: actionSummary("commitment_created", { title }, locale),
        entity_type: "commitment",
        entity_id: id,
        payload: { title, via: "classification_signal", choice: learned },
      });
    } else if (learned !== "note") {
      const options = objectModeOptions(locale);
      const prompt = objectModeQuestion(locale);
      const clarId = newId("clr");
      await db
        .prepare(
          `INSERT INTO clarifications
           (id, user_id, raw_input_id, commitment_id, kind, token, prompt, options_json, status, created_at)
           VALUES (?, ?, ?, NULL, 'object_mode', NULL, ?, ?, 'pending', ?)`
        )
        .run(clarId, user.id, rawInputId, prompt, JSON.stringify(options), t0);
      clarificationsOut.push({
        id: clarId,
        kind: "object_mode",
        token: null,
        prompt,
        commitment_id: null,
        options,
      });
      warnings.push(prompt);
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "clarification_requested",
        summary: actionSummary("clarification_requested", { kind: "object_mode" }, locale),
        reason: prompt,
        entity_type: "raw_input",
        entity_id: rawInputId,
        payload: { kind: "object_mode" },
      });
    }
  }

  const insertDecision = await db.prepare(
    `INSERT INTO decisions
     (id, user_id, title, reason, project_id, status, source_input_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  );

  for (const d of parsed.decisions) {
    const id = newId("dec");
    const resolved = await resolveProjectId(db, user.id, content, d.project_name ?? undefined);
    const projectId = resolved.projectId ?? contentProject.projectId;
    insertDecision.run(
      id,
      user.id,
      d.title,
      d.reason ?? null,
      projectId,
      rawInputId,
      t0,
      t0
    );
    decisionsOut.push({
      id,
      title: d.title,
      reason: d.reason ?? null,
      status: "active",
      source_input_id: rawInputId,
    });
  }

  // Merge rule-based + model candidates; prefer rule wording when similar
  const ruleMems = extractMemoryCandidates(content, localeOf(user.language));
  const mergedMems: Array<{
    type: string;
    content: string;
    source?: string;
    confidence?: number;
    evidence?: string;
    project_name?: string;
  }> = [];
  const mergeKey = new Set<string>();
  for (const rm of ruleMems) {
    const k = normalizeMemoryKey(rm.type, rm.content);
    if (mergeKey.has(k)) continue;
    mergeKey.add(k);
    mergedMems.push(rm);
  }
  for (const pm of parsed.memory_candidates) {
    const k = normalizeMemoryKey(pm.type, pm.content);
    if (mergeKey.has(k)) continue;
    // also fuzzy vs already merged
    if (
      mergedMems.some((x) =>
        isSimilarMemory(x.type, x.content, pm.type, pm.content)
      )
    ) {
      continue;
    }
    mergeKey.add(k);
    mergedMems.push({
      type: pm.type,
      content: pm.content,
      source: pm.source ?? undefined,
      confidence: pm.confidence ?? undefined,
      evidence: pm.evidence ?? undefined,
      project_name: pm.project_name ?? undefined,
    });
  }

  // Strategy A: filter hard; survivors remain candidates for one-tap confirm
  const hasAnyBrief = projectRows.some((p) => (p.brief || "").trim().length > 40);
  const { kept: filteredMems, skipped: memSkipped } =
    filterMemoryCandidatesForConfirm(
      mergedMems.map((m) => ({
        type: m.type,
        content: m.content,
        source: m.source ?? "ai_inferred",
        confidence: m.confidence ?? 0.75,
        evidence: m.evidence ?? content.slice(0, 240),
        concept_names: [],
      })),
      { input: content, hasProjectBrief: hasAnyBrief }
    );
  if (memSkipped.length) {
    warnings.push(
      pick(locale, `Filtered ${memSkipped.length} candidates not worth keeping (one-off, low confidence, temporary)`, `已过滤 ${memSkipped.length} 条不宜长期记住的候选（创意/低置信/临时）`)
    );
  }
  const finalMems = filteredMems.map((m) => ({
    type: m.type,
    content: m.content,
    source: m.source,
    confidence: m.confidence,
    evidence: m.evidence,
    project_name: mergedMems.find((x) => x.content === m.content)?.project_name,
  }));

  // Existing active/candidate memories for this user (skip re-create)
  const existingMems = await db
    .prepare(
      `SELECT id, type, content, status FROM memories
       WHERE user_id = ? AND status IN ('candidate', 'active')`
    )
    .all(user.id) as Array<{
    id: string;
    type: string;
    content: string;
    status: string;
  }>;

  const insertMemory = await db.prepare(
    `INSERT INTO memories
     (id, user_id, type, content, project_id, status, confidence, importance, source, evidence,
      source_input_id, conflicts_with_id, conflict_reason, confirmed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Memory evolution: a candidate that contradicts a confirmed memory is still
  // stored, but flagged so the user can replace, keep both, or discard it.
  const conflictJudge = isRealLLMProvider(llm)
    ? makeModelJudge((prompt) =>
        llm.complete(
          [
            { role: "system", content: "You audit a personal knowledge base for contradictions." },
            { role: "user", content: prompt },
          ],
          { json: true }
        )
      )
    : undefined;
  const memoryConflicts: MemoryConflict[] = [];

  for (const m of finalMems) {
    const type = normalizeMemoryType(m.type);
    if (!type) {
      warnings.push(`Dropped invalid memory type: ${m.type}`);
      continue;
    }
    const already = existingMems.find((e) =>
      isSimilarMemory(e.type, e.content, type, m.content)
    );
    if (already) {
      warnings.push(
        already.status === "active"
          ? pick(locale, "A similar memory is already active; skipped", "已有相似生效记忆，跳过重复候选")
          : pick(locale, "A similar memory already waits for confirmation; skipped", "已有相似待确认记忆，跳过重复")
      );
      // surface existing candidate on card if still pending
      if (already.status === "candidate") {
        const conceptNames = suggestConceptNamesForMemory(
          already.type,
          already.content
        );
        memoriesOut.push({
          id: already.id,
          type: already.type,
          content: already.content,
          status: "candidate",
          source: "ai_inferred",
          concept_names: conceptNames,
          duplicate_skipped: true,
        });
      }
      continue;
    }

    const id = newId("mem");
    const source =
      m.source === "user_explicit" || m.source === "decision_promote"
        ? m.source
        : "ai_inferred";
    const resolved = await resolveProjectId(db, user.id, content, m.project_name ?? undefined);
    const projectId = resolved.projectId ?? contentProject.projectId;
    const conceptNames = suggestConceptNamesForMemory(type, m.content);
    const importance = memoryImportanceFor(type);

    let conflict: MemoryConflict | null = null;
    try {
      conflict = await detectMemoryConflict(
        db,
        user.id,
        { type, content: m.content },
        { judge: conflictJudge }
      );
    } catch {
      // Conflict detection must never block a capture.
      conflict = null;
    }

    // High-confidence memories take effect on capture; the rest wait as
    // candidates. See lib/memoryActivation.ts for the policy.
    const decision = decideMemoryActivation({
      type,
      source,
      content: m.content,
      confidence: m.confidence ?? null,
      importance,
    });

    const activation: MemoryActivation =
      decision.activation === "active" ? "active" : "candidate";
    // `confirmed_at` records a human confirmation, so an automated activation
    // leaves it empty — that is what separates `auto` from `confirmed`.
    const confirmedAt = null;
    const activationReason = decision.reason;

    try {
      await insertMemory.run(
        id,
        user.id,
        type,
        m.content,
        projectId,
        activation,
        m.confidence ?? null,
        importance,
        source,
        m.evidence ?? null,
        rawInputId,
        conflict?.memory_id ?? null,
        conflict?.reason ?? null,
        confirmedAt,
        t0,
        t0
      );
    } catch (e) {
      if (type === "experience") {
        warnings.push("Skipped experience memory (schema upgrade pending)");
        continue;
      }
      throw e;
    }
    await indexMemory(db, id, m.content);
    existingMems.push({
      id,
      type,
      content: m.content,
      status: activation,
    });
    memoriesOut.push({
      id,
      type,
      content: m.content,
      status: activation,
      activation_reason: activationReason,
      source,
      confidence: m.confidence ?? null,
      importance,
      source_input_id: rawInputId,
      concept_names: conceptNames,
      conflicts_with: conflict?.memory_id ?? null,
      conflict_reason: conflict?.reason ?? null,
    });
    if (conflict) {
      memoryConflicts.push(conflict);
      warnings.push(
        pick(locale, `This contradicts "${conflict.memory_content}" (${conflict.reason}); you can replace it on confirmation`, `这条记忆与已生效的「${conflict.memory_content}」冲突（${conflict.reason}）：确认时可选择替换`)
      );
      await writeActionLog(db, {
        user_id: user.id,
        actor: "agent",
        action_type: "memory_conflict_detected",
        summary: actionSummary("memory_conflict_detected", { type }, locale),
        reason: conflict.reason,
        entity_type: "memory",
        entity_id: id,
        payload: { conflicts_with: conflict.memory_id, detector: conflict.detector },
      });
    }
    await writeActionLog(db, {
      user_id: user.id,
      actor: "agent",
      action_type:
        activation === "active" ? "memory_activated" : "memory_candidate_created",
      summary:
        activation === "active"
          ? pick(locale, `Remembered: ${m.content.slice(0, 60)}`, `已记住：${m.content.slice(0, 60)}`)
          : actionSummary("memory_candidate_created", { type }, locale),
      reason: activation === "active" ? activationReason : undefined,
      entity_type: "memory",
      entity_id: id,
      payload: {
        type,
        activation,
        activation_reason: activationReason,
        confidence: m.confidence ?? null,
        importance,
        source,
      },
    });
  }

  if (activeMemories.length) {
    await writeActionLog(db, {
      user_id: user.id,
      actor: "agent",
      action_type: "memory_context_injected",
      summary: actionSummary("memory_context_injected", {
        count: activeMemories.length,
      }, locale),
      entity_type: "raw_input",
      entity_id: rawInputId,
      payload: {
        memory_ids: activeMemories.map((m) => m.id),
        count: activeMemories.length,
      },
    });
    warnings.push(
      pick(locale, `Used ${activeMemories.length} active memories as context`, `已参考 ${activeMemories.length} 条生效记忆（认知上下文）`)
    );
  }

  const status = mode === "local" ? "local" : "processed";
  if (mode === "full" && processingGenerationId) {
    const updated = await db.prepare(
      `UPDATE raw_inputs
       SET processing_status = ?, processed_at = ?, error_message = NULL,
           updated_at = ?, result_generation_id = ?,
           processing_generation_id = NULL, processing_lease_until = NULL
       WHERE id = ? AND processing_generation_id = ?`
    ).run(
      status,
      t0,
      t0,
      processingGenerationId,
      rawInputId,
      processingGenerationId
    );
    if (updated.changes === 0) throw new Error("enrichment_superseded");
  } else {
    await db.prepare(
      `UPDATE raw_inputs SET processing_status = ?, processed_at = ?, error_message = NULL, updated_at = ? WHERE id = ?`
    ).run(status, t0, t0, rawInputId);
  }

  await writeActionLog(db, {
    user_id: user.id,
    actor: "agent",
    action_type: "objects_extracted",
    summary: actionSummary("objects_extracted", {
      thoughts: thoughtsOut.length,
      commitments: commitmentsOut.length,
      memories: memoriesOut.length,
    }, locale),
    entity_type: "raw_input",
    entity_id: rawInputId,
    payload: {
      thought_ids: thoughtsOut.map((t) => t.id),
      commitment_ids: commitmentsOut.map((c) => c.id),
      thoughts: thoughtsOut.length,
      commitments: commitmentsOut.length,
      memories: memoriesOut.length,
      mode,
      object_mode: objectMode.mode,
      object_mode_source: objectMode.source,
    },
  });

  const summaryParts: string[] =
    mode === "local"
      ? [pick(locale, "Captured", "已记下")]
      : [pick(locale, "Understood", "已理解")];
  if (thoughtsOut.length)
    summaryParts.push(
      pick(
        locale,
        `${thoughtsOut.length} ${plural(locale, thoughtsOut.length, "thought")}`,
        `${thoughtsOut.length} 条想法`
      )
    );
  if (commitmentsOut.length)
    summaryParts.push(
      pick(
        locale,
        `${commitmentsOut.length} ${plural(locale, commitmentsOut.length, "commitment")}`,
        `${commitmentsOut.length} 件要做`
      )
    );
  const rememberedCount = memoriesOut.filter((m) => m.status === "active").length;
  const pendingCount = memoriesOut.length - rememberedCount;
  if (rememberedCount)
    summaryParts.push(
      pick(locale, `remembered ${rememberedCount}`, `已记住 ${rememberedCount} 条`)
    );
  if (pendingCount)
    summaryParts.push(pick(locale, `${pendingCount} to confirm`, `待确认 ${pendingCount} 条`));
  if (clarificationsOut.length)
    summaryParts.push(
      pick(
        locale,
        `${clarificationsOut.length} ${plural(locale, clarificationsOut.length, "question")}`,
        `待确认 ${clarificationsOut.length}`
      )
    );

  return {
    summary: summaryParts.join(" · "),
    thoughts: thoughtsOut,
    commitments: commitmentsOut,
    decisions: decisionsOut,
    memory_candidates: memoriesOut,
    memory_conflicts: memoryConflicts,
    clarifications: clarificationsOut,
    project_match:
      contentProject.projectId && contentProject.matchName
        ? {
            project_id: contentProject.projectId,
            project_name: contentProject.matchName,
            reason: contentProject.matchReason ?? "",
          }
        : null,
    project_suggestion: projectSuggestion,
    warnings,
  };
}
