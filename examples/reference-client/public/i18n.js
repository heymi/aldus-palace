/* Bilingual copy for the reference client. English fallback for a missing key. */

export const LANGS = ["en", "zh"];

const MESSAGES = {
  en: {
    "skip": "Skip to capture",
    "masthead.deck":
      "A trustworthy context layer. Write a sentence and watch what it becomes, what it remembers, and what it asks before it acts.",
    "masthead.lang": "Language",
    "nav.capture": "Capture",
    "nav.today": "Today",
    "nav.memory": "Memory",
    "nav.decisions": "Decisions",
    "capture.hero": "What is on your mind?",
    "capture.sub":
      "One sentence. Time-bound work lands in Today; anything durable is remembered under Memory.",
    "capture.placeholder": "Ship the onboarding page today",
    "capture.button": "File it",
    "capture.hint": "⌘↵ to file · no key needed",
    "capture.reading": "reading…",
    "capture.filed": "filed",
    "capture.failed": "failed: {message}",
    "chips.try": "Try",
    "today.title": "Today",
    "today.empty":
      "<strong>Nothing planned for today.</strong> Capture something with “today” in it, and it appears here.",
    "today.doNow": "do now",
    "today.then": "Then",
    "today.scheduled": "Scheduled",
    "today.atRisk": "At risk",
    "today.mode.balanced": "balanced day",
    "today.mode.high_capacity": "high capacity day",
    "today.mode.paused": "paused",
    "plan.core": "core",
    "plan.optional": "optional",
    "plan.later": "later",
    "memory.title": "Memory",
    "memory.candidates": "candidates",
    "memory.empty":
      "<strong>Nothing remembered yet.</strong> A sentence like “I prefer simple tools” becomes a memory you can inspect.",
    "memory.waiting.one":
      "{n} candidate memory waiting — turn on “candidates”.",
    "memory.waiting.other":
      "{n} candidate memories waiting — turn on “candidates”.",
    "memory.evidence": "evidence ↓",
    "memory.hideEvidence": "hide evidence ↑",
    "memory.candidate": "candidate",
    "kind.preference": "prefers",
    "kind.principle": "principle",
    "kind.project_context": "project",
    "kind.decision": "decision",
    "kind.experience": "experience",
    "fresh.fresh": "fresh",
    "fresh.settling": "settling",
    "fresh.fading": "fading",
    "fresh.old": "old",
    "decisions.title": "Needs a decision",
    "decisions.quiet": "the gate is quiet",
    "decisions.empty":
      "<strong>Nothing needs a decision.</strong> High-risk actions wait here for one approval, critical ones for two. In this demo the only source is deleting everything; every captured sentence is still graded by the same table.",
    "decisions.approve": "Approve",
    "decisions.approveAgain": "Approve again",
    "decisions.reject": "Reject",
    "decisions.second": "1 of 2 approvals",
    "decisions.executed": "executed ({status})",
    "decisions.decided": "decided",
    "risk.low": "low",
    "risk.medium": "medium",
    "risk.high": "high",
    "risk.critical": "critical",
    "action.user_data_purge": "Delete all data",
    "action.memory_deleted": "Delete a memory",
    "action.commitment_deleted": "Delete a commitment",
    "receipt.captured": "Captured",
    "receipt.commitments": "Commitments",
    "receipt.memories": "Memories",
    "receipt.thoughts": "Thoughts",
    "receipt.decisions": "Decisions",
    "receipt.commitment.one": "{n} commitment",
    "receipt.commitment.other": "{n} commitments",
    "receipt.memory.one": "{n} memory",
    "receipt.memory.other": "{n} memories",
    "receipt.thought.one": "{n} thought",
    "receipt.thought.other": "{n} thoughts",
    "receipt.decision.one": "{n} decision",
    "receipt.decision.other": "{n} decisions",
    "receipt.noDate": "no date",
    "receipt.modelReading": "reading with the model…",
    "receipt.modelApplied": "model reading applied",
    "receipt.seeToday": "See it in Today ↓",
    "receipt.seeMemory": "See it in Memory ↓",
    "evidence.source": "source",
    "evidence.captured": "captured",
    "evidence.reading": "reading",
    "evidence.excerpt": "excerpt",
    "evidence.loading": "Reading the source…",
    "evidence.error": "Could not load the source: {message}",
    "state.active": "active",
    "state.candidate": "candidate",
    "footer":
      "Local-first. This page talks to <code>/api</code>; the token stays on the host, not in the browser.",
    "status.connecting": "connecting…",
    "status.offline": "offline: {message}",
    "api.unreachable": "Could not reach the API: {message}",
    "loading": "Loading…",
  },
  zh: {
    "skip": "跳到捕获",
    "masthead.deck":
      "可信的上下文层。写一句话，看它变成什么、记住什么，以及在行动前会来问你什么。",
    "masthead.lang": "语言",
    "nav.capture": "捕获",
    "nav.today": "今天",
    "nav.memory": "记忆",
    "nav.decisions": "决定",
    "capture.hero": "你在想什么？",
    "capture.sub": "一句话。带时间的进入「今天」，持久的记入「记忆」。",
    "capture.placeholder": "今天把官网文案改完",
    "capture.button": "记录",
    "capture.hint": "⌘↵ 提交 · 无需 key",
    "capture.reading": "正在理解…",
    "capture.filed": "已记录",
    "capture.failed": "失败：{message}",
    "chips.try": "试试",
    "today.title": "今天",
    "today.empty": "<strong>今天还没有安排。</strong>记录一句带「今天」的话，它就会出现在这里。",
    "today.doNow": "现在就做",
    "today.then": "接下来",
    "today.scheduled": "已安排",
    "today.atRisk": "有风险",
    "today.mode.balanced": "平衡节奏",
    "today.mode.high_capacity": "高容量",
    "today.mode.paused": "已暂停",
    "plan.core": "核心",
    "plan.optional": "可选",
    "plan.later": "之后",
    "memory.title": "记忆",
    "memory.candidates": "候选",
    "memory.empty":
      "<strong>还没有任何记忆。</strong>像「不喜欢复杂」这样的句子会变成一条可以检查的记忆。",
    "memory.waiting.one": "还有 {n} 条候选记忆——打开右上角「候选」查看。",
    "memory.waiting.other": "还有 {n} 条候选记忆——打开右上角「候选」查看。",
    "memory.evidence": "查看原句 ↓",
    "memory.hideEvidence": "收起原句 ↑",
    "memory.candidate": "候选",
    "kind.preference": "偏好",
    "kind.principle": "原则",
    "kind.project_context": "项目",
    "kind.decision": "决策",
    "kind.experience": "经历",
    "fresh.fresh": "新鲜",
    "fresh.settling": "沉淀中",
    "fresh.fading": "渐淡",
    "fresh.old": "陈旧",
    "decisions.title": "需要决定",
    "decisions.quiet": "门控安静",
    "decisions.empty":
      "<strong>没有待决定的事。</strong>高风险动作在这里等一次批准，关键动作等两次。这个 demo 里唯一的来源是「删除全部数据」；每句捕获仍会被同一张风险表评级。",
    "decisions.approve": "批准",
    "decisions.approveAgain": "再次批准",
    "decisions.reject": "拒绝",
    "decisions.second": "已批准 1/2",
    "decisions.executed": "已执行（{status}）",
    "decisions.decided": "已决定",
    "risk.low": "低",
    "risk.medium": "中",
    "risk.high": "高",
    "risk.critical": "关键",
    "action.user_data_purge": "删除全部数据",
    "action.memory_deleted": "删除一条记忆",
    "action.commitment_deleted": "删除一个承诺",
    "receipt.captured": "已记录",
    "receipt.commitments": "承诺",
    "receipt.memories": "记忆",
    "receipt.thoughts": "想法",
    "receipt.decisions": "决定",
    "receipt.commitment.one": "{n} 条承诺",
    "receipt.commitment.other": "{n} 条承诺",
    "receipt.memory.one": "{n} 条记忆",
    "receipt.memory.other": "{n} 条记忆",
    "receipt.thought.one": "{n} 条想法",
    "receipt.thought.other": "{n} 条想法",
    "receipt.decision.one": "{n} 条决定",
    "receipt.decision.other": "{n} 条决定",
    "receipt.noDate": "无日期",
    "receipt.modelReading": "正在用模型阅读…",
    "receipt.modelApplied": "已应用模型判读",
    "receipt.seeToday": "在「今天」查看 ↓",
    "receipt.seeMemory": "在「记忆」查看 ↓",
    "evidence.source": "来源",
    "evidence.captured": "捕获于",
    "evidence.reading": "判读",
    "evidence.excerpt": "摘录",
    "evidence.loading": "正在读取来源…",
    "evidence.error": "无法读取来源：{message}",
    "state.active": "已生效",
    "state.candidate": "候选",
    "footer":
      "本地优先。本页通过 <code>/api</code> 通信；token 留在宿主机，不进浏览器。",
    "status.connecting": "连接中…",
    "status.offline": "离线：{message}",
    "api.unreachable": "无法访问 API：{message}",
    "loading": "加载中…",
  },
};

export function detectLang() {
  try {
    const saved = localStorage.getItem("aldus.lang");
    if (LANGS.includes(saved)) return saved;
  } catch {
    // private mode: fall through to the browser language
  }
  const nav = String(navigator.language ?? "en").toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

export function saveLang(lang) {
  try {
    localStorage.setItem("aldus.lang", lang);
  } catch {
    // not fatal: the choice just will not persist
  }
}

/** A formatter for the chosen UI language. */
export function translator(lang) {
  const table = MESSAGES[lang] ?? MESSAGES.en;
  return (key, vars) => {
    let text = table[key] ?? MESSAGES.en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function localeTag(lang) {
  return lang === "zh" ? "zh-CN" : "en";
}

/** What the API stores as the user's language. */
export function serverLanguage(lang) {
  return lang === "zh" ? "zh-CN" : "en";
}

export const EXAMPLES = {
  en: [
    "Ship the onboarding page today.",
    "I prefer simple tools and fewer settings.",
    "AI should assist, not dominate.",
  ],
  zh: [
    "今天把官网文案改完。",
    "不喜欢复杂，界面要简单。",
    "AI 应该辅助而不是主导。",
  ],
};
