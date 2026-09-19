/**
 * The Now score.
 *
 * Now is not the highest-priority item; it is the best current action. The
 * score weighs urgency, importance, whether the work fits the time left, and
 * whether it continues the context the user is already in.
 */

export const NOW_FIT_BONUS = 10;
export const NOW_CONTEXT_BONUS = 25;
export const NOW_SWITCH_PENALTY = 10;

export type NowSignals = {
  importance?: number | null;
  deadline?: string | null;
  status?: string | null;
  projectId?: string | null;
  durationMinutes?: number | null;
  /** Minutes left in the day for this item. */
  availableMinutes: number;
  /** The project of the item the user touched last. */
  contextProjectId?: string | null;
  at: Date;
};

export type NowScore = { score: number; reasons: string[] };

export function scoreNow(signals: NowSignals): NowScore {
  let score = 10;
  const reasons: string[] = [];

  const deadlineMs = signals.deadline ? Date.parse(signals.deadline) : Number.NaN;
  const hoursLeft = Number.isFinite(deadlineMs)
    ? (deadlineMs - signals.at.getTime()) / 3600000
    : Number.NaN;
  if (signals.status === "risk" || (Number.isFinite(hoursLeft) && hoursLeft <= 24)) {
    score += 50;
    reasons.push("临近截止");
  } else if (Number.isFinite(hoursLeft) && hoursLeft <= 72) {
    score += 20;
    reasons.push("近期有截止");
  }

  const importance = Number(signals.importance);
  if (Number.isFinite(importance) && importance > 0) {
    score += Math.round(importance * 15);
    reasons.push("重要性");
  }

  const duration = Number(signals.durationMinutes);
  if (Number.isFinite(duration) && duration > 0) {
    if (duration <= signals.availableMinutes) {
      score += NOW_FIT_BONUS;
      reasons.push("当前时间够用");
    } else {
      score -= 20;
      reasons.push("当前时间不够");
    }
  }

  const context = signals.contextProjectId ?? null;
  const project = signals.projectId ?? null;
  if (context && project && context === project) {
    score += NOW_CONTEXT_BONUS;
    reasons.push("延续当前上下文");
  } else if (context && project && context !== project) {
    score -= NOW_SWITCH_PENALTY;
    reasons.push("需要切换项目");
  }

  return { score: Math.max(0, score), reasons };
}
