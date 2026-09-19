/**
 * Rule-based memory candidate extraction.
 *
 * Runs with no model, in both supported languages. Patterns match meaning, not
 * a single language: the same rule fires for "keep it simple" and 「不要做太复杂」,
 * and the stored content follows the user's locale.
 */

import { pick, type Locale } from "./locale.js";

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
    /简洁|简单|不复杂|避免复杂|界面要简单|不喜欢复杂|simpl|minimal|complex/.test(c) &&
    (type === "preference" || type === "principle")
  ) {
    return `preference|prefer_simplicity`;
  }
  if (/隐私|privacy/.test(c)) return `${type}|privacy`;
  if (/mac.?only|仅mac|不做windows|no windows/.test(c)) return `${type}|mac_only`;
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

/** Rules that hold regardless of language. */
const DURABLE_MARKER =
  /以后|永远|一直|从此|原则|坚持|不做|不要|必须|避免|from now on|going forward|always|never|as a rule|my principle|prefer|avoid/i;

/** Temporary states: a mood is not a belief. */
const TEMPORARY_STATE =
  /现在有点累|今天累|下午不想|有点累|今天不想|心情不好|累了|tired|exhausted|not in the mood|feeling low|rough day|burnt out/i;

/** One-off creative work: an ad script is not a principle. */
const ONE_OFF_CREATIVE =
  /广告|创意|文案|脚本|分镜|拍摄|slogan|tagline|黑屏字幕|真人出镜|弹钢琴|隐喻场景|ad copy|storyboard|shoot|creative brief/i;
/** Framings that turn a creative note into something durable. */
const DURABLE_FRAMING = /定位是|我们的原则|以后都|一律|必须|坚持|永远不|positioning|our principle|from now on|as a rule/i;

type Rule = {
  id: string;
  re: RegExp;
  type: string;
  source: string;
  confidence: number;
  importance: number;
  concepts: string[];
  content: Record<Locale, string>;
};

const SIMPLICITY: Rule = {
  id: "simplicity",
  re: /不喜欢复杂|不要做太复杂|界面要简单|喜欢简洁|不要复杂|prefer simple|keep it simple|keep things simple|not too complex|avoid complexity|simpler|minimal/i,
  type: "preference",
  source: "user_explicit",
  confidence: 0.88,
  importance: 0.85,
  concepts: ["simplicity"],
  content: {
    en: "Prefers simple products and interfaces; avoids complexity",
    "zh-CN": "喜欢简洁、简单的产品与界面，避免复杂",
  },
};

const AUTONOMY: Rule = {
  id: "autonomy",
  re: /辅助而不是主导|assist,?\s*not\s*dominate|AI should assist|support me,?\s*not\s*drive/i,
  type: "principle",
  source: "user_explicit",
  confidence: 0.9,
  importance: 0.9,
  concepts: ["assist-not-dominate", "simplicity"],
  content: {
    en: "AI should assist, not dominate",
    "zh-CN": "AI should assist, not dominate（AI 辅助而非主导）",
  },
};

const PRIVACY: Rule = {
  id: "privacy",
  re: /隐私|privacy|data protection|private by default/i,
  type: "principle",
  source: "user_explicit",
  confidence: 0.8,
  importance: 0.85,
  concepts: ["privacy"],
  content: {
    en: "Values privacy and the protection of user data",
    "zh-CN": "重视隐私与用户数据保护",
  },
};

const NATIVE: Rule = {
  id: "native",
  re: /\bnative\b|原生/i,
  type: "preference",
  source: "ai_inferred",
  confidence: 0.75,
  importance: 0.7,
  concepts: ["native experience"],
  content: {
    en: "Prefers native experiences and platform consistency",
    "zh-CN": "偏好原生体验与平台一致性",
  },
};

const PLATFORM: Rule = {
  id: "platform",
  re: /mac\s*only|mac-only|不做\s*windows|保持\s*mac|仅限\s*mac|no windows|stay on mac|only on mac/i,
  type: "decision",
  source: "ai_inferred",
  confidence: 0.78,
  importance: 0.8,
  concepts: ["mac-only"],
  content: {
    en: "Leans toward Mac-only; avoids Windows",
    "zh-CN": "倾向保持 Mac-only / 不做 Windows",
  },
};

/** Structural rule: project positioning statements. */
const PROJECT_CONTEXT = /([A-Za-z][A-Za-z0-9]{2,24}|[\u4e00-\u9fff]{2,12})\s*(?:的定位是|定位是|是一款|是一个|is a|is an|positioning)/;

const RULES: Rule[] = [AUTONOMY, SIMPLICITY, PRIVACY, NATIVE, PLATFORM];

export function looksLikeOneOffCreative(text: string): boolean {
  return ONE_OFF_CREATIVE.test(text) && !DURABLE_FRAMING.test(text);
}

export function extractMemoryCandidates(
  input: string,
  locale: Locale = "en"
): MemoryCandidateDraft[] {
  const out: MemoryCandidateDraft[] = [];
  const evidence = input.slice(0, 240);

  // A mood stays a mood unless the sentence also carries a durable marker.
  if (TEMPORARY_STATE.test(input) && !DURABLE_MARKER.test(input)) {
    return [];
  }

  for (const rule of RULES) {
    if (!rule.re.test(input)) continue;
    out.push({
      type: rule.type,
      content: pick(locale, rule.content.en, rule.content["zh-CN"]),
      source: rule.source,
      confidence: rule.confidence,
      evidence,
      concept_names: rule.concepts,
      importance: rule.importance,
    });
  }

  // Project context: only when the sentence states something durable.
  const projCtx = input.match(PROJECT_CONTEXT);
  if (projCtx && !looksLikeOneOffCreative(input)) {
    out.push({
      type: "project_context",
      content: pick(
        locale,
        `${projCtx[1]}: ${projCtx[2]?.trim() ?? ""}`,
        `${projCtx[1]}：${projCtx[2]?.trim() ?? ""}`
      ),
      source: "user_explicit",
      confidence: 0.82,
      evidence,
      concept_names: [projCtx[1]],
      importance: 0.75,
    });
  }

  // Experience: durable feedback, not one complaint in a brainstorm.
  const repeated =
    /总是|一直|多次|反复|普遍|always|repeatedly|keeps? |again and again|several times/i;
  const feedback = /用户不喜欢|用户讨厌|反馈.*不喜欢|disliked|users? (?:don't|do not) like/i;
  if (feedback.test(input) && repeated.test(input)) {
    out.push({
      type: "experience",
      content: input.length > 120 ? input.slice(0, 120) + "…" : input,
      source: "ai_inferred",
      confidence: 0.7,
      evidence,
      concept_names: ["user feedback"],
      importance: 0.65,
    });
  }

  const seen = new Set<string>();
  return out.filter((memory) => {
    const key = `${memory.type}|${memory.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Filter candidates before they reach the confirmation list.
 * Keeps low-value noise out of the memory surface entirely.
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
  const kept = candidates.filter((memory) => {
    const confidence = memory.confidence ?? 0.5;
    if (confidence < 0.72) {
      skipped.push(`low_confidence:${memory.type}`);
      return false;
    }
    if (looksLikeOneOffCreative(memory.content) || looksLikeOneOffCreative(input)) {
      if (memory.type === "principle" || memory.type === "preference") {
        if (/辅助|主导|隐私|简洁|不喜欢复杂|mac-only|原生|assist|privacy|simpl|native/i.test(memory.content)) {
          return true;
        }
      }
      skipped.push(`one_off_creative:${memory.type}`);
      return false;
    }
    if (
      memory.type === "project_context" &&
      !opts?.hasProjectBrief &&
      memory.content.length > 160
    ) {
      skipped.push("project_context_too_long_without_brief");
      return false;
    }
    if (memory.type === "experience" && memory.source === "ai_inferred" && confidence < 0.85) {
      skipped.push("experience_inferred");
      return false;
    }
    return true;
  });
  return { kept, skipped };
}

/**
 * Detect a "here is the background for X" paragraph and return its body.
 * e.g. "Acme background: …" / 「Acme 背景：…」
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
      `(?:关于\\s*)?${escaped}\\s*(?:的)?\\s*(?:项目)?\\s*(?:背景|简介|说明|brief|产品说明|产品背景|background|context)\\s*[:：]?\\s*([\\s\\S]{20,})`,
      "i"
    );
    const m = trimmed.match(re);
    if (m?.[1]) {
      return { projectName: name, briefChunk: m[1].trim() };
    }
    const re2 = new RegExp(
      `^(?:这是|关于|here is|this is)\\s*${escaped}\\s*[:：]?\\s*([\\s\\S]{40,})`,
      "i"
    );
    const m2 = trimmed.match(re2);
    if (m2?.[1]) {
      return { projectName: name, briefChunk: m2[1].trim() };
    }
  }
  return null;
}

/** Merge a new brief chunk into an existing brief. */
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
