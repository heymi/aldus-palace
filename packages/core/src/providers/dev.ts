import type { ChatMessage, LLMProvider } from "./types.js";
import {
  nextFriday,
  nextMonthWindow,
  nextWeekWindow,
} from "../lib/time.js";
import {
  detectActionableWork,
  suggestWorkTitle,
} from "../lib/actionableWork.js";

/**
 * Deterministic local provider for Phase 0 / eval without API keys.
 * Implements heuristic extraction aligned with acceptance S04–S06, S09, S25.
 */
export class DevLLMProvider implements LLMProvider {
  readonly name = "dev";

  async complete(messages: ChatMessage[]): Promise<string> {
    const userMsg = [...messages].reverse().find((m) => m.role === "user");
    const text = userMsg?.content ?? "";
    // Everything after the last "Input:" marker (must be greedy — long pastes contain blank lines)
    const match = text.match(/Input:\n([\s\S]+)$/m) || text.match(/Input:\s*([\s\S]+)$/);
    const input = (match?.[1] ?? text).trim();

    return JSON.stringify(extractDev(input));
  }
}

export function extractDev(input: string): {
  object_mode: "thought" | "commitment" | "mixed";
  thoughts: Array<{
    type: string;
    content: string;
    original_excerpt?: string;
    status?: string;
  }>;
  commitments: Array<{
    title: string;
    optimized_content?: string;
    goal?: string;
    status?: string;
    deadline?: string | null;
    window_start?: string | null;
    window_end?: string | null;
    duration_minutes?: number | null;
  }>;
  decisions: Array<{ title: string; reason?: string }>;
  memory_candidates: Array<{
    type: string;
    content: string;
    source: string;
    confidence?: number;
    evidence?: string;
  }>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const thoughts: ReturnType<typeof extractDev>["thoughts"] = [];
  const commitments: ReturnType<typeof extractDev>["commitments"] = [];
  const decisions: ReturnType<typeof extractDev>["decisions"] = [];
  const memory_candidates: ReturnType<typeof extractDev>["memory_candidates"] =
    [];

  const lower = input.toLowerCase();

  // Temporary state — do not long-term memory (S30)
  const tempState =
    /现在有点累|今天累|下午不想|有点累/.test(input) &&
    !/以后|总是|一直|偏好|喜欢|不喜欢复杂/.test(input);

  // Explicit preference / principle (S25 S26)
  if (
    /不喜欢复杂|界面要简单|不要做太复杂|应该辅助而不是主导|assist,?\s*not\s*dominate/i.test(
      input
    )
  ) {
    if (/辅助而不是主导|assist/i.test(input)) {
      memory_candidates.push({
        type: "principle",
        content: "AI should assist, not dominate",
        source: "user_explicit",
        confidence: 0.85,
        evidence: input.slice(0, 200),
      });
    }
    if (/不喜欢复杂|不要做太复杂|界面要简单/.test(input)) {
      memory_candidates.push({
        type: "preference",
        content: "喜欢简洁、简单的产品与界面，避免复杂",
        source: "user_explicit",
        confidence: 0.88,
        evidence: input.slice(0, 200),
      });
    }
  }

  // Decision candidate (S08)
  if (/mac\s*only|不要做\s*windows|保持\s*mac/i.test(input)) {
    thoughts.push({
      type: "decision_candidate",
      content: input,
      original_excerpt: input,
      status: "captured",
    });
    decisions.push({
      title: "Keep product Mac-only / avoid Windows (candidate)",
      reason: input,
    });
    memory_candidates.push({
      type: "decision",
      content: "倾向保持 Mac-only，不做 Windows",
      source: "ai_inferred",
      confidence: 0.7,
      evidence: input.slice(0, 200),
    });
  }

  // Mixed / research / action patterns (+ language-agnostic work detector)
  const work = detectActionableWork(input);
  const hasResearch =
    /研究一下|研究|research|可行性/.test(input) ||
    /下个月研究/.test(input);
  const hasAction =
    work.score >= 0.55 ||
    /改完|优化|调整|处理|完成|提交|写|修改|安排|下周|周五|明天|后天|deadline|截止/.test(
      input
    ) ||
    hasResearch;
  const pureThought =
    /觉得|感觉|想到|有点乱|太吵|干扰|观察/.test(input) &&
    !hasAction &&
    !/周五|下周|下个月|完成|改完/.test(input);

  // S04 pure observation
  if (pureThought || (!hasAction && /太吵|干扰太多|有点乱/.test(input))) {
    thoughts.push({
      type: /乱/.test(input) ? "observation" : "observation",
      content: input,
      original_excerpt: input,
      status: "captured",
    });
    return {
      object_mode: "thought",
      thoughts,
      commitments,
      decisions,
      memory_candidates: tempState ? [] : memory_candidates,
      warnings,
    };
  }

  // S09 uncertain
  if (/有点乱/.test(input) && !hasAction) {
    thoughts.push({
      type: "observation",
      content: input,
      status: "captured",
    });
    return {
      object_mode: "thought",
      thoughts,
      commitments: [],
      decisions,
      memory_candidates,
      warnings,
    };
  }

  // Mixed means two independent semantic clauses, not task context duplicated
  // into a Thought.
  const mixedInput =
    /想做[^，,。；;\n]*[，,。；;\n].*(研究|验证|评估|调研)/i.test(input) ||
    /(?:想法|方向|点子)[^，,。；;\n]*[，,。；;\n].*(完成|实现|研究|验证|安排)/i.test(
      input
    );
  if (mixedInput) {
    thoughts.push({
      type: hasResearch ? "research" : "idea",
      content: input,
      original_excerpt: input,
      status: "captured",
    });
  }

  if (hasAction || hasResearch) {
    let title = work.suggestedTitle || suggestWorkTitle(input);
    if (/官网/.test(input)) title = "推进：优化/调整官网";
    if (/首页文案/.test(input)) title = "推进：改完官网首页文案";
    if (/研究/.test(input) || /research/i.test(lower)) {
      title = /市场/.test(input)
        ? "推进：研究 AI 邮件市场"
        : /ios|iOS/.test(input)
          ? "推进：研究 iOS 版可行性"
          : "推进：进行研究";
    }
    if (/想做.*ios|想做 iOS|做 iOS/i.test(input) && hasResearch) {
      title = "推进：研究 iOS 版可行性";
    }

    const c: (typeof commitments)[0] = {
      title,
      optimized_content: input.slice(0, 500),
      status: "planned",
      duration_minutes: 60,
    };

    if (/周五/.test(input)) {
      c.deadline = nextFriday().toISOString();
    } else if (/下周/.test(input)) {
      const w = nextWeekWindow();
      c.window_start = w.start.toISOString();
      c.window_end = w.end.toISOString();
    } else if (/下个月/.test(input)) {
      const w = nextMonthWindow();
      c.window_start = w.start.toISOString();
      c.window_end = w.end.toISOString();
    }

    commitments.push(c);
  }

  // High-risk external action — only structure, never execute (S24)
  if (/发邮件|发给客户|付款|转账/.test(input)) {
    warnings.push("External send/payment is not executed in V1; tracked as work only.");
    if (commitments.length === 0) {
      commitments.push({
        title: "准备沟通/草稿（不自动发送）",
        optimized_content: input.slice(0, 500),
        status: "captured",
      });
    }
  }

  // If nothing extracted, fall back to thought-only (S09)
  if (
    thoughts.length === 0 &&
    commitments.length === 0 &&
    memory_candidates.length === 0
  ) {
    thoughts.push({
      type: "observation",
      content: input,
      status: "captured",
    });
  }

  return {
    object_mode:
      thoughts.length > 0 && commitments.length > 0
        ? "mixed"
        : commitments.length > 0
          ? "commitment"
          : "thought",
    thoughts,
    commitments,
    decisions,
    memory_candidates: tempState ? [] : memory_candidates,
    warnings,
  };
}
