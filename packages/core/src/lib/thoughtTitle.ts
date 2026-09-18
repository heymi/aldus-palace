/**
 * Short display title for Thoughts (requirements / ideas).
 * `title` = short label; `content` = system understanding summary;
 * full user paste lives only in raw_inputs (shown as 原始输入).
 */

export function makeThoughtTitle(content: string, maxLen = 40): string {
  let t = content.trim().replace(/\s+/g, " ");
  if (!t) return "未命名想法";

  // Known product-requirement shapes (local rules)
  if (/推送|通知/.test(t) && /(Mac|iPhone|iOS|桌面)/i.test(t)) {
    return clip("邮件通知：跨端推送提醒与预览", maxLen);
  }
  if (/应该具备|需要具备|希望具备|应当/.test(t)) {
    const m = t.match(/(?:应该|需要|希望|应当)具备([^，。；\n]{2,40})/);
    if (m?.[1]) return clip(m[1].trim(), maxLen);
  }
  if (/官网/.test(t) && /优化|调整|设计/.test(t)) {
    return clip("官网优化/设计", maxLen);
  }

  // First clause
  const firstSentence = t.split(/[。！？\n]/)[0] ?? t;
  let clause = firstSentence.split(/[，,；;]/)[0] ?? firstSentence;
  clause = clause.replace(/^(我觉得|我认为|最近|想到|记一下|需求[:：]?)/, "").trim();
  if (!clause) clause = firstSentence.trim();
  return clip(clause, maxLen);
}

function clip(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

/**
 * Prefer model summary when it looks like real understanding (effect-first).
 * Still reject empty / near-full verbatim dumps of the raw paste.
 */
export function preferModelSummary(
  raw: string,
  modelHint?: string
): string | null {
  const rawT = raw.trim();
  const hint = (modelHint ?? "").trim();
  if (!hint || hint.length < 12) return null;

  // Reject near-copy of full raw
  if (rawT.length > 80 && hint.length >= rawT.length * 0.85) return null;
  if (rawT.length > 40 && hint === rawT) return null;

  // Reject low-value first/last reassembly (model or local)
  if (isLowValueSummary(rawT, hint)) return null;

  // Accept solid model writing (Chinese or EN)
  if (hint.length >= 16) return hint;
  return null;
}

/** Numbered (1. / 1) / 1、) or bullet steps in a tip-style paste */
export function extractSteps(raw: string): string[] {
  const numbered = [
    ...raw.matchAll(/(?:^|\n)\s*\d+[\.\)、]\s*(.+)/g),
  ].map((m) => m[1].replace(/\s+/g, " ").trim());
  if (numbered.length >= 2) return numbered.filter(Boolean);

  const bullets = [
    ...raw.matchAll(/(?:^|\n)\s*[•\-\*·]\s*(.+)/g),
  ].map((m) => m[1].replace(/\s+/g, " ").trim());
  return bullets.filter(Boolean);
}

/**
 * True when "系统理解" is still just replaying the paste hook + punchline
 * (or missing step abstraction on multi-step tips).
 */
export function isLowValueSummary(raw: string, summary: string): boolean {
  const rawT = raw.trim();
  const s = summary.trim();
  if (!s) return true;

  const lines = rawT
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLine = lines[0] || "";
  const lastLine = lines[lines.length - 1] || "";
  const steps = extractSteps(rawT);

  // Hook openers as "要点" are never understanding
  if (
    /要点[：:]\s*(我喜欢|I love|Check out|看看这个|分享一个|这个全新)/i.test(s)
  ) {
    return true;
  }

  // Classic bad template: 要点=first + 联想=last, no steps/mechanism
  const hasYaodian = /要点[：:]/.test(s);
  const hasLianxiang = /联想\/结论[：:]|联想[：:]|结论[：:]/.test(s);
  if (hasYaodian && hasLianxiang && steps.length >= 2) {
    const firstHit =
      firstLine.length >= 8 && s.includes(firstLine.slice(0, Math.min(18, firstLine.length)));
    const lastHit =
      lastLine.length >= 8 && s.includes(lastLine.slice(0, Math.min(18, lastLine.length)));
    if (firstHit && lastHit && !/机制|步骤|迁移|受众|列举/.test(s)) {
      return true;
    }
  }

  // Multi-step tip but summary never surfaces steps/mechanism
  if (steps.length >= 3 && s.length < 120 && !/机制|步骤|列举|1\.|①/.test(s)) {
    return true;
  }

  // Summary is basically first line only
  if (
    firstLine.length >= 12 &&
    s.replace(/\s+/g, "") === firstLine.replace(/\s+/g, "")
  ) {
    return true;
  }

  return false;
}

export type ThoughtSummaryOpts = {
  projectName?: string | null;
  projectDescription?: string | null;
  aliases?: string | null;
  title?: string | null;
  /** Known project names for this user; used to recover a project hint from the title. */
  knownProjects?: string[];
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function projectFromTitle(
  title: string | null | undefined,
  knownProjects?: string[]
): string | null {
  if (!title) return null;
  const m = title.match(/对\s*([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff]{1,24})\s*的启发/);
  if (m?.[1]) return m[1];
  for (const name of knownProjects ?? []) {
    if (!name || name.trim().length < 2) continue;
    if (new RegExp(escapeRegExp(name.trim()), "i").test(title)) return name.trim();
  }
  return null;
}

/** Compress a tip list into one mechanism sentence when possible. */
function abstractTipMechanism(raw: string, steps: string[]): string {
  if (/Search\s*Console|GSC|SERP|SEO/i.test(raw) && /社交|social/i.test(raw)) {
    return "社交内容接入 Search Console 后可显关键词；分析 SERP 再写帖、关键词前置并分享，使内容进入 Google 搜索结果。";
  }
  if (/App\s*Store|产品页|listing|多受众|定制.*页/i.test(raw)) {
    return "同一应用内核，按受众拆分商店页/叙事，突出不同能力与场景。";
  }
  // Generic: outcome-ish last step + first action
  const head = steps[0]?.replace(/[。.！!？?]+$/, "") || "";
  const tail =
    steps[steps.length - 1]?.replace(/[。.！!？?]+$/, "") || "";
  if (head && tail && head !== tail) {
    return `通过「${clip(head, 36)}」等 ${steps.length} 步，达到「${clip(tail, 36)}」。`;
  }
  return clip(steps.slice(0, 3).join(" → "), 120);
}

function transferApplication(
  projectName: string,
  projectDescription: string | null | undefined,
  aliases: string | null | undefined,
  raw: string
): string {
  const desc = (projectDescription || "").trim();
  const isMail =
    /mail|email|邮件/i.test(desc + projectName) ||
    /邮件/.test(aliases || "");
  const isPhoto =
    /photo|相册|照片|frame|边框/i.test(desc + projectName) ||
    /相册|照片/.test(aliases || "");

  if (/SEO|SERP|Search\s*Console|社交内容|GSC/i.test(raw) && isMail) {
    return (
      `对 ${projectName} 的启发：把可被搜索引擎抓取的公开内容层当作获客渠道` +
      `（场景说明、对比页、使用帖），按邮件用户真实意图选题（隐私、多账户、效率、通知克制等），` +
      `而不是只做 App Store 转化。\n` +
      `待验证：哪些内容能被索引并带来安装/试用意图。`
    );
  }
  if (/SEO|SERP|Search\s*Console|社交内容|GSC/i.test(raw) && isPhoto) {
    return (
      `对 ${projectName} 的启发：用可索引的公开内容展示相册/边框场景（整理、纪念、分享），` +
      `把搜索意图接到产品能力上，而非只做商店截图。\n待验证：内容主题与转化路径。`
    );
  }
  if (isMail) {
    return (
      `对 ${projectName} 的启发：抽象上述机制后，按邮件客户端任务重写可执行动作` +
      `（收件效率 / 隐私通知 / 写作模板 / 搜索归档），勿照搬案例原垂直客群。\n` +
      `待验证：对 ${projectName} 用户是否成立。`
    );
  }
  if (isPhoto) {
    return (
      `对 ${projectName} 的启发：将机制落到相册/展示品类（整理、美观、分享、纪念），` +
      `勿照搬无关垂直工具话术。\n待验证：用户分层与一句话卖点。`
    );
  }
  return (
    `对 ${projectName} 的启发：抽象机制后，按「${projectName}` +
    `${desc ? ` — ${desc}` : ""}」品类推导动作；禁止照搬案例原文客群。\n` +
    `待验证：品类假设与真实用户是否匹配。`
  );
}

/** Case-study verticals that must NOT be copied onto an unrelated product. */
const FOREIGN_VERTICAL_MARKERS =
  /IRS|报税|哈萨克斯坦|护照|讲义笔记|老照片数字化|PDF\s*扫描|扫描仪/;

/**
 * True when body still narrates the EXTERNAL case personas while title/project is OUR product.
 * The check is generic: if the body claims a vertical that the project's own
 * context (name / description / aliases) never claims, the summary is misgrounded.
 */
export function isMisgroundedTransfer(opts: {
  title?: string | null;
  body: string;
  projectName?: string | null;
  projectDescription?: string | null;
  aliases?: string | null;
}): boolean {
  const title = (opts.title || "").toLowerCase();
  const body = opts.body || "";
  const pname = (opts.projectName || "").toLowerCase();
  const aboutOwn =
    !!pname && (title.includes(pname) || body.toLowerCase().includes(pname));
  if (!aboutOwn) return false;
  if (!FOREIGN_VERTICAL_MARKERS.test(body)) return false;

  const ownContext = [opts.projectName, opts.projectDescription, opts.aliases]
    .filter(Boolean)
    .join(" ");
  return !FOREIGN_VERTICAL_MARKERS.test(ownContext);
}

/**
 * Local grounded adaptation when model fails to specialize.
 */
export function makeProductGroundedTransfer(opts: {
  raw: string;
  projectName: string;
  projectDescription?: string | null;
  aliases?: string | null;
}): string {
  const name = opts.projectName;
  const desc = (opts.projectDescription || "").trim();
  const isMail =
    /mail|email|邮件/i.test(desc + name) ||
    /邮件/.test(opts.aliases || "");
  const isPhoto =
    /photo|相册|照片|frame|边框/i.test(desc + name) ||
    /相册|照片/.test(opts.aliases || "");

  const parts: string[] = [];
  parts.push(
    `机制迁移：同一产品、多套商店页/叙事；应用内核不变，变的是「对谁、讲什么故事、突出什么能力」。`
  );
  parts.push(
    `目标产品：${name}${desc ? ` — ${desc}` : ""}（受众必须按此品类推导，禁止照搬案例里的扫描仪客群）。`
  );

  if (isMail) {
    parts.push(
      `可能受众（邮件品类示例，待你验证）：\n` +
        `• 隐私敏感个人：强调本地优先、少追踪、通知克制\n` +
        `• 多账户重度工作者：强调账户切换、统一收件、键盘效率\n` +
        `• 日历/会议密集用户：强调邮件与日程联动、快速确认\n` +
        `• 简洁主义用户：强调干净收件箱、少打扰、原生体验\n` +
        `• 小团队协作者：强调共享线索、模板回复、权限清晰`
    );
    parts.push(
      `每类应强调的能力差异：收件效率 / 隐私与通知 / 写作与模板 / 搜索归档 / 跨设备同步 — 而不是 OCR、护照扫描、报税表。`
    );
  } else if (isPhoto) {
    parts.push(
      `可能受众（相册/照片品类示例，待你验证）：\n` +
        `• 怀旧整理者：老照片数字化、相册叙事\n` +
        `• 审美向个人：边框、滤镜、展示墙\n` +
        `• 轻分享用户：导出、社交向构图\n` +
        `• 家庭记录者：人物相册、时间线`
    );
    parts.push(`每类强调：整理 / 美观 / 分享 / 纪念 — 贴合相册产品，而非无关垂直工具。`);
  } else {
    parts.push(
      `品类信息不足：请先在项目描述中写清「${name} 是什么」。在此之前只抽象机制，不编造无关行业客群。`
    );
  }

  parts.push(`不确定/待验证：真实用户分层是否成立；每个列表页的一句话卖点与截图差异。`);
  return parts.join("\n\n");
}

/**
 * System "understanding" body for a Thought — NOT a copy of the raw paste.
 * Prefer model when valid; else local template that abstracts tips / transfer.
 * Short inputs: cleaned original is fine as last resort.
 */
export function makeThoughtSummary(
  raw: string,
  modelHint?: string,
  opts?: ThoughtSummaryOpts
): string {
  const rawT = raw.trim();
  if (!rawT) return "";

  const fromModel = preferModelSummary(rawT, modelHint);
  if (fromModel) return fromModel;

  // Short capture: body can mirror input (原始输入 still available for audit)
  if (rawT.length <= 160 && !/\n/.test(rawT) && extractSteps(rawT).length < 2) {
    return rawT;
  }

  const steps = extractSteps(rawT);
  const paragraphs = rawT
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const parts: string[] = [];

  if (steps.length >= 2) {
    parts.push(`要点：${abstractTipMechanism(rawT, steps)}`);
    const shown = steps
      .slice(0, 6)
      .map((s, i) => `${i + 1}. ${clip(s, 48)}`)
      .join("\n");
    const more = steps.length > 6 ? `\n…共 ${steps.length} 步` : "";
    parts.push(`步骤：\n${shown}${more}`);
  } else {
    // Prefer a non-hook first sentence
    const sentences = rawT
      .split(/[。！？\n]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 6);
    const nonHook =
      sentences.find(
        (x) => !/^(我喜欢|I love|Check out|看看|分享一个|这个全新)/i.test(x)
      ) || sentences[0] || rawT.slice(0, 120);
    const firstClean = nonHook.replace(/\s+/g, " ").trim();
    parts.push(
      `要点：${firstClean.length > 140 ? firstClean.slice(0, 139) + "…" : firstClean}`
    );
  }

  const pname =
    opts?.projectName ||
    projectFromTitle(opts?.title, opts?.knownProjects) ||
    null;
  const wantsTransfer =
    !!pname &&
    (/启发|借鉴|迁移|学习|应用|落地/.test(opts?.title || "") ||
      /对\s*\w+/.test(opts?.title || "") ||
      !!opts?.projectName);

  if (pname && wantsTransfer) {
    parts.push(
      transferApplication(
        pname,
        opts?.projectDescription,
        opts?.aliases,
        rawT
      )
    );
  } else {
    const last =
      paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : "";
    if (last && last !== paragraphs[0]) {
      const lastClean = last.replace(/\s+/g, " ").trim();
      // Skip pure marketing punchlines when we already have steps
      const punchlineOnly =
        steps.length >= 2 &&
        lastClean.length < 80 &&
        !/产品|应该|想想|启发|借鉴|自己/.test(lastClean);
      if (
        !punchlineOnly &&
        (/结论|关键|自己|产品|受众|应该|想想|启发|学习|借鉴/.test(
          lastClean
        ) ||
          (lastClean.length < 220 && steps.length < 2))
      ) {
        parts.push(
          `联想/结论：${lastClean.length > 180 ? lastClean.slice(0, 179) + "…" : lastClean}`
        );
      }
    }
  }

  // Domain tags
  if (/App Store|产品页|受众|本地化|列表页|listing/i.test(rawT)) {
    parts.push("主题标签：一产品多受众叙事 / 应用商店页面差异化");
  }
  if (/SEO|SERP|Search\s*Console|GSC/i.test(rawT)) {
    parts.push("主题标签：可索引内容 / 搜索获客");
  }

  const out = parts.join("\n\n");
  // Last-resort guard
  if (isLowValueSummary(rawT, out) && steps.length >= 2) {
    return (
      `要点：${abstractTipMechanism(rawT, steps)}\n\n` +
      `步骤：\n` +
      steps
        .slice(0, 6)
        .map((s, i) => `${i + 1}. ${clip(s, 48)}`)
        .join("\n")
    );
  }
  return out;
}

/**
 * Turn a thought into an *executable* commitment title (next step),
 * not a paste of the whole idea sentence.
 */
export function commitmentTitleFromThought(
  title: string | null | undefined,
  content: string
): string {
  const text = (content || title || "").trim().replace(/\s+/g, " ");
  if (!text) return "推进未命名事项";

  // Domain shortcuts → concrete next actions
  if (/推送|通知/.test(text) && /(Mac|iPhone|iOS|桌面)/i.test(text)) {
    return "推进：邮件跨端推送提醒与预览（列最小能力清单）";
  }
  if (/真实相册|3D.*相册|相册.*app|照片相册|滤镜|边框/.test(text)) {
    if (/小红书|传播|好玩/.test(text)) {
      return "推进：照片处理的差异化玩法（利于传播的 3 个方向）";
    }
    if (/定义|定位|产品/.test(text)) {
      return "推进：写清相册产品一句话定位与核心体验";
    }
    return "推进：相册核心体验草稿（3D/滤镜/边框最小范围）";
  }
  if (/官网/.test(text)) {
    return "推进：官网文案/设计调整";
  }

  // Strip question / half-sentence openers
  let t = text
    .replace(/^(如果|假如|要是)/, "")
    .replace(/[？?呢]+$/g, "")
    .replace(/^(但|不过|其实|另外)/, "")
    .trim();

  // Prefer first actionable chunk
  const first = t.split(/[。！？\n]/)[0] ?? t;
  let clause = first.split(/[，,；;]/)[0] ?? first;
  clause = clause.replace(/^(把|将)/, "").trim();

  // If still looks like musing, force "推进：" prefix
  if (
    clause.length < 6 ||
    /处理上$|怎么样$|呢$|的$/.test(clause) ||
    clause.endsWith("上")
  ) {
    const short = makeThoughtTitle(text, 28);
    return clip(`推进：${short}`, 48);
  }

  if (!/^推进[：:]/.test(clause) && !/^(完成|写出|列出|设计|实现|优化|研究|准备)/.test(clause)) {
    clause = `推进：${clause}`;
  }
  return clip(clause, 48);
}

/** Normalize for near-duplicate detection */
export function normalizeCommitmentKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/^推进[：:]\s*/, "")
    .replace(/[？?呢。！、，,\s\-~～%％()（）]+/g, "")
    .replace(/ai增强版|增强版/gi, "")
    // product noise — same feature across phrasings
    .replace(/mail|邮件客户端|mac客户端|iphone版?/gi, "")
    .replace(/设计并|实现|添加|修复|修正|强化|优化|推进/g, "")
    .replace(/手动|拖拽|支持|为/g, "")
    .replace(/侧边栏|宽度|最大|最小|隐藏|40/g, "侧栏宽")
    .replace(/(侧栏宽)+/g, "侧栏宽")
    .replace(/独立搜索页|搜索页面|搜索功能|搜索页|邮件搜索/g, "独立搜索")
    .replace(/(独立搜索)+/g, "独立搜索")
    .slice(0, 48);
}

/** True when two open work titles describe the same intent. */
export function commitmentsAreNearDuplicate(a: string, b: string): boolean {
  const ka = normalizeCommitmentKey(a);
  const kb = normalizeCommitmentKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 6 && kb.length >= 6) {
    if (ka.includes(kb) || kb.includes(ka)) return true;
  }
  // shared long substring
  const shorter = ka.length <= kb.length ? ka : kb;
  const longer = ka.length <= kb.length ? kb : ka;
  if (shorter.length >= 8 && longer.includes(shorter.slice(0, Math.min(12, shorter.length)))) {
    return true;
  }
  return false;
}
