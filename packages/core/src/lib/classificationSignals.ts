/**
 * Per-user classification signals.
 *
 * When the user corrects how an input was classified ("this is a defect, not a
 * note"), the terms of that input are remembered. A later input that shares
 * enough terms is classified the same way without asking again. Deterministic,
 * local, and learned only from explicit corrections.
 */

import type { SqlDatabase } from "../db/port.js";
import { nowIso } from "../db/port.js";
import { newId } from "./id.js";

export type ObjectChoice = "bug" | "task" | "note";

const LATIN_WORD = /[a-z0-9]+/g;
const CJK_CHAR = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;

/**
 * Comparable terms: Latin words of three or more characters and CJK
 * three-character runs. Three characters, not two, so a shared topic word
 * ("记忆") does not by itself match a different sentence.
 */
export function classificationTerms(text: string): string[] {
  const lower = text.toLowerCase();
  const terms = new Set<string>();
  for (const word of lower.match(LATIN_WORD) ?? []) {
    if (word.length >= 3) terms.add(word);
  }
  // CJK three-character runs, rebuilt from the lower-case text.
  let run = "";
  const flush = () => {
    for (let i = 0; i + 3 <= run.length; i++) terms.add(run.slice(i, i + 3));
    run = "";
  };
  for (const char of lower) {
    if (CJK_CHAR.test(char)) run += char;
    else flush();
  }
  flush();
  return [...terms].slice(0, 80);
}

/** Remember the terms of a corrected input against the chosen mode. */
export async function rememberClassification(
  db: SqlDatabase,
  userId: string,
  text: string,
  mode: ObjectChoice
): Promise<number> {
  const terms = classificationTerms(text);
  if (!terms.length) return 0;
  const t = nowIso();
  for (const term of terms) {
    await db
      .prepare(
        `INSERT INTO classification_signals (id, user_id, term, mode, hits, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(user_id, term, mode)
         DO UPDATE SET hits = hits + 1, updated_at = excluded.updated_at`
      )
      .run(newId("sig"), userId, term, mode, t, t);
  }
  return terms.length;
}

/**
 * The mode a learned signal implies for this text, or null when there is no
 * confident match (or the signals conflict).
 *
 * One shared term is not enough: the matching terms must contribute at least
 * two hits in total, so a single repeated word cannot flip a classification.
 */
export async function matchClassificationSignal(
  db: SqlDatabase,
  userId: string,
  text: string
): Promise<ObjectChoice | null> {
  const terms = classificationTerms(text);
  if (!terms.length) return null;
  const placeholders = terms.map(() => "?").join(",");
  const rows = (await db
    .prepare(
      `SELECT mode, SUM(hits) AS hits FROM classification_signals
       WHERE user_id = ? AND term IN (${placeholders})
       GROUP BY mode ORDER BY hits DESC`
    )
    .all(userId, ...terms)) as Array<{ mode: string; hits: number }>;
  if (!rows.length) return null;
  const [best, second] = rows;
  if (Number(best.hits) < 2) return null;
  if (second && Number(second.hits) >= Number(best.hits)) return null;
  return best.mode as ObjectChoice;
}
