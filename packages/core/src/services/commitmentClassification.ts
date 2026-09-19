import type { LLMProvider } from "../providers/types.js";
import { DEFAULT_LOCALE, pick, type Locale } from "../lib/locale.js";
import { isRealLLMProvider } from "../providers/index.js";
import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { newId } from "../lib/id.js";
import { actionSummary } from "../lib/actionMessages.js";
import { writeActionLog } from "../repos/actionLogs.js";
import { z } from "zod";

const CLASSIFIER_VERSION = "work-streams-v1";

type CommitmentRow = {
  id: string;
  title: string;
  optimized_content: string | null;
  goal: string | null;
  project_id: string | null;
  updated_at: string;
};

type ProjectContext = {
  id: string;
  name: string;
  description: string | null;
  brief: string | null;
  updated_at: string;
};

type ActiveProjectMemory = {
  id: string;
  project_id: string;
  type: string;
  content: string;
  updated_at: string;
  concept_names: string[];
};

type Assignment = {
  commitment: CommitmentRow;
  groupKey: string;
  groupLabel: string;
  reason: string;
};

type ClassificationSnapshot = {
  commitments: CommitmentRow[];
  projects: ProjectContext[];
  projectNames: Map<string, string>;
  memories: ActiveProjectMemory[];
  inputFingerprint: string;
  contextFingerprint: string;
};

const ClassificationResponseSchema = z.object({
  groups: z
    .array(
      z.object({
        group_key: z.string().trim().min(1).max(80),
        label: z.string().trim().min(1).max(24),
        commitment_ids: z.array(z.string().min(1)).min(1),
        reason: z.string().trim().max(160).optional().default(""),
      })
    )
    .min(1)
    .max(6),
});

export type ClassificationRebuildResult = {
  status: "ready" | "running" | "failed" | "stale";
  changed: boolean;
  generation_id: string;
  assignment_count: number;
  group_count: number;
  memory_count: number;
  used_fallback: boolean;
  error?: string;
};

export type WorkClassificationRow = {
  commitment_id: string;
  group_key: string;
  group_label: string;
  source: "ai" | "user" | "fallback";
  reason: string | null;
  manual_override: number;
};

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function commitmentFingerprint(row: CommitmentRow): string {
  return stableHash(
    [
      row.id,
      row.title,
      row.optimized_content ?? "",
      row.goal ?? "",
      row.project_id ?? "",
    ].join("\u001f")
  );
}

function deterministicAssignments(
  commitments: CommitmentRow[],
  projectNames: Map<string, string>
): Assignment[] {
  const projectCounts = new Map<string, number>();
  for (const commitment of commitments) {
    const key = commitment.project_id ?? "unassigned";
    projectCounts.set(key, (projectCounts.get(key) ?? 0) + 1);
  }
  const directlyVisible = new Set(
    [...projectCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, projectCounts.size <= 6 ? 6 : 5)
      .map(([key]) => key)
  );
  return commitments.map((commitment) => {
    const projectKey = commitment.project_id ?? "unassigned";
    const visible = directlyVisible.has(projectKey);
    const label = visible
      ? commitment.project_id
        ? projectNames.get(commitment.project_id) ?? "其他项目"
        : "待归类"
      : "其他项目";
    const key = visible
      ? commitment.project_id
        ? `project:${commitment.project_id}`
        : "unassigned"
      : "other-projects";
    return {
      commitment,
      groupKey: key,
      groupLabel: label,
      reason: commitment.project_id ? `属于 ${label} 项目` : "尚未关联项目",
    };
  });
}

async function modelAssignments(
  provider: LLMProvider,
  commitments: CommitmentRow[],
  projects: ProjectContext[],
  memories: ActiveProjectMemory[],
  previousGroups: Array<{
    group_key: string;
    group_label: string;
    project_id: string | null;
  }>
): Promise<Assignment[]> {
  const allowedIds = new Set(commitments.map((commitment) => commitment.id));
  const previousKeyProjects = new Map<string, string | null | undefined>();
  for (const group of previousGroups) {
    if (!previousKeyProjects.has(group.group_key)) {
      previousKeyProjects.set(group.group_key, group.project_id);
    } else if (previousKeyProjects.get(group.group_key) !== group.project_id) {
      previousKeyProjects.set(group.group_key, undefined);
    }
  }
  const payload = {
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description?.slice(0, 240) ?? null,
      brief: project.brief?.slice(0, 800) ?? null,
    })),
    active_project_memories: memories.map((memory) => ({
      id: memory.id,
      project_id: memory.project_id,
      type: memory.type,
      content: memory.content.slice(0, 320),
      concepts: memory.concept_names.slice(0, 6),
    })),
    previous_groups: previousGroups,
    commitments: commitments.map((commitment) => ({
      id: commitment.id,
      project_id: commitment.project_id,
      title: commitment.title.slice(0, 160),
      optimized_content: commitment.optimized_content?.slice(0, 420) ?? null,
      goal: commitment.goal?.slice(0, 240) ?? null,
    })),
  };
  const response = await provider.complete(
    [
      {
        role: "system",
        content: `You organize open commitments into a calm, mutually exclusive Work-list view.
Return JSON only: {"groups":[{"group_key":"...","label":"...","commitment_ids":["..."],"reason":"..."}]}.

Hard rules:
- Every commitment id appears exactly once. Never invent or omit ids.
- Produce 3-5 visible groups when the collection supports it; maximum 6.
- Project id is authoritative. Never change it or create a project.
- When several projects are active, prefer project-shaped groups. Split a dominant project only when it has at least 6 semantically distinct commitments.
- Prefer outcome-oriented labels in the user's language, 4-8 Chinese characters or similarly concise English.
- Reuse a previous group_key when its meaning still fits. For a genuinely new group use group_key "new:<short-slug>".
- Confirmed project memories only help disambiguate and name groups. They never override commitment meaning.
- Do not infer priority, deadline, risk, Today scheduling, Concept, or permanent Memory.`,
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
    { json: true }
  );
  const start = response.indexOf("{");
  const end = response.lastIndexOf("}");
  const parsed = ClassificationResponseSchema.parse(
    JSON.parse(start >= 0 ? response.slice(start, end + 1) : response)
  );
  const minimumGroups = commitments.length >= 15 ? 3 : commitments.length >= 5 ? 2 : 1;
  if (parsed.groups.length < minimumGroups) {
    throw new Error("classification_too_few_groups");
  }

  const seen = new Set<string>();
  const resolvedGroupKeys = new Set<string>();
  const byId = new Map(commitments.map((commitment) => [commitment.id, commitment]));
  const assignments: Assignment[] = [];
  for (const group of parsed.groups) {
    const groupProjectIds = new Set(
      group.commitment_ids.map((id) => byId.get(id)?.project_id ?? "unassigned")
    );
    if (groupProjectIds.size !== 1) {
      throw new Error("classification_cross_project_group");
    }
    const projectScope = [
      ...new Set(
        group.commitment_ids
          .map((id) => byId.get(id)?.project_id ?? "none")
          .sort()
      ),
    ].join(",");
    const groupProjectId = byId.get(group.commitment_ids[0])?.project_id ?? null;
    const groupKey = previousKeyProjects.get(group.group_key) === groupProjectId
      ? group.group_key
      : `work:${stableHash(`${projectScope}:${group.label.toLowerCase()}`)}`;
    if (resolvedGroupKeys.has(groupKey)) {
      throw new Error("classification_duplicate_group_key");
    }
    resolvedGroupKeys.add(groupKey);
    for (const id of group.commitment_ids) {
      if (!allowedIds.has(id)) throw new Error("classification_unknown_commitment");
      if (seen.has(id)) throw new Error("classification_duplicate_commitment");
      seen.add(id);
      assignments.push({
        commitment: byId.get(id)!,
        groupKey,
        groupLabel: group.label,
        reason: group.reason || `属于“${group.label}”工作脉络`,
      });
    }
  }
  if (seen.size !== commitments.length) {
    throw new Error("classification_incomplete_commitments");
  }
  return assignments;
}

async function activeProjectMemories(
  db: SqlDatabase,
  userId: string,
  projectIds: Set<string>
): Promise<ActiveProjectMemory[]> {
  if (projectIds.size === 0) return [];
  const rows = await db
    .prepare(
      `SELECT m.id, m.project_id, m.type, m.content, m.updated_at,
              c.name AS concept_name
       FROM memories m
       LEFT JOIN memory_concepts mc ON mc.memory_id = m.id
       LEFT JOIN concepts c ON c.id = mc.concept_id
       WHERE m.user_id = ? AND m.status = 'active' AND m.project_id IS NOT NULL
       ORDER BY m.importance DESC NULLS LAST, m.updated_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    project_id: string;
    type: string;
    content: string;
    updated_at: string;
    concept_name: string | null;
  }>;
  const byId = new Map<string, ActiveProjectMemory>();
  for (const row of rows) {
    if (!projectIds.has(row.project_id)) continue;
    const existing = byId.get(row.id);
    if (existing) {
      if (row.concept_name && !existing.concept_names.includes(row.concept_name)) {
        existing.concept_names.push(row.concept_name);
      }
      continue;
    }
    byId.set(row.id, {
      id: row.id,
      project_id: row.project_id,
      type: row.type,
      content: row.content,
      updated_at: row.updated_at,
      concept_names: row.concept_name ? [row.concept_name] : [],
    });
  }

  return [...byId.values()].slice(0, 3);
}

async function loadClassificationSnapshot(
  db: SqlDatabase,
  userId: string
): Promise<ClassificationSnapshot> {
  const commitments = await db
    .prepare(
      `SELECT id, title, optimized_content, goal, project_id, updated_at
       FROM commitments
       WHERE user_id = ? AND status NOT IN ('completed', 'cancelled')
       ORDER BY created_at DESC, id DESC`
    )
    .all(userId) as CommitmentRow[];
  const projectIds = new Set(
    commitments
      .map((commitment) => commitment.project_id)
      .filter((projectId): projectId is string => Boolean(projectId))
  );
  const projects = (await db
    .prepare(
      `SELECT id, name, description, brief, updated_at
       FROM projects WHERE user_id = ?`
    )
    .all(userId) as ProjectContext[]).filter((project) => projectIds.has(project.id));
  const memories = await activeProjectMemories(db, userId, projectIds);
  const inputFingerprint = stableHash(
    commitments.map((item) => commitmentFingerprint(item)).sort().join("|")
  );
  const contextFingerprint = stableHash(
    [
      ...projects.map((project) =>
        [
          project.id,
          project.name,
          project.description ?? "",
          project.brief ?? "",
          project.updated_at,
        ].join(":")
      ),
      ...memories.map((memory) =>
        [
          memory.id,
          memory.project_id,
          memory.type,
          memory.content,
          memory.updated_at,
          memory.concept_names.join(","),
        ].join(":")
      ),
    ]
      .sort()
      .join("|")
  );
  return {
    commitments,
    projects,
    projectNames: new Map(projects.map((project) => [project.id, project.name])),
    memories,
    inputFingerprint,
    contextFingerprint,
  };
}

function classificationExecutionMode(provider: LLMProvider): string {
  return isRealLLMProvider(provider) ? `model:${provider.name}` : "fallback";
}

export async function rebuildCommitmentClassifications(
  db: SqlDatabase,
  provider: LLMProvider,
  userId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<ClassificationRebuildResult> {
  const snapshot = await loadClassificationSnapshot(db, userId);
  const {
    commitments,
    projects,
    projectNames,
    memories,
    inputFingerprint,
    contextFingerprint,
  } = snapshot;
  const generationId = newId("classify");
  const executionMode = classificationExecutionMode(provider);
  const existing = await db
    .prepare(
      `SELECT generation_id, assignment_count, group_count, execution_mode
       FROM commitment_classification_runs
       WHERE user_id = ? AND status = 'ready'
         AND input_fingerprint = ? AND context_fingerprint = ?
         AND classifier_version = ? AND execution_mode = ?`
    )
    .get(
      userId,
      inputFingerprint,
      contextFingerprint,
      CLASSIFIER_VERSION,
      executionMode
    ) as
    | {
        generation_id: string;
        assignment_count: number;
        group_count: number;
        execution_mode: string;
      }
    | undefined;
  if (existing) {
    return {
      status: "ready",
      changed: false,
      generation_id: existing.generation_id,
      assignment_count: existing.assignment_count,
      group_count: existing.group_count,
      memory_count: memories.length,
      used_fallback: existing.execution_mode === "fallback",
    };
  }

  const reusableRun = await db
    .prepare(
      `SELECT generation_id FROM commitment_classification_runs
       WHERE user_id = ? AND status = 'ready' AND context_fingerprint = ?
         AND classifier_version = ? AND execution_mode = ?`
    )
    .get(userId, contextFingerprint, CLASSIFIER_VERSION, executionMode) as
    | { generation_id: string }
    | undefined;
  if (reusableRun) {
    const projected = await db
      .prepare(
        `SELECT cc.commitment_id, cc.commitment_fingerprint, cc.group_key, cc.source
         FROM commitment_classifications cc
         INNER JOIN commitments c ON c.id = cc.commitment_id
         WHERE cc.user_id = ? AND c.status NOT IN ('completed', 'cancelled')`
      )
      .all(userId) as Array<{
      commitment_id: string;
      commitment_fingerprint: string;
      group_key: string;
      source: string;
    }>;
    const fingerprints = new Map(
      projected.map((item) => [item.commitment_id, item.commitment_fingerprint])
    );
    const everyOpenItemIsCurrent =
      projected.length === commitments.length &&
      commitments.every(
        (commitment) =>
          fingerprints.get(commitment.id) === commitmentFingerprint(commitment)
      );
    if (everyOpenItemIsCurrent) {
      return {
        status: "ready",
        changed: false,
        generation_id: reusableRun.generation_id,
        assignment_count: commitments.length,
        group_count: new Set(projected.map((item) => item.group_key)).size,
        memory_count: memories.length,
        used_fallback: projected.some((item) => item.source === "fallback"),
      };
    }
  }

  const claimTime = nowIso();
  const leaseUntil = new Date(Date.parse(claimTime) + 5 * 60 * 1000).toISOString();
  const claim = await db
    .prepare(
      `INSERT INTO commitment_classification_runs
       (user_id, generation_id, input_fingerprint, context_fingerprint,
        classifier_version, execution_mode, status,
        lease_until, assignment_count, group_count, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?, 0, 0, NULL, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         generation_id = excluded.generation_id,
         input_fingerprint = excluded.input_fingerprint,
         context_fingerprint = excluded.context_fingerprint,
         classifier_version = excluded.classifier_version,
         execution_mode = excluded.execution_mode,
         status = 'running',
         lease_until = excluded.lease_until,
         last_error = NULL,
         updated_at = excluded.updated_at
       WHERE commitment_classification_runs.status != 'running'
          OR commitment_classification_runs.lease_until IS NULL
          OR commitment_classification_runs.lease_until <= ?
          OR commitment_classification_runs.input_fingerprint != ?
          OR commitment_classification_runs.context_fingerprint != ?
          OR commitment_classification_runs.classifier_version != ?
          OR commitment_classification_runs.execution_mode != ?`
    )
    .run(
      userId,
      generationId,
      inputFingerprint,
      contextFingerprint,
      CLASSIFIER_VERSION,
      executionMode,
      leaseUntil,
      claimTime,
      claimTime,
      claimTime,
      inputFingerprint,
      contextFingerprint,
      CLASSIFIER_VERSION,
      executionMode
    );
  if (claim.changes === 0) {
    const active = await db
      .prepare(
        `SELECT generation_id, assignment_count, group_count, execution_mode
         FROM commitment_classification_runs WHERE user_id = ?`
      )
      .get(userId) as {
      generation_id: string;
      assignment_count: number;
      group_count: number;
      execution_mode: string;
    };
    return {
      status: "running",
      changed: false,
      generation_id: active.generation_id,
      assignment_count: active.assignment_count,
      group_count: active.group_count,
      memory_count: memories.length,
      used_fallback: active.execution_mode === "fallback",
    };
  }

  const previousGroups = await db
    .prepare(
      `SELECT group_key, group_label, project_id, MAX(updated_at) AS updated_at
       FROM commitment_classifications
       WHERE user_id = ? AND source != 'fallback'
       GROUP BY group_key, group_label, project_id
       ORDER BY updated_at DESC LIMIT 6`
    )
    .all(userId) as Array<{
    group_key: string;
    group_label: string;
    project_id: string | null;
  }>;
  const usedFallback = executionMode === "fallback";
  let assignments: Assignment[];
  try {
    assignments =
      commitments.length === 0
        ? []
        : usedFallback
          ? deterministicAssignments(commitments, projectNames)
          : await modelAssignments(
              provider,
              commitments,
              projects,
              memories,
              previousGroups
            );
  } catch (error) {
    const message = error instanceof Error ? error.message : "classification_failed";
    await db.prepare(
      `UPDATE commitment_classification_runs
       SET status = 'failed', lease_until = NULL, last_error = ?, updated_at = ?
       WHERE user_id = ? AND generation_id = ?`
    ).run(message.slice(0, 240), nowIso(), userId, generationId);
    return {
      status: "failed",
      changed: false,
      generation_id: generationId,
      assignment_count: commitments.length,
      group_count: 0,
      memory_count: memories.length,
      used_fallback: true,
      error: "classification_failed",
    };
  }

  const currentSnapshot = await loadClassificationSnapshot(db, userId);
  if (
    currentSnapshot.inputFingerprint !== inputFingerprint ||
    currentSnapshot.contextFingerprint !== contextFingerprint
  ) {
    await db.prepare(
      `UPDATE commitment_classification_runs
       SET status = 'stale', lease_until = NULL, updated_at = ?
       WHERE user_id = ? AND generation_id = ?`
    ).run(nowIso(), userId, generationId);
    return {
      status: "stale",
      changed: false,
      generation_id: generationId,
      assignment_count: commitments.length,
      group_count: 0,
      memory_count: memories.length,
      used_fallback: true,
    };
  }

  const timestamp = nowIso();
  let applied = false;
  let groupCount = 0;
  await db.transaction(async () => {
    const activeRun = await db
      .prepare(
        `SELECT generation_id, status FROM commitment_classification_runs
         WHERE user_id = ?`
      )
      .get(userId) as { generation_id: string; status: string } | undefined;
    if (activeRun?.generation_id !== generationId || activeRun.status !== "running") {
      return;
    }
    for (const assignment of assignments) {
      await db.prepare(
        `INSERT INTO commitment_classifications
         (commitment_id, user_id, project_id, group_key, group_label, source,
          reason, confidence, classifier_version, commitment_fingerprint,
          context_fingerprint, generation_id, manual_override, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(commitment_id) DO UPDATE SET
           project_id = excluded.project_id,
           group_key = excluded.group_key,
           group_label = excluded.group_label,
           source = excluded.source,
           reason = excluded.reason,
           confidence = excluded.confidence,
           classifier_version = excluded.classifier_version,
           commitment_fingerprint = excluded.commitment_fingerprint,
           context_fingerprint = excluded.context_fingerprint,
           generation_id = excluded.generation_id,
           updated_at = excluded.updated_at
         WHERE commitment_classifications.manual_override = 0
            OR commitment_classifications.project_id IS NOT excluded.project_id`
      ).run(
        assignment.commitment.id,
        userId,
        assignment.commitment.project_id,
        assignment.groupKey,
        assignment.groupLabel,
        usedFallback ? "fallback" : "ai",
        assignment.reason,
        usedFallback ? 0.6 : 0.8,
        CLASSIFIER_VERSION,
        commitmentFingerprint(assignment.commitment),
        contextFingerprint,
        generationId,
        timestamp,
        timestamp
      );
    }
    const grouped = await db
      .prepare(
        `SELECT COUNT(DISTINCT cc.group_key) AS group_count
         FROM commitment_classifications cc
         INNER JOIN commitments c ON c.id = cc.commitment_id
         WHERE cc.user_id = ? AND c.status NOT IN ('completed', 'cancelled')`
      )
      .get(userId) as { group_count: number };
    groupCount = Number(grouped.group_count ?? 0);
    await db.prepare(
      `UPDATE commitment_classification_runs
       SET status = 'ready', lease_until = NULL, assignment_count = ?,
           group_count = ?, last_error = NULL, updated_at = ?
       WHERE user_id = ? AND generation_id = ?`
    ).run(commitments.length, groupCount, timestamp, userId, generationId);
    await writeActionLog(db, {
      user_id: userId,
      actor: "agent",
      action_type: "work_classification_rebuilt",
      summary: actionSummary(
        "work_classification_rebuilt",
        { items: commitments.length, groups: groupCount },
        locale
      ),
      reason: usedFallback
        ? pick(locale, "Project grouping, rebuilt without a model", "AI 不可用时使用可重建的项目分组")
        : pick(
            locale,
            `Named with ${memories.length} active memories from the same projects`,
            `使用 ${memories.length} 条同项目已确认记忆辅助命名与消歧`
          ),
      entity_type: "commitment_classification",
      payload: {
        generation_id: generationId,
        classifier_version: CLASSIFIER_VERSION,
        execution_mode: executionMode,
      },
      reversible: true,
    });
    applied = true;
  })();

  if (!applied) {
    return {
      status: "stale",
      changed: false,
      generation_id: generationId,
      assignment_count: commitments.length,
      group_count: 0,
      memory_count: memories.length,
      used_fallback: true,
    };
  }

  return {
    status: "ready",
    changed: true,
    generation_id: generationId,
    assignment_count: commitments.length,
    group_count: groupCount,
    memory_count: memories.length,
    used_fallback: usedFallback,
  };
}

export async function overrideCommitmentClassification(
  db: SqlDatabase,
  userId: string,
  commitmentId: string,
  groupKey: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<WorkClassificationRow | null> {
  const commitment = await db
    .prepare(
      `SELECT id, title, optimized_content, goal, project_id, updated_at
       FROM commitments
       WHERE id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled')`
    )
    .get(commitmentId, userId) as CommitmentRow | undefined;
  if (!commitment) return null;

  let target = await db
    .prepare(
      `SELECT group_key, group_label
       FROM commitment_classifications
       WHERE user_id = ? AND group_key = ? AND project_id IS ?
       ORDER BY manual_override DESC, updated_at DESC LIMIT 1`
    )
    .get(userId, groupKey, commitment.project_id) as
    | { group_key: string; group_label: string }
    | undefined;
  if (!target && groupKey.startsWith("project:")) {
    const projectId = groupKey.slice("project:".length);
    if (projectId === commitment.project_id) {
      const project = await db
        .prepare(`SELECT name FROM projects WHERE id = ? AND user_id = ?`)
        .get(projectId, userId) as { name: string } | undefined;
      if (project) target = { group_key: groupKey, group_label: project.name };
    }
  }
  if (!target && groupKey === "unassigned" && commitment.project_id == null) {
    target = { group_key: groupKey, group_label: "待归类" };
  }
  if (!target) throw new Error("unknown_work_group");
  const resolvedTarget = target;

  const currentRun = await db
    .prepare(
      `SELECT context_fingerprint FROM commitment_classification_runs
       WHERE user_id = ?`
    )
    .get(userId) as { context_fingerprint: string } | undefined;
  const timestamp = nowIso();
  const generationId = newId("manual-classify");
  return await db.transaction(async () => {
    await db.prepare(
      `INSERT INTO commitment_classifications
     (commitment_id, user_id, project_id, group_key, group_label, source,
      reason, confidence, classifier_version, commitment_fingerprint,
      context_fingerprint, generation_id, manual_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'user', ?, 1, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(commitment_id) DO UPDATE SET
       project_id = excluded.project_id,
       group_key = excluded.group_key,
       group_label = excluded.group_label,
       source = 'user',
       reason = excluded.reason,
       confidence = 1,
       classifier_version = excluded.classifier_version,
       commitment_fingerprint = excluded.commitment_fingerprint,
       context_fingerprint = excluded.context_fingerprint,
       generation_id = excluded.generation_id,
       manual_override = 1,
       updated_at = excluded.updated_at`
    ).run(
      commitmentId,
      userId,
      commitment.project_id,
      resolvedTarget.group_key,
      resolvedTarget.group_label,
      `用户调整到“${resolvedTarget.group_label}”`,
      CLASSIFIER_VERSION,
      commitmentFingerprint(commitment),
      currentRun?.context_fingerprint ?? "manual",
      generationId,
      timestamp,
      timestamp
    );

    await writeActionLog(db, {
      user_id: userId,
      actor: "user",
      action_type: "work_classification_overridden",
      summary: actionSummary(
        "work_classification_overridden",
        { label: resolvedTarget.group_label },
        locale
      ),
      reason: pick(
        locale,
        `Moved to "${resolvedTarget.group_label}"`,
        `用户将事项移动到“${resolvedTarget.group_label}”`
      ),
      entity_type: "commitment",
      entity_id: commitmentId,
      payload: { group_key: resolvedTarget.group_key },
      reversible: true,
    });

    return await db
      .prepare(
        `SELECT commitment_id, group_key, group_label, source, reason, manual_override
         FROM commitment_classifications WHERE commitment_id = ? AND user_id = ?`
      )
      .get(commitmentId, userId) as WorkClassificationRow;
  })();
}
