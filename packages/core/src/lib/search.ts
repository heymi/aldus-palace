/**
 * Search text preparation for FTS5.
 *
 * FTS5's `unicode61` tokenizer does not split CJK, so "保持克制" is one token
 * and a query for "克制" finds nothing. Separating CJK characters before they
 * are indexed, and turning a CJK query into a quoted phrase of the same
 * characters, makes substring search work for Chinese and English on both
 * runtimes. See docs/RETRIEVER.md.
 */

const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;

export function hasCjk(text: string): boolean {
  return CJK.test(text);
}

/** Separate CJK characters with spaces, and collapse the rest of the spacing. */
export function segmentForSearch(text: string): string {
  return text
    .replace(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g, (char) => ` ${char} `)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn a user query into an FTS5 MATCH expression.
 *
 * Each word becomes a term: a CJK word becomes a quoted phrase of single
 * characters (so the characters must appear in order), and a Latin word becomes
 * a prefix term. The terms are OR-joined, so a memory that matches any of them
 * is a candidate; bm25 ranks the ones that match more, and the value score
 * re-ranks after it. Quotes are stripped so the expression stays valid.
 */
export function toMatchQuery(query: string): string {
  const cleaned = query.replace(/"/g, " ").trim();
  if (!cleaned) return "";
  const groups = cleaned
    .split(/[\s,，。！？、；;:：]+/)
    .filter(Boolean)
    .map((word) => {
      if (hasCjk(word)) {
        return `"${segmentForSearch(word).split(/\s+/).join(" ")}"`;
      }
      // Break a Latin word on characters FTS5 reads as syntax (a hyphen reads
      // as a column filter: "Mac-only" would look for a column named only).
      return word
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_]+/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((term) => `${term}*`)
        .join(" OR ");
    });
  return [...new Set(groups)].join(" OR ");
}
