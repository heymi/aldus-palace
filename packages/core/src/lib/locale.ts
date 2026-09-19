/**
 * Runtime locale.
 *
 * Every string the runtime generates for a user follows `users.language`:
 * capture receipts, warnings, memory contents, action-log summaries. Machine
 * keys (`action_type`, `status`, `type`) stay stable and untranslated.
 */

export type Locale = "en" | "zh-CN";

export const DEFAULT_LOCALE: Locale = "en";

/** Map a user-language tag onto a supported locale. */
export function localeOf(language: string | null | undefined): Locale {
  const value = (language ?? "").toLowerCase();
  if (value.startsWith("zh")) return "zh-CN";
  return "en";
}

/** Pick the string for a locale. */
export function pick(locale: Locale, en: string, zh: string): string {
  return locale === "zh-CN" ? zh : en;
}

/** `1 item` / `2 items` — English only; Chinese has no plural form. */
export function plural(locale: Locale, count: number, singular: string): string {
  if (locale === "zh-CN") return singular;
  return count === 1 ? singular : `${singular}s`;
}

/** Interpolate `{name}` placeholders. */
export function fill(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    params[key] === undefined || params[key] === null ? "" : String(params[key])
  );
}
