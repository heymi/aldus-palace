/**
 * Redaction for cloud calls.
 *
 * The Privacy Gateway sends the minimum: known names become `[contact]`,
 * project and company names become `[business]`, money becomes `[amount]`, and
 * at higher levels email addresses and phone numbers become `[email]` and
 * `[phone]`. The mapping stays local.
 */

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const PHONE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g;
export const AMOUNT_RE =
  /(?:[$¥€£]|USD|CNY|RMB|人民币|美元)\s?\d[\d,]*(?:\.\d+)?\s?(?:万|亿|k|K|m|M)?|\d[\d,]*(?:\.\d+)?\s?(?:万|亿|元|美元)/g;

export type RedactionOptions = {
  /** Names to replace with `[contact]`. */
  contacts?: string[];
  /** Project or company names to replace with `[business]`. */
  organizations?: string[];
  /** Replace money with `[amount]`. */
  redactAmounts?: boolean;
  /** Replace emails and phone numbers. */
  redactPii?: boolean;
};

export type RedactionResult = {
  text: string;
  /** The kinds of thing that were replaced, for the audit trail. */
  redactions: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAll(
  text: string,
  term: string,
  replacement: string
): { text: string; replaced: boolean } {
  const trimmed = term.trim();
  if (trimmed.length < 2) return { text, replaced: false };
  const pattern = new RegExp(escapeRegExp(trimmed), "g");
  if (!pattern.test(text)) return { text, replaced: false };
  return { text: text.replace(pattern, replacement), replaced: true };
}

export function redactText(
  text: string,
  options: RedactionOptions = {}
): RedactionResult {
  let result = text;
  const redactions = new Set<string>();

  // Structured patterns first: a company name inside an email address must not
  // hide the address from the email rule.
  if (options.redactPii) {
    EMAIL_RE.lastIndex = 0;
    if (EMAIL_RE.test(result)) {
      EMAIL_RE.lastIndex = 0;
      result = result.replace(EMAIL_RE, "[email]");
      redactions.add("email");
    }
    PHONE_RE.lastIndex = 0;
    if (PHONE_RE.test(result)) {
      PHONE_RE.lastIndex = 0;
      result = result.replace(PHONE_RE, "[phone]");
      redactions.add("phone");
    }
  }
  if (options.redactAmounts) {
    AMOUNT_RE.lastIndex = 0;
    if (AMOUNT_RE.test(result)) {
      AMOUNT_RE.lastIndex = 0;
      result = result.replace(AMOUNT_RE, "[amount]");
      redactions.add("amount");
    }
  }
  for (const name of options.contacts ?? []) {
    const replaced = replaceAll(result, name, "[contact]");
    result = replaced.text;
    if (replaced.replaced) redactions.add("contact");
  }
  for (const name of options.organizations ?? []) {
    const replaced = replaceAll(result, name, "[business]");
    result = replaced.text;
    if (replaced.replaced) redactions.add("business");
  }

  return { text: result, redactions: [...redactions] };
}
