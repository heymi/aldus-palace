/**
 * Memory activation policy.
 *
 * A high-confidence memory takes effect when it is captured; everything else
 * waits as a candidate. Activation is silent, explainable and reversible:
 * every automated activation is written to the action log, and any memory can
 * be archived from the memory list.
 *
 * The thresholds and the single exception come from the product spec:
 * `Importance >= 0.8 AND Confidence >= 0.8 → Active Memory`, with the memory
 * pollution rule "a single inference never becomes a principle" applied on top.
 */

import type { MemoryType } from "../domain/types.js";

export type MemoryActivation = "active" | "candidate" | "drop";

/** Below this the candidate is discarded before it reaches storage. */
export const MEMORY_DROP_CONFIDENCE = 0.72;
/** At or above this (with importance) a memory takes effect on capture. */
export const MEMORY_ACTIVE_THRESHOLD = 0.8;

export type ActivationCandidate = {
  type: MemoryType | string;
  source: "user_explicit" | "ai_inferred" | "decision_promote" | string;
  content: string;
  confidence?: number | null;
  importance?: number | null;
};

export type ActivationDecision = {
  activation: MemoryActivation;
  /** Machine-readable reason, recorded in the action log. */
  reason: string;
};

/**
 * Decide whether a memory candidate takes effect now, waits for confirmation,
 * or is discarded.
 */
export function decideMemoryActivation(
  candidate: ActivationCandidate
): ActivationDecision {
  const confidence = candidate.confidence;
  const importance = candidate.importance ?? 0;

  if (confidence === null || confidence === undefined) {
    return { activation: "candidate", reason: "no_confidence_score" };
  }
  if (confidence < MEMORY_DROP_CONFIDENCE) {
    return { activation: "drop", reason: "below_confidence_floor" };
  }

  const inferred = candidate.source === "ai_inferred";
  if (inferred && candidate.type === "principle") {
    return { activation: "candidate", reason: "inferred_principle_needs_confirmation" };
  }

  if (confidence >= MEMORY_ACTIVE_THRESHOLD && importance >= MEMORY_ACTIVE_THRESHOLD) {
    return {
      activation: "active",
      reason: inferred ? "high_confidence_inference" : "stated_by_user",
    };
  }

  return { activation: "candidate", reason: "below_activation_threshold" };
}

/**
 * Importance follows the memory type. A principle shapes many decisions, a
 * preference fewer, everything else fewer still.
 */
export function memoryImportanceFor(type: MemoryType | string): number {
  if (type === "principle") return 0.9;
  if (type === "preference") return 0.8;
  if (type === "project_context") return 0.75;
  return 0.7;
}

/** Human sentence for the memory list: why this memory is active. */
export function explainActivation(row: {
  status?: unknown;
  source?: unknown;
  confidence?: unknown;
  importance?: unknown;
  confirmed_at?: unknown;
}): string {
  const status = typeof row.status === "string" ? row.status : "candidate";
  if (status !== "active") {
    return status === "archived" ? "archived" : "waiting for confirmation";
  }
  if (typeof row.confirmed_at === "string" && row.confirmed_at) {
    return "confirmed by you";
  }
  const source = typeof row.source === "string" ? row.source : "";
  const confidence = typeof row.confidence === "number" ? row.confidence : null;
  const importance = typeof row.importance === "number" ? row.importance : null;
  const detail =
    confidence !== null && importance !== null
      ? ` (confidence ${confidence}, importance ${importance})`
      : "";
  return source === "ai_inferred"
    ? `activated on capture, inferred${detail}`
    : `activated on capture, stated by you${detail}`;
}
