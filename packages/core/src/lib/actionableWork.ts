/**
 * Detect / ensure "actionable work" (commitments) in a language-agnostic way.
 *
 * Strategy:
 * 1. Prefer model `intent.has_actionable_work` + `work_titles` (any language).
 * 2. Fallback: multilingual + structural signals (not a single-language keyword list).
 * 3. Never invent work from pure mood / pure research with no change language.
 */

export type ActionableSignal = {
  /** 0–1 rough score */
  score: number;
  /** Why we think it's work (debug / warnings) */
  reasons: string[];
  /** Suggested short title if model omitted commitment */
  suggestedTitle: string | null;
};

/** Normalize for title / dedupe */
function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clipTitle(s: string, max = 48): string {
  const t = collapseWs(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

/**
 * Multilingual necessity / delivery / build signals.
 * Intentionally small, high-precision families — not a dictionary of every verb.
 */
const WORK_SIGNAL_RES: Array<{ re: RegExp; reason: string; weight: number }> = [
  // Necessity / obligation (ZH / EN / JA-ish / ES-ish light)
  {
    re: /需要|必须|得先|要做|应该做|得做|务必|得把|得有|应当/i,
    reason: "necessity_zh",
    weight: 0.35,
  },
  {
    re: /\b(need to|needs?|must|have to|should|gotta|required to|ought to)\b/i,
    reason: "necessity_en",
    weight: 0.35,
  },
  {
    re: /しなければならない|する必要がある|をやる|しないと/i,
    reason: "necessity_ja",
    weight: 0.35,
  },
  {
    re: /\b(hay que|necesito|debemos|tenemos que)\b/i,
    reason: "necessity_es",
    weight: 0.3,
  },

  // Build / ship / change product
  {
    re: /实现|开发|做成|做一个|加一个|加上|新增|创建|改成|改掉|修复|优化|强化|重构|接入|支持|上线|发版|发布|首发|出一版|推进/i,
    reason: "build_zh",
    weight: 0.4,
  },
  {
    re: /\b(implement|build|add|create|ship|launch|release|fix|improve|enhance|refactor|integrate|support|roll out|mvp|v1)\b/i,
    reason: "build_en",
    weight: 0.4,
  },
  {
    re: /実装|開発|追加|修正|改善|リリース|公開|出荷/i,
    reason: "build_ja",
    weight: 0.4,
  },

  // Feature / surface nouns often paired with work
  {
    re: /功能|页面|模块|接口|流程|按钮|设置|搜索|筛选|通知|同步|登录|支付/i,
    reason: "feature_noun_zh",
    weight: 0.2,
  },
  {
    re: /\b(feature|page|screen|module|api|flow|button|settings?|search|filter|notification|sync|login|auth|pay(ment)?)\b/i,
    reason: "feature_noun_en",
    weight: 0.2,
  },

  // First release / go-live family (any language surface forms we care about)
  {
    re: /首发|首次发布|第一次上线|公测|内测|发版|上线日|开卖/i,
    reason: "release_zh",
    weight: 0.45,
  },
  {
    re: /\b(first release|initial release|launch day|go[- ]live|public beta|soft launch|general availability|\bGA\b|\bMVP\b|\bv1\b)\b/i,
    reason: "release_en",
    weight: 0.45,
  },
  {
    re: /初回リリース|ローンチ|公開開始/i,
    reason: "release_ja",
    weight: 0.45,
  },
];

/** Strong "not work" — pure state / pure theory */
const NON_WORK_RES: RegExp[] = [
  /^(有点|今天|现在).{0,8}(累|烦|开心|无聊)/,
  /\b(just thinking|random thought|fyi only)\b/i,
  /纯分享|仅记录|随便记|不需要做|不用做|先不实现/,
];

/**
 * Structural: short directive line that looks like a backlog item.
 * Language-agnostic length + punctuation shape.
 */
function looksLikeBacklogLine(text: string): boolean {
  const t = collapseWs(text);
  if (t.length < 6 || t.length > 160) return false;
  // Single sentence-ish
  const sentences = t.split(/[。！？.!?]\s*/).filter(Boolean);
  if (sentences.length > 3) return false;
  // Not a long essay paste
  if ((t.match(/\n/g) || []).length > 4) return false;
  return true;
}

export function detectActionableWork(input: string): ActionableSignal {
  const text = input.trim();
  const reasons: string[] = [];
  let score = 0;

  if (!text) {
    return { score: 0, reasons: [], suggestedTitle: null };
  }

  if (NON_WORK_RES.some((re) => re.test(text))) {
    return { score: 0, reasons: ["non_work_override"], suggestedTitle: null };
  }

  for (const { re, reason, weight } of WORK_SIGNAL_RES) {
    if (re.test(text)) {
      score += weight;
      reasons.push(reason);
    }
  }

  if (looksLikeBacklogLine(text)) {
    score += 0.1;
    reasons.push("backlog_shape");
  }

  // Cap
  score = Math.min(1, score);

  // Need both a "drive" (necessity/build/release) and preferably a feature-ish noun,
  // OR a strong release signal alone.
  const hasDrive = reasons.some((r) =>
    /necessity_|build_|release_/.test(r)
  );
  const hasFeature = reasons.some((r) => /feature_noun_/.test(r));
  const hasRelease = reasons.some((r) => /release_/.test(r));

  if (!hasDrive && !hasRelease) {
    score = Math.min(score, 0.25);
  }
  if (hasDrive && hasFeature) {
    score = Math.max(score, 0.72);
  }
  if (hasRelease && hasDrive) {
    score = Math.max(score, 0.8);
  }

  const suggestedTitle =
    score >= 0.55 ? suggestWorkTitle(text) : null;

  return { score, reasons, suggestedTitle };
}

function mostlyLatin(s: string): boolean {
  const latin = (s.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  const cjk = (s.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  return latin >= cjk && latin > 0;
}

/**
 * Prefer executable title; language of user input preserved when possible.
 * ZH → 「推进：…」; EN → keep natural imperative / drop "need to".
 */
export function suggestWorkTitle(input: string, projectName?: string | null): string {
  const t = collapseWs(input);
  // Strip leading chat filler (multi-lang light)
  let body = t
    .replace(
      /^(我觉得|我认为|我想|记一下|需求[:：]?\s*|note[:：]?\s*|todo[:：]?\s*)/i,
      ""
    )
    .trim();

  // First clause
  body = body.split(/[。！？\n]/)[0] ?? body;
  body = body.split(/[；;]/)[0] ?? body;

  // If already starts with work prefix, keep
  if (/^推进[:：]/.test(body) || /^(ship|build|implement|do)\b/i.test(body)) {
    return clipTitle(body);
  }

  // EN: "need to X" → "X"
  body = body.replace(/^(i\s+)?(need to|have to|must|should)\s+/i, "");
  // ZH: drop bare 需要 at start
  body = body.replace(/^需要\s*/, "");

  const latin = mostlyLatin(body);
  if (latin) {
    // Optional project tag without forcing Chinese "推进"
    if (projectName && !new RegExp(projectName, "i").test(body)) {
      return clipTitle(`${projectName}: ${body}`);
    }
    // Capitalize first letter lightly
    if (/^[a-z]/.test(body)) {
      body = body.charAt(0).toUpperCase() + body.slice(1);
    }
    return clipTitle(body);
  }

  if (/^推进/.test(body)) return clipTitle(body);
  if (projectName && !new RegExp(projectName, "i").test(body)) {
    return clipTitle(`推进：${projectName} ${body}`);
  }
  return clipTitle(`推进：${body}`);
}

export type ModelIntent = {
  has_actionable_work?: boolean | null;
  work_titles?: string[] | null;
};

/**
 * Merge model intent + heuristic. Returns titles that should become commitments
 * when the model forgot to emit them.
 */
export function missingCommitmentTitles(opts: {
  input: string;
  modelIntent?: ModelIntent | null;
  existingCommitmentTitles: string[];
  thoughtTitles: string[];
  projectName?: string | null;
}): string[] {
  const {
    input,
    modelIntent,
    existingCommitmentTitles,
    thoughtTitles,
    projectName,
  } = opts;

  if (existingCommitmentTitles.length > 0) {
    return []; // model already created work items
  }

  const heuristic = detectActionableWork(input);
  const modelSaysWork = modelIntent?.has_actionable_work === true;
  const modelTitles = (modelIntent?.work_titles ?? [])
    .map((t) => collapseWs(String(t || "")))
    .filter((t) => t.length >= 2);

  // Threshold: model flag OR strong heuristic
  const shouldEnsure =
    modelSaysWork || heuristic.score >= 0.55 || modelTitles.length > 0;

  if (!shouldEnsure) return [];

  const titles: string[] = [];
  if (modelTitles.length) {
    titles.push(...modelTitles.map((t) =>
      /^推进|ship|build|implement/i.test(t) ? t : suggestWorkTitle(t, projectName)
    ));
  } else if (heuristic.suggestedTitle) {
    titles.push(heuristic.suggestedTitle);
  } else if (thoughtTitles[0]) {
    titles.push(suggestWorkTitle(thoughtTitles[0], projectName));
  } else {
    titles.push(suggestWorkTitle(input, projectName));
  }

  // Dedupe
  const seen = new Set<string>();
  return titles.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
