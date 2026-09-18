/**
 * Project recognition from free text.
 *
 * Product rules (V1):
 * 1. Only match existing Projects (or return a *suggestion* to create).
 * 2. Never silently auto-create a Project from input.
 * 3. Prefer explicit name / alias mention over weak keyword guesses.
 */

export type ProjectRow = {
  id: string;
  name: string;
  description?: string | null;
  aliases?: string | null;
  status?: string;
};

export type ProjectMatch =
  | { kind: "matched"; project_id: string; project_name: string; score: number; reason: string }
  | { kind: "none" };

export type ProjectCreateSuggestion = {
  suggested_name: string;
  reason: string;
};

function parseAliases(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(String).filter(Boolean);
  } catch {
    // comma-separated
  }
  return raw
    .split(/[,，;/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** True if string is primarily CJK. */
function isCjk(s: string): boolean {
  return /^[\u4e00-\u9fff·・\s]+$/.test(s.trim());
}

/**
 * Expand an alias into matchable tokens.
 * e.g. 「照片相册」→ 照片相册, 相册, 照片
 * so user text saying only「相册」can still link.
 */
export function expandAliasTokens(alias: string): string[] {
  const a = alias.trim();
  if (!a) return [];
  const out = new Set<string>([a]);
  if (isCjk(a) && a.length >= 3) {
    out.add(a.slice(-2)); // head noun often last 2: 相册
    out.add(a.slice(0, 2)); // modifier: 照片
    if (a.length >= 4) {
      out.add(a.slice(-3));
      out.add(a.slice(0, 3));
    }
  }
  // multi-word Latin: "Photo Album" → keep full + each word >= 4
  if (!isCjk(a) && /\s/.test(a)) {
    for (const w of a.split(/\s+/)) {
      if (w.length >= 4) out.add(w);
    }
  }
  return [...out].filter((t) => t.length >= 2);
}

/**
 * Score how strongly `content` mentions this project.
 */
export function scoreProjectMention(
  content: string,
  project: ProjectRow
): { score: number; reason: string } {
  const text = content;
  const lower = normalize(content);
  const name = project.name.trim();
  if (!name) return { score: 0, reason: "" };

  const nameLower = normalize(name);
  // Exact / contiguous name
  if (lower.includes(nameLower)) {
    return { score: 100, reason: `提到项目名「${name}」` };
  }

  // Alias list (full + expanded tokens for CJK compounds)
  for (const a of parseAliases(project.aliases)) {
    const tokens = expandAliasTokens(a);
    for (const tok of tokens) {
      const al = normalize(tok);
      if (al.length < 2) continue;
      if (lower.includes(al) || text.includes(tok)) {
        const full = tok === a || normalize(a) === al;
        return {
          score: full ? 90 : 78,
          reason: full
            ? `提到别名「${a}」→ ${name}`
            : `提到别名相关词「${tok}」（别名「${a}」）→ ${name}`,
        };
      }
    }
  }

  // Token overlap for multi-word names (e.g. "Acme Mail")
  const tokens = nameLower.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length >= 2 && tokens.every((t) => lower.includes(t))) {
    return { score: 80, reason: `命中名称关键词 ${tokens.join("+")}` };
  }

  // Single distinctive token length >= 4 (e.g. "Acme")
  if (tokens.length === 1 && tokens[0].length >= 4 && lower.includes(tokens[0])) {
    return { score: 85, reason: `提到「${name}」关键词` };
  }
  // CJK names: 2+ chars exact already handled; try without spaces
  if (name.length >= 2 && !/[a-z]/i.test(name) && text.includes(name)) {
    return { score: 100, reason: `提到项目名「${name}」` };
  }

  // Description keywords (weak)
  const desc = (project.description || "").trim();
  if (desc.length >= 4) {
    const kws = desc
      .split(/[\s,，、/|]+/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 4)
      .slice(0, 6);
    let hits = 0;
    for (const k of kws) {
      if (lower.includes(normalize(k))) hits++;
    }
    if (hits >= 2) {
      return { score: 40, reason: `描述关键词弱匹配 (${hits})` };
    }
  }

  return { score: 0, reason: "" };
}

export function matchProjectFromContent(
  content: string,
  projects: ProjectRow[],
  minScore = 70
): ProjectMatch {
  const active = projects.filter((p) => (p.status ?? "active") === "active");
  let best: { p: ProjectRow; score: number; reason: string } | null = null;
  for (const p of active) {
    const { score, reason } = scoreProjectMention(content, p);
    if (score >= minScore && (!best || score > best.score)) {
      best = { p, score, reason };
    }
  }
  if (!best) return { kind: "none" };
  return {
    kind: "matched",
    project_id: best.p.id,
    project_name: best.p.name,
    score: best.score,
    reason: best.reason,
  };
}

/**
 * Heuristic: user might be introducing a new product name worth creating.
 * Only *suggest* — never create.
 *
 * Patterns:
 * - "做 Acme 的…" / "Acme 应该…"
 * - Latin CapWord 4+ letters appearing as product-like
 */
export function suggestNewProjectName(
  content: string,
  existing: ProjectRow[]
): ProjectCreateSuggestion | null {
  const existingNames = new Set(existing.map((p) => normalize(p.name)));
  for (const p of existing) {
    for (const a of parseAliases(p.aliases)) existingNames.add(normalize(a));
  }

  // Explicit: 项目叫 X / 新项目 X / 叫它 X
  const explicit =
    content.match(/(?:新项目|项目[叫名称是为：:]\s*)([A-Za-z][A-Za-z0-9_-]{2,32}|[\u4e00-\u9fff]{2,12})/) ||
    content.match(/创建项目\s*([A-Za-z][A-Za-z0-9_-]{2,32}|[\u4e00-\u9fff]{2,12})/);
  if (explicit?.[1] && !existingNames.has(normalize(explicit[1]))) {
    return {
      suggested_name: explicit[1],
      reason: "输入中像在命名新项目",
    };
  }

  // Capitalized product tokens (Acme, Notion-like)
  const caps = content.match(/\b([A-Z][a-zA-Z0-9]{3,24})\b/g) || [];
  const skip = new Set([
    "Mac",
    "iPhone",
    "iOS",
    "iPad",
    "API",
    "AI",
    "HTTP",
    "JSON",
    "TODO",
    "This",
    "That",
    "When",
    "With",
  ]);
  for (const c of caps) {
    if (skip.has(c)) continue;
    if (existingNames.has(normalize(c))) continue;
    // Prefer if near 产品/项目/版/App
    if (new RegExp(`${c}.{0,12}(产品|项目|版|App|应用|客户端)`).test(content) ||
        new RegExp(`(产品|项目|版|App|应用|客户端).{0,12}${c}`).test(content) ||
        new RegExp(`${c}(的|应该|需要|定位)`).test(content)) {
      return {
        suggested_name: c,
        reason: `提到可能的产品名「${c}」，可创建为 Project`,
      };
    }
  }

  return null;
}
