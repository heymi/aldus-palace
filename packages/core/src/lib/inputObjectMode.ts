import { detectActionableWork, type ModelIntent } from "./actionableWork.js";

export type InputObjectMode = "thought" | "commitment" | "mixed";

type ExtractionShape = {
  object_mode?: InputObjectMode | null;
  intent?: ModelIntent | null;
  thoughts: unknown[];
  commitments: unknown[];
};

export type ObjectModeDecision = {
  mode: InputObjectMode;
  source: "model" | "server_fallback";
};

const THOUGHT_CLAUSE_RE =
  /我?(想到|觉得|感觉|发现|意识到|在想)|想法|点子|灵感|方向|假设|观察|启发|idea|insight|observation/i;
const ACTION_CLAUSE_RE =
  /改完|完成|提交|安排|处理|修复|优化|实现|开发|上线|发布|写完|整理|准备|研究一下|调研一下|验证一下|\b(finish|submit|schedule|fix|implement|build|ship|write|prepare|research|validate)\b/i;

function looksClearlyMixed(input: string): boolean {
  const clauses = input
    .split(/[，,。；;！？!?\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  if (clauses.length < 2) return false;

  const hasActionClause = clauses.some((clause) => {
    const signal = detectActionableWork(clause);
    return signal.score >= 0.55 || ACTION_CLAUSE_RE.test(clause);
  });
  const hasIndependentThoughtClause = clauses.some((clause) => {
    const signal = detectActionableWork(clause);
    return signal.score < 0.55 && THOUGHT_CLAUSE_RE.test(clause);
  });
  return hasActionClause && hasIndependentThoughtClause;
}

/**
 * Resolve the one primary object mode for a capture.
 *
 * The model is asked for this explicit decision. The fallback exists for old
 * providers/responses and deliberately collapses duplicated Thought +
 * Commitment output unless the raw input contains two independent clauses.
 */
export function decideInputObjectMode(
  input: string,
  extraction: ExtractionShape
): ObjectModeDecision {
  if (extraction.object_mode) {
    return { mode: extraction.object_mode, source: "model" };
  }

  const thoughtCount = extraction.thoughts.length;
  const commitmentCount = extraction.commitments.length;
  if (thoughtCount > 0 && commitmentCount === 0) {
    return { mode: "thought", source: "server_fallback" };
  }
  if (commitmentCount > 0 && thoughtCount === 0) {
    return { mode: "commitment", source: "server_fallback" };
  }
  if (thoughtCount > 0 && commitmentCount > 0) {
    if (looksClearlyMixed(input)) {
      return { mode: "mixed", source: "server_fallback" };
    }
    return {
      mode:
        extraction.intent?.has_actionable_work === true
          ? "commitment"
          : "thought",
      source: "server_fallback",
    };
  }

  const actionable = detectActionableWork(input);
  return {
    mode:
      extraction.intent?.has_actionable_work === true || actionable.score >= 0.55
        ? "commitment"
        : "thought",
    source: "server_fallback",
  };
}
