/**
 * Rule-based memory candidate extraction (Foundation).
 * Expand patterns without requiring LLM.
 */

export type MemoryCandidateDraft = {
  type: string;
  content: string;
  source: string;
  confidence: number;
  evidence: string;
  concept_names: string[];
  importance?: number;
};

/** Normalize for near-duplicate detection (EN/ZH variants of same idea). */
export function normalizeMemoryKey(type: string, content: string): string {
  let c = content
    .toLowerCase()
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[，,。！？\s·:：、]+/g, "")
    .trim();
  // Canonical keys for known principles/preferences
  if (
    /assist.*dominate|辅助.*主导|不主导|不应该主导/.test(c) ||
    /aishouldassistnotdominate/.test(c)
  ) {
    return `${type}|ai_assist_not_dominate`;
  }
  if (
    /简洁|简单|不复杂|避免复杂|界面要简单|不喜欢复杂/.test(c) &&
    (type === "preference" || type === "principle")
  ) {
    return `preference|prefer_simplicity`;
  }
  if (/隐私|privacy/.test(c)) return `${type}|privacy`;
  if (/mac.?only|仅mac|不做windows/.test(c)) return `${type}|mac_only`;
  return `${type}|${c.slice(0, 48)}`;
}

export function isSimilarMemory(
  typeA: string,
  contentA: string,
  typeB: string,
  contentB: string
): boolean {
  return normalizeMemoryKey(typeA, contentA) === normalizeMemoryKey(typeB, contentB);
}

export function extractMemoryCandidates(input: string): MemoryCandidateDraft[] {
  const out: MemoryCandidateDraft[] = [];
  const evidence = input.slice(0, 240);

  // Temporary — no long-term memory
  if (
    /现在有点累|今天累|下午不想|有点累/.test(input) &&
    !/以后|总是|一直|偏好|喜欢|不喜欢复杂/.test(input)
  ) {
    return [];
  }

  if (/辅助而不是主导|assist,?\s*not\s*dominate|AI should assist/i.test(input)) {
    out.push({
      type: "principle",
      content: "AI should assist, not dominate（AI 辅助而非主导）",
      source: "user_explicit",
      confidence: 0.9,
      evidence,
      concept_names: ["AI 辅助而非主导", "简洁"],
      importance: 0.9,
    });
  }

  if (/不喜欢复杂|不要做太复杂|界面要简单|喜欢简洁|prefer simple/i.test(input)) {
    out.push({
      type: "preference",
      content: "喜欢简洁、简单的产品与界面，避免复杂",
      source: "user_explicit",
      confidence: 0.88,
      evidence,
      concept_names: ["简洁"],
      importance: 0.85,
    });
  }

  if (/隐私|privacy.?first|注重隐私/i.test(input)) {
    out.push({
      type: "principle",
      content: "重视隐私与用户数据保护",
      source: /明确|一定|坚持/.test(input) ? "user_explicit" : "ai_inferred",
      confidence: 0.8,
      evidence,
      concept_names: ["隐私"],
      importance: 0.85,
    });
  }

  if (/原生|native\s*app|native experience/i.test(input) && /体验|产品|app|应用/i.test(input)) {
    out.push({
      type: "preference",
      content: "偏好原生体验与平台一致性",
      source: "ai_inferred",
      confidence: 0.75,
      evidence,
      concept_names: ["原生体验"],
      importance: 0.7,
    });
  }

  if (/mac\s*only|保持\s*mac|不做\s*windows|仅限\s*mac/i.test(input)) {
    out.push({
      type: "decision",
      content: "倾向保持 Mac-only / 不做 Windows",
      source: "ai_inferred",
      confidence: 0.78,
      evidence,
      concept_names: ["Mac-only"],
      importance: 0.8,
    });
  }

  // Project context: "X 定位是 / X 是 …" — only if reads as durable product truth
  const projCtx = input.match(
    /([A-Za-z][A-Za-z0-9]{2,24}|[\u4e00-\u9fff]{2,12})\s*(?:的定位是|定位是|是一款|是一个)\s*([^。！\n]{4,80})/
  );
  if (projCtx && !looksLikeOneOffCreative(input)) {
    out.push({
      type: "project_context",
      content: `${projCtx[1]}：${projCtx[2].trim()}`,
      source: "user_explicit",
      confidence: 0.82,
      evidence,
      concept_names: [projCtx[1]],
      importance: 0.75,
    });
  }

  // Experience: only durable feedback patterns (not one complaint in a brainstorm)
  if (
    /用户不喜欢|用户讨厌|反馈.*不喜欢|disliked/i.test(input) &&
    /总是|一直|多次|反复|普遍/.test(input)
  ) {
    out.push({
      type: "experience",
      content: input.length > 120 ? input.slice(0, 120) + "…" : input,
      source: "ai_inferred",
      confidence: 0.7,
      evidence,
      concept_names: ["用户反馈"],
      importance: 0.65,
    });
  }

  // Dedupe by type+content
  const seen = new Set<string>();
  return out.filter((m) => {
    const k = `${m.type}|${m.content}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** One-off ads/creative exploration should be Thoughts, not long-term memory. */
export function looksLikeOneOffCreative(text: string): boolean {
  return (
    /广告|创意|文案|脚本|分镜|拍摄|slogan|tagline|黑屏字幕|真人出镜|弹钢琴|隐喻场景/i.test(
      text
    ) && !/定位是|我们的原则|以后都|一律|必须|坚持|永远不/.test(text)
  );
}

/**
 * Strategy A: AI/rules filter hard; survivors stay candidates for one-tap confirm.
 * Skip temporary, one-off creative, and low-confidence noise.
 */
export function filterMemoryCandidatesForConfirm(
  candidates: MemoryCandidateDraft[],
  opts?: {
    input?: string;
    hasProjectBrief?: boolean;
  }
): { kept: MemoryCandidateDraft[]; skipped: string[] } {
  const skipped: string[] = [];
  const input = opts?.input ?? "";
  const kept = candidates.filter((m) => {
    const conf = m.confidence ?? 0.5;
    if (conf < 0.72) {
      skipped.push(`low_confidence:${m.type}`);
      return false;
    }
    if (looksLikeOneOffCreative(m.content) || looksLikeOneOffCreative(input)) {
      // Allow durable principles even inside a creative paste
      if (m.type === "principle" || m.type === "preference") {
        if (/辅助|主导|隐私|简洁|不喜欢复杂|Mac-only|原生/.test(m.content)) {
          return true;
        }
      }
      skipped.push(`one_off_creative:${m.type}`);
      return false;
    }
    // project_context without stable framing → skip when no brief (avoid junk)
    if (
      m.type === "project_context" &&
      !opts?.hasProjectBrief &&
      m.content.length > 160
    ) {
      skipped.push("project_context_too_long_without_brief");
      return false;
    }
    // Inferred experience is noisy
    if (m.type === "experience" && m.source === "ai_inferred" && conf < 0.85) {
      skipped.push("experience_inferred");
      return false;
    }
    return true;
  });
  return { kept, skipped };
}

/**
 * Detect "update project brief" intent and extract body.
 * e.g. "Acme 背景：…" / "关于 Acme 的产品说明：…"
 */
export function extractProjectBriefUpdate(
  input: string,
  projectNames: string[]
): { projectName: string; briefChunk: string } | null {
  const trimmed = input.trim();
  if (trimmed.length < 24) return null;

  for (const name of projectNames) {
    if (!name || name.length < 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:关于\\s*)?${escaped}\\s*(?:的)?\\s*(?:项目)?\\s*(?:背景|简介|说明|brief|产品说明|产品背景)\\s*[:：]?\\s*([\\s\\S]{20,})`,
      "i"
    );
    const m = trimmed.match(re);
    if (m?.[1]) {
      return { projectName: name, briefChunk: m[1].trim() };
    }
    // "这是 Acme：…" long product paragraph
    const re2 = new RegExp(
      `^(?:这是|关于)\\s*${escaped}\\s*[:：]?\\s*([\\s\\S]{40,})`,
      "i"
    );
    const m2 = trimmed.match(re2);
    if (m2?.[1]) {
      return { projectName: name, briefChunk: m2[1].trim() };
    }
  }
  return null;
}

/** Merge new brief chunk into existing brief (append if not already contained). */
export function mergeProjectBrief(
  existing: string | null | undefined,
  chunk: string
): string {
  const prev = (existing || "").trim();
  const next = chunk.trim();
  if (!next) return prev;
  if (!prev) return next;
  if (prev.includes(next.slice(0, Math.min(80, next.length)))) return prev;
  return `${prev}\n\n---\n\n${next}`;
}
