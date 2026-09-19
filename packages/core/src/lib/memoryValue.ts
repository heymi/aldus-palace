/**
 * Memory value.
 *
 * Not every belief deserves the same weight. A memory carries a level (how much
 * it shapes behaviour), a decay (how fast it fades), and a value score built
 * from how it was stated, how often it appeared, what it affects and how far it
 * reaches. Retrieval weighs all three.
 */

export type MemoryLevel = 0 | 1 | 2 | 3 | 4;

/** Raw experience 0, observation 1, preference 2, principle 3. */
export function memoryLevelFor(type: string): MemoryLevel {
  switch (type) {
    case "principle":
      return 3;
    case "preference":
      return 2;
    case "decision":
    case "project_context":
      return 1;
    case "experience":
    default:
      return 0;
  }
}

const HALF_LIFE_DAYS: Record<string, number> = {
  experience: 30,
  project_context: 180,
  decision: 365,
  preference: 180,
  principle: 3650,
};

/** Days after which a memory loses half its weight. */
export function decayHalfLifeDays(type: string): number {
  return HALF_LIFE_DAYS[type] ?? HALF_LIFE_DAYS.experience;
}

/** 1 when fresh, 0.5 at the half-life, approaching 0 with age. */
export function decayWeight(type: string, ageDays: number): number {
  const halfLife = decayHalfLifeDays(type);
  const age = Math.max(0, ageDays);
  return Math.pow(0.5, age / halfLife);
}

export type MemoryValueSignals = {
  /** 1 when the user stated it, lower when the system inferred it. */
  explicitness?: number;
  /** How often the behaviour was seen, 0..1. */
  frequency?: number;
  /** How much it affects future decisions, 0..1. */
  impact?: number;
  /** How many projects it reaches, 0..1. */
  scope?: number;
  /** How relevant it stays, 0..1. */
  futureRelevance?: number;
};

function clamp01(value: number | undefined, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

/**
 * The value score: explicitness + frequency + impact + scope + future
 * relevance, averaged. No signal starts at 0.5.
 */
export function memoryValueScore(signals: MemoryValueSignals = {}): number {
  const parts = [
    clamp01(signals.explicitness, 0.5),
    clamp01(signals.frequency, 0.5),
    clamp01(signals.impact, 0.5),
    clamp01(signals.scope, 0.5),
    clamp01(signals.futureRelevance, 0.5),
  ];
  return parts.reduce((sum, part) => sum + part, 0) / parts.length;
}

export type MemoryRetrievalInput = {
  type: string;
  updated_at?: string | null;
  importance?: number | null;
  source?: string | null;
  project_id?: string | null;
};

/**
 * How much a memory should influence the next capture: the keyword match,
 * weighted by how fresh it is, plus its level, importance and value.
 */
export function memoryRetrievalScore(
  row: MemoryRetrievalInput,
  options: { now: Date; keywordScore: number }
): number {
  const updated = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
  const ageDays = Number.isFinite(updated)
    ? Math.max(0, (options.now.getTime() - updated) / (24 * 3600 * 1000))
    : 0;
  const decay = decayWeight(row.type, ageDays);
  const level = memoryLevelFor(row.type);
  const importance = Number(row.importance);
  const value = memoryValueScore({
    explicitness: row.source === "user_explicit" ? 1 : row.source === "ai_inferred" ? 0.4 : 0.6,
    impact: Number.isFinite(importance) ? importance : undefined,
    scope: row.project_id ? 0.6 : 0.4,
    futureRelevance: decay,
  });
  return (
    options.keywordScore * (0.5 + 0.5 * decay) +
    level * 0.4 +
    (Number.isFinite(importance) ? importance : 0) +
    value * 0.5
  );
}
