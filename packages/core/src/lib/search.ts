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
 * A query with CJK becomes a quoted phrase of single characters, so the
 * characters must appear in order. A Latin query becomes prefix terms joined by
 * AND, which favours recall. Quotes are stripped so the expression stays valid.
 */
export function toMatchQuery(query: string): string {
  const cleaned = query.replace(/"/g, " ").trim();
  if (!cleaned) return "";
  if (hasCjk(cleaned)) {
    return `"${segmentForSearch(cleaned).split(/\s+/).join(" ")}"`;
  }
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `${term}*`)
    .join(" AND ");
}
