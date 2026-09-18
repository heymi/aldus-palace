import type { SqlDatabase } from "../db/port.js";

export type CommitmentListRow = Record<string, unknown> & {
  id: string;
  project_id: string | null;
  status: string;
  created_at: string;
  source_input_content: string | null;
  work_group_key: string;
  work_group_label: string;
  work_group_source: "ai" | "user" | "fallback";
  work_group_reason: string | null;
  work_group_manual_override: number;
};

export type CommitmentListPage = {
  items: CommitmentListRow[];
  total: number;
  next_cursor: string | null;
};

const commitmentProjection = `SELECT c.*, ri.content AS source_input_content,
       COALESCE(cc.group_key,
         CASE WHEN c.project_id IS NOT NULL THEN 'project:' || c.project_id ELSE 'unassigned' END
       ) AS work_group_key,
       COALESCE(cc.group_label, p.name, '待归类') AS work_group_label,
       COALESCE(cc.source, 'fallback') AS work_group_source,
       cc.reason AS work_group_reason,
       COALESCE(cc.manual_override, 0) AS work_group_manual_override
FROM commitments c
LEFT JOIN raw_inputs ri
  ON ri.id = c.source_input_id AND ri.user_id = c.user_id
LEFT JOIN projects p
  ON p.id = c.project_id AND p.user_id = c.user_id
LEFT JOIN commitment_classifications cc
  ON cc.commitment_id = c.id AND cc.user_id = c.user_id
  AND cc.project_id IS c.project_id`;

export async function listCommitments(
  db: SqlDatabase,
  userId: string,
  status?: string
): Promise<CommitmentListRow[]> {
  const statusFilter = status ? "AND c.status = ?" : "";
  const statement = db.prepare(
    `${commitmentProjection}
     WHERE c.user_id = ? ${statusFilter}
     ORDER BY c.created_at DESC, c.id DESC`
  );
  return (status
    ? await statement.all(userId, status)
    : await statement.all(userId)) as CommitmentListRow[];
}

function parseCursor(cursor?: string): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const divider = cursor.lastIndexOf("|");
  if (divider <= 0 || divider === cursor.length - 1) return null;
  return {
    createdAt: cursor.slice(0, divider),
    id: cursor.slice(divider + 1),
  };
}

export async function listCommitmentsPage(
  db: SqlDatabase,
  userId: string,
  options: { status?: string; limit?: number; cursor?: string } = {}
): Promise<CommitmentListPage> {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 100)));
  const cursor = parseCursor(options.cursor);
  const conditions = ["c.user_id = ?"];
  const bindings: unknown[] = [userId];
  if (options.status) {
    conditions.push("c.status = ?");
    bindings.push(options.status);
  }
  if (cursor) {
    conditions.push("(c.created_at < ? OR (c.created_at = ? AND c.id < ?))");
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  const rows = await db
    .prepare(
      `${commitmentProjection}
       WHERE ${conditions.join(" AND ")}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ?`
    )
    .all(...bindings, limit + 1) as CommitmentListRow[];
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  const last = items.at(-1) as
    | (CommitmentListRow & { created_at?: string; id?: string })
    | undefined;
  const countSql = options.status
    ? `SELECT COUNT(*) AS count FROM commitments WHERE user_id = ? AND status = ?`
    : `SELECT COUNT(*) AS count FROM commitments WHERE user_id = ?`;
  const countBindings = options.status ? [userId, options.status] : [userId];
  const count = await db.prepare(countSql).get(...countBindings) as { count: number };
  return {
    items,
    total: Number(count.count ?? 0),
    next_cursor:
      hasNext && last?.created_at && last.id
        ? `${last.created_at}|${last.id}`
        : null,
  };
}
