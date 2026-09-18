/**
 * Action log human text catalog.
 * - action_type: stable machine key (never localize the key)
 * - summary: locale-facing string written at log time
 *
 * Default locale: zh-CN. Swap table when adding languages.
 */

export type ActionLocale = "zh-CN" | "en";

const DEFAULT: ActionLocale = "zh-CN";

type MsgFn = (p?: Record<string, unknown>) => string;

function thoughtTypeLabel(t: string, locale: ActionLocale): string {
  if (locale === "en") return t;
  switch (t) {
    case "idea":
      return "想法";
    case "insight":
      return "洞察";
    case "observation":
      return "观察";
    case "research":
      return "研究";
    case "decision_candidate":
      return "决策候选";
    default:
      return t;
  }
}

function memoryTypeLabel(t: string, locale: ActionLocale): string {
  if (locale === "en") return t;
  switch (t) {
    case "preference":
      return "偏好";
    case "principle":
      return "原则";
    case "project_context":
      return "项目背景";
    case "decision":
      return "决策";
    case "experience":
      return "经历";
    default:
      return t;
  }
}

function build(locale: ActionLocale): Record<string, MsgFn> {
  const zh = locale === "zh-CN";
  return {
    input_captured: (p) => {
      if (p?.kind === "clarification_reply") {
        return zh ? "用文字回答了时间确认" : "Answered clarification in text";
      }
      return zh ? "提交了一条输入" : "Submitted input";
    },
    processing_input: () => (zh ? "正在理解输入" : "Processing input"),
    objects_extracted: (p) => {
      const th = Number(p?.thoughts ?? 0);
      const cm = Number(p?.commitments ?? 0);
      const mem = Number(p?.memories ?? 0);
      if (zh) {
        return `理解完成：想法 ${th} · 要做 ${cm} · 记忆候选 ${mem}`;
      }
      return `Extracted ${th} thoughts, ${cm} commitments, ${mem} memory candidates`;
    },
    thought_created: (p) => {
      const t = p?.type ? thoughtTypeLabel(String(p.type), locale) : null;
      if (zh) return t ? `整理出想法（${t}）` : "整理出想法";
      return t ? `Created thought (${t})` : "Created thought";
    },
    commitment_created: (p) => {
      const title = p?.title ? String(p.title) : "";
      if (zh) return title ? `记下要做的事：${title}` : "记下要做的事";
      return title ? `Created commitment: ${title}` : "Created commitment";
    },
    clarification_requested: (p) => {
      const token = p?.token ? String(p.token) : "";
      if (zh) return token ? `需要确认时间：${token}` : "需要确认时间";
      return token
        ? `Need confirmation for relative day: ${token}`
        : "Need confirmation";
    },
    clarification_resolved: (p) => {
      const label = p?.label ? String(p.label) : "";
      if (zh) return label ? `已确认时间：${label}` : "已确认时间";
      return label ? `Resolved time: ${label}` : "Resolved time";
    },
    memory_candidate_created: (p) => {
      const t = p?.type ? memoryTypeLabel(String(p.type), locale) : null;
      if (zh) return t ? `提炼记忆候选（${t}）` : "提炼记忆候选";
      return t ? `Memory candidate (${t})` : "Memory candidate";
    },
    memory_context_injected: (p) => {
      const n = Number(p?.count ?? 0);
      if (zh) return n > 0 ? `参考了 ${n} 条已确认记忆` : "参考了已确认记忆";
      return `Injected ${n} active memories into understanding`;
    },
    memory_confirmed: (p) => {
      const n = Number(p?.concept_count ?? 0);
      if (zh) return n > 0 ? `确认了记忆（关联 ${n} 个概念）` : "确认了记忆";
      return n > 0
        ? `Confirmed memory + ${n} concepts`
        : "Confirmed memory";
    },
    memory_rejected: () => (zh ? "丢弃了记忆候选" : "Rejected memory candidate"),
    memory_updated: () => (zh ? "修改了记忆" : "Updated memory"),
    memory_deleted: () => (zh ? "删除了记忆" : "Deleted memory"),
    thought_converted: (p) => {
      const title = p?.title ? String(p.title) : "";
      if (zh) return title ? `想法转为要做：${title}` : "想法转为要做的事";
      return title
        ? `Converted thought → work: ${title}`
        : "Converted thought";
    },
    thought_updated: () => (zh ? "修改了想法" : "Updated thought"),
    thought_deleted: () => (zh ? "删除了想法" : "Deleted thought"),
    user_started: () => (zh ? "开始推进一件事" : "Started commitment"),
    user_completed: () => (zh ? "完成了一件事" : "Completed commitment"),
    commitment_cancelled: () =>
      zh ? "取消了一件要做的事" : "Cancelled commitment",
    commitment_updated: () => (zh ? "修改了要做的事" : "Updated commitment"),
    commitment_deleted: () => (zh ? "删除了要做的事" : "Deleted commitment"),
    commitment_titles_rewritten: (p) => {
      const n = Number(p?.count ?? 0);
      if (zh) return n > 0 ? `重写了 ${n} 条可执行标题` : "重写了标题";
      return `Rewrote ${n} commitment titles`;
    },
    commitments_deduped: (p) => {
      const n = Number(p?.count ?? 0);
      if (zh) return n > 0 ? `清理了 ${n} 条重复事项` : "清理了重复事项";
      return `Cancelled ${n} duplicate commitments`;
    },
    work_classification_rebuilt: (p) => {
      const groups = Number(p?.groups ?? 0);
      const items = Number(p?.items ?? 0);
      if (zh) return `整理了 ${items} 件要做的事 · ${groups} 条工作脉络`;
      return `Organized ${items} commitments into ${groups} work streams`;
    },
    work_classification_overridden: (p) => {
      const label = p?.label ? String(p.label) : "";
      if (zh) return label ? `调整工作脉络：${label}` : "调整了工作脉络";
      return label ? `Moved work to: ${label}` : "Adjusted work stream";
    },
    memories_deduped: (p) => {
      const n = Number(p?.count ?? 0);
      if (zh) return n > 0 ? `归档了 ${n} 条重复记忆` : "归档了重复记忆";
      return `Archived ${n} duplicate memories`;
    },
    project_created: (p) => {
      const name = p?.name ? String(p.name) : "";
      if (zh) return name ? `新建项目：${name}` : "新建项目";
      return name ? `Created project: ${name}` : "Created project";
    },
    project_updated: (p) => {
      const name = p?.name ? String(p.name) : "";
      if (zh) return name ? `修改了项目：${name}` : "修改了项目";
      return name ? `Updated project: ${name}` : "Updated project";
    },
    project_deleted: (p) => {
      const name = p?.name ? String(p.name) : "";
      if (zh) return name ? `删除了项目：${name}` : "删除了项目";
      return name ? `Deleted project: ${name}` : "Deleted project";
    },
    project_relinked: (p) => {
      const t = Number(p?.thoughts ?? 0);
      const c = Number(p?.commitments ?? 0);
      if (zh) return `回溯关联：想法 ${t} · 要做 ${c}`;
      return `Relinked: thoughts ${t} · commitments ${c}`;
    },
  };
}

const tables: Record<ActionLocale, Record<string, MsgFn>> = {
  "zh-CN": build("zh-CN"),
  en: build("en"),
};

/** Build localized summary for an action_type. */
export function actionSummary(
  actionType: string,
  params?: Record<string, unknown>,
  locale: ActionLocale = DEFAULT
): string {
  const fn = tables[locale][actionType];
  if (fn) return fn(params);
  if (locale === "zh-CN") return `系统动作：${actionType}`;
  return actionType.replace(/_/g, " ");
}
