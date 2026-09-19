/**
 * Map short natural-language replies onto pending clarification option ids.
 * Users often answer "今天" instead of tapping a button.
 */

export type OptionLike = { id: string; label: string };

export function matchClarificationReply(
  text: string,
  options: OptionLike[],
  token?: string | null
): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/\s+/g, "");

  // Exact / contains option label
  for (const o of options) {
    const label = o.label.toLowerCase().replace(/\s+/g, "");
    if (t === label || t.includes(label) || label.includes(t)) {
      return o.id;
    }
  }

  const ids = new Set(options.map((o) => o.id));

  // 明天 ambiguity options
  if (ids.has("today_daytime") && ids.has("next_calendar_day")) {
    if (
      /今天白天|今日白天|今天|今日|^today$|later today|this morning|白天/.test(
        raw
      ) &&
      !/明天|后天|tomorrow/.test(raw)
    ) {
      return "today_daytime";
    }
    if (
      /下一天|日历.*明天|明天|翌日|次日|tomorrow|next day|next calendar/.test(
        raw
      )
    ) {
      return "next_calendar_day";
    }
  }

  // 后天 ambiguity options
  if (ids.has("tomorrow_daytime") && ids.has("day_after_next")) {
    if (/明天白天|明天|tomorrow/.test(raw) && !/后天|day after/.test(raw)) {
      return "tomorrow_daytime";
    }
    if (/后天|再下一天|day after/.test(raw)) {
      return "day_after_next";
    }
  }

  // Object-mode answers: the user often answers "bug" / "要做的事" / "记录".
  if (ids.has("bug") && ids.has("task") && ids.has("note")) {
    if (/缺陷|故障|bug|defect|报错|坏了|不对/.test(raw)) return "bug";
    if (/要做|待办|任务|一件.*事|task|todo|to-?do|work/.test(raw)) return "task";
    if (/只是(记录|想法)|记录一下|笔记|note|just a note/.test(raw)) return "note";
  }

  // option id typed directly
  if (ids.has(t)) return t;

  // bare token echo with 是
  if (token && (t === token || t === `是${token}` || t === `就${token}`)) {
    // prefer "next calendar" style for 明天 token confirmation
    if (ids.has("next_calendar_day") && (token === "明天" || token === "tomorrow")) {
      return "next_calendar_day";
    }
    if (ids.has("day_after_next") && (token === "后天" || token === "day_after_tomorrow")) {
      return "day_after_next";
    }
  }

  return null;
}

/** True if text looks like a short answer rather than a new capture. */
export function looksLikeShortClarificationReply(text: string): boolean {
  const t = text.trim();
  // Very short: 今天 / 明天 / today / 下一天
  if (t.length <= 8) return true;
  // Explicit confirmation phrasing only
  if (
    /^(是|就|选|我选|选个)?(今天白天|今天|今日|明天白天|下一天|明天|后天|tomorrow|today)/i.test(
      t
    ) &&
    t.length < 36
  ) {
    return true;
  }
  // Object-mode answers are short by nature.
  if (/^(是|选|我选|就)?(一条缺陷|缺陷|故障|要做的事|一件要做的事|只是记录|记录|bug|defect|task|todo|note)$/i.test(t)) {
    return true;
  }
  return false;
}
