/**
 * When to ask what an input is.
 *
 * The rules are deliberately small and high-precision; an input with some work
 * signal but below the action bar was silently stored as a thought. That is a
 * guess. This decides the grey zone: enough signal to be unsure, never a mood,
 * and never something the rules already resolved.
 */

import { detectActionableWork } from "./actionableWork.js";
import type { ObjectChoice } from "./classificationSignals.js";

export type ObjectModeOption = { id: ObjectChoice; label: string };

/** The band where a work signal exists but is not strong enough to act. */
export const GREY_ZONE_MIN = 0.25;
export const GREY_ZONE_MAX = 0.55;

/** Mood and pure observation: a state, not something to classify. */
const MOOD_RE =
  /有点(累|烦|乱)|太吵|干扰(太多|很大)|心情|情绪|tired|exhausted|overwhelmed|not in the mood/i;

export function objectModeOptions(locale: "en" | "zh-CN"): ObjectModeOption[] {
  return locale === "zh-CN"
    ? [
        { id: "bug", label: "一条缺陷" },
        { id: "task", label: "一件要做的事" },
        { id: "note", label: "只是记录" },
      ]
    : [
        { id: "bug", label: "A defect report" },
        { id: "task", label: "Something to do" },
        { id: "note", label: "Just a note" },
      ];
}

export function objectModeQuestion(locale: "en" | "zh-CN"): string {
  return locale === "zh-CN"
    ? "这条属于哪种？"
    : "What is this — a defect, work, or a note?";
}

/**
 * True when the rules are unsure: a work signal in the grey band, and the words
 * do not describe a mood. Callers must also check that nothing was extracted.
 */
export function shouldAskObjectMode(input: string): boolean {
  const text = input.trim();
  if (text.length < 8) return false;
  if (MOOD_RE.test(text)) return false;
  const { score } = detectActionableWork(text);
  return score >= GREY_ZONE_MIN && score < GREY_ZONE_MAX;
}
