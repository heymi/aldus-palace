import {
  addDaysToDateKey,
  getLocalParts,
  isEarlyMorningAmbiguousHour,
  localDayWindow,
} from "./time.js";

export type RelativeToken = "明天" | "后天" | "tomorrow" | "day_after_tomorrow";

export type ClarificationOption = {
  id: string;
  label: string;
  /** Applied window when chosen */
  window_start: string;
  window_end: string;
};

export type EarlyMorningClarification = {
  kind: "early_morning_relative_day";
  token: RelativeToken;
  prompt: string;
  options: ClarificationOption[];
};

export type RelativeDayResolution =
  | {
      status: "resolved";
      window_start: string;
      window_end: string;
      label: string;
    }
  | {
      status: "needs_confirmation";
      clarification: EarlyMorningClarification;
    }
  | { status: "none" };

function detectToken(input: string): RelativeToken | null {
  // Prefer longer phrases first
  if (/\bday after tomorrow\b/i.test(input)) return "day_after_tomorrow";
  if (/后天/.test(input)) return "后天";
  if (/明天/.test(input)) return "明天";
  if (/\btomorrow\b/i.test(input)) return "tomorrow";
  return null;
}

/**
 * Resolve 明天/后天 relative to user timezone.
 * Rule: between local 00:00–05:00, require confirmation
 * (今天白天 vs 下一天 / 对应后天语义).
 */
export function resolveRelativeDay(
  input: string,
  timezone: string,
  at = new Date()
): RelativeDayResolution {
  const token = detectToken(input);
  if (!token) return { status: "none" };

  const local = getLocalParts(timezone, at);
  const today = local.dateKey;
  const tomorrow = addDaysToDateKey(today, 1);
  const dayAfter = addDaysToDateKey(today, 2);

  const isZh = token === "明天" || token === "后天";
  const isMingTian = token === "明天" || token === "tomorrow";
  const isHouTian = token === "后天" || token === "day_after_tomorrow";

  if (isEarlyMorningAmbiguousHour(local.hour)) {
    if (isMingTian) {
      const todayDay = localDayWindow(timezone, today, "daytime");
      const nextDay = localDayWindow(timezone, tomorrow, "full");
      return {
        status: "needs_confirmation",
        clarification: {
          kind: "early_morning_relative_day",
          token,
          prompt: isZh
            ? `现在是凌晨 ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}。你说的「明天」是指？`
            : `It's early morning (${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}). What did you mean by "tomorrow"?`,
          options: [
            {
              id: "today_daytime",
              label: isZh ? "今天白天" : "Later today (daytime)",
              window_start: todayDay.start,
              window_end: todayDay.end,
            },
            {
              id: "next_calendar_day",
              label: isZh ? "下一天（日历上的明天）" : "Next calendar day",
              window_start: nextDay.start,
              window_end: nextDay.end,
            },
          ],
        },
      };
    }

    if (isHouTian) {
      const tomorrowDay = localDayWindow(timezone, tomorrow, "daytime");
      const dayAfterFull = localDayWindow(timezone, dayAfter, "full");
      return {
        status: "needs_confirmation",
        clarification: {
          kind: "early_morning_relative_day",
          token,
          prompt: isZh
            ? `现在是凌晨 ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}。你说的「后天」是指？`
            : `It's early morning. What did you mean by "day after tomorrow"?`,
          options: [
            {
              id: "tomorrow_daytime",
              label: isZh ? "明天白天" : "Tomorrow daytime",
              window_start: tomorrowDay.start,
              window_end: tomorrowDay.end,
            },
            {
              id: "day_after_next",
              label: isZh ? "后天（再下一天）" : "Day after tomorrow",
              window_start: dayAfterFull.start,
              window_end: dayAfterFull.end,
            },
          ],
        },
      };
    }
  }

  // Non-ambiguous resolution
  if (isMingTian) {
    const w = localDayWindow(timezone, tomorrow, "full");
    return {
      status: "resolved",
      window_start: w.start,
      window_end: w.end,
      label: isZh ? "明天" : "tomorrow",
    };
  }
  if (isHouTian) {
    const w = localDayWindow(timezone, dayAfter, "full");
    return {
      status: "resolved",
      window_start: w.start,
      window_end: w.end,
      label: isZh ? "后天" : "day after tomorrow",
    };
  }

  return { status: "none" };
}

/** Detect other relative phrases that can auto-resolve (no early-morning special case). */
export function applySimpleRelativePhrases(
  input: string,
  timezone: string,
  at = new Date()
): { window_start?: string; window_end?: string; deadline?: string } | null {
  const local = getLocalParts(timezone, at);
  if (/周五|這周五|这周五|本周五/.test(input) || /\bfriday\b/i.test(input)) {
    // walk forward to Friday from local today
    let key = local.dateKey;
    for (let i = 0; i < 8; i++) {
      const [y, m, d] = key.split("-").map(Number);
      const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
      if (wd === 5) {
        const w = localDayWindow(timezone, key, "full");
        return { deadline: w.end, window_start: w.start, window_end: w.end };
      }
      key = addDaysToDateKey(key, 1);
    }
  }
  if (/下周/.test(input) || /\bnext week\b/i.test(input)) {
    const startKey = addDaysToDateKey(local.dateKey, 1);
    // rough: next 7 days from tomorrow
    const endKey = addDaysToDateKey(local.dateKey, 7);
    return {
      window_start: localDayWindow(timezone, startKey, "full").start,
      window_end: localDayWindow(timezone, endKey, "full").end,
    };
  }
  if (/今天|今日/.test(input) || /\btoday\b/i.test(input)) {
    const w = localDayWindow(timezone, local.dateKey, "full");
    return { window_start: w.start, window_end: w.end };
  }
  return null;
}
