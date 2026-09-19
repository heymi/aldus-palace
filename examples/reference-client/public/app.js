/* Reference client, shaped like a macOS app: a source list, a content pane and
   an inspector, with a quick-capture sheet from anywhere (⌘K). */

import {
  EXAMPLES,
  LANGS,
  detectLang,
  localeTag,
  saveLang,
  serverLanguage,
  translator,
} from "./i18n.js";

const $ = (id) => document.getElementById(id);

const SECTIONS = ["home", "thoughts", "projects", "memory", "decisions", "activity", "input"];

const ICONS = {
  home: '<path d="M4 10.6 12 4l8 6.6M6 9.8V20h12V9.8"/>',
  thoughts:
    '<path d="M9.5 18h5M10.5 21h3M12 3.5a6 6 0 0 0-3.9 10.6c.6.5 1 1.3 1 2.1h5.8c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3.5Z"/>',
  projects: '<path d="M3.5 7A2 2 0 0 1 5.5 5h3.8l1.8 2h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2Z"/>',
  memory: '<path d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  decisions: '<path d="M12 3.5 19 6.5v5.7c0 4-2.9 6.6-7 8-4.1-1.4-7-4-7-8V6.5ZM9.3 11.8l2 2 3.4-3.4"/>',
  activity: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  input: '<path d="M4 20h4.2L20 8.2 15.8 4 4 15.8ZM14.5 5.3 18.7 9.5"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

const state = {
  lang: detectLang(),
  section: "home",
  today: null,
  thoughts: null,
  projects: null,
  memories: null,
  actions: null,
  activity: null,
  memoryFilter: "active",
  selection: null,
  inspector: null,
  captureBusy: false,
  lastReceipt: null,
  error: null,
};

let t = translator(state.lang);
let languageReady = Promise.resolve();

/* --- helpers -------------------------------------------------------------- */

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function when(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeTag(state.lang), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clock(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeTag(state.lang), { hour: "2-digit", minute: "2-digit" }).format(date);
}

function dayLabel(dateKey, withTime = false) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}${withTime ? "T12:00:00" : "T12:00:00"}`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat(localeTag(state.lang), {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function plural(count, base) {
  return t(`${base}.${count === 1 ? "one" : "other"}`, { n: count });
}

function freshness(decay) {
  const value = Number(decay ?? 0);
  if (value >= 0.9) return "fresh";
  if (value >= 0.7) return "settling";
  if (value >= 0.4) return "fading";
  return "old";
}

function kindLabel(type) {
  const key = `kind.${type}`;
  const label = t(key);
  return label === key ? String(type ?? "") : label;
}

function stateLabel(value) {
  const key = `state.${value}`;
  const label = t(key);
  return label === key ? String(value ?? "") : label;
}

function riskLabel(risk) {
  const key = `risk.${risk}`;
  const label = t(key);
  return label === key ? String(risk ?? "") : label;
}

function actionLabel(type) {
  const key = `action.${type}`;
  const label = t(key);
  return label === key ? String(type ?? "").replace(/_/g, " ") : label;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.greeting.morning");
  if (hour < 18) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

/* --- chrome --------------------------------------------------------------- */

function renderLangSwitch() {
  $("lang-switch").innerHTML = LANGS.map(
    (lang) =>
      `<button type="button" data-lang="${lang}" aria-pressed="${state.lang === lang}">${
        lang === "zh" ? "中文" : "EN"
      }</button>`
  ).join("");
}

function renderSidebar() {
  const candidates = (state.memories ?? []).filter((m) => m.state === "candidate").length;
  const waiting = (state.actions ?? []).filter(
    (a) => a.status === "proposed" || a.status === "pending_second"
  ).length;
  const counts = {
    home: 0,
    thoughts: state.thoughts?.length ?? 0,
    projects: state.projects?.length ?? 0,
    memory: candidates,
    decisions: waiting,
    activity: 0,
    input: 0,
  };
  $("sidebar").innerHTML = SECTIONS.map(
    (section) => `
    <button type="button" class="nav-item" data-section="${section}"
            ${state.section === section ? 'aria-current="page"' : ""}>
      ${icon(section)}
      <span>${esc(t(`nav.${section}`))}</span>
      ${counts[section] ? `<span class="badge">${counts[section]}</span>` : ""}
    </button>`
  ).join("");
}

function applyChrome() {
  document.documentElement.lang = localeTag(state.lang);
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    const text = t(node.dataset.i18nPlaceholder);
    node.placeholder = text;
    node.setAttribute("aria-label", text);
  }
  $("footer-text").innerHTML = t("footer.note");
  $("lang-switch").setAttribute("aria-label", t("toolbar.language"));
  $("sidebar").setAttribute("aria-label", t("nav.label"));
  $("sheet-hint").textContent = t("sheet.hint");
  renderLangSwitch();
}

/* --- data ----------------------------------------------------------------- */

async function load(section) {
  state.error = null;
  try {
    if (section === "home") {
      const [today, thoughts, actions, memories] = await Promise.all([
        api("/v1/today"),
        api("/v1/thoughts"),
        api("/v1/actions?status=all"),
        api("/v1/memories"),
      ]);
      state.today = today;
      state.thoughts = thoughts.items ?? [];
      state.actions = actions.items ?? [];
      state.memories = memories.items ?? [];
    } else if (section === "thoughts") {
      state.thoughts = (await api("/v1/thoughts")).items ?? [];
    } else if (section === "projects") {
      state.projects = (await api("/v1/projects")).items ?? [];
    } else if (section === "memory") {
      const memories = await api("/v1/memories");
      state.memories = memories.items ?? [];
      state.actions = state.actions ?? (await api("/v1/actions?status=all")).items ?? [];
    } else if (section === "decisions") {
      state.actions = (await api("/v1/actions?status=all")).items ?? [];
    } else if (section === "activity") {
      state.activity = (await api("/v1/activity")).items ?? [];
    }
  } catch (error) {
    state.error = error.message;
  }
}

function pendingActions() {
  return (state.actions ?? []).filter(
    (action) => action.status === "proposed" || action.status === "pending_second"
  );
}

function commitmentById(id) {
  const today = state.today;
  if (!today) return null;
  return [today.now, ...(today.timeline ?? []), ...(today.risks ?? [])].find(
    (row) => row && row.id === id
  );
}

/* --- render: head --------------------------------------------------------- */

function renderHead() {
  $("section-title").textContent = t(`${state.section}.title`);
  $("section-subtitle").textContent = t(`${state.section}.subtitle`) ?? "";
  const actions = $("section-actions");
  if (state.section === "memory") {
    actions.innerHTML = `
      <div class="seg" role="group">
        ${["active", "candidate", "all"]
          .map(
            (filter) => `<button type="button" data-filter="${filter}"
              aria-pressed="${state.memoryFilter === filter}">${esc(t(`memory.filter.${filter}`))}</button>`
          )
          .join("")}
      </div>`;
  } else {
    actions.innerHTML = "";
  }
}

/* --- render: panes -------------------------------------------------------- */

function row(kind, id, primary, secondary, tail, selected) {
  return `
    <button type="button" class="row" data-kind="${esc(kind)}" data-id="${esc(id)}"
            aria-selected="${selected ? "true" : "false"}">
      <span class="primary">${esc(primary)}${secondary ? `<span class="secondary">${esc(secondary)}</span>` : ""}</span>
      ${tail ? `<span class="tail">${esc(tail)}</span>` : ""}
    </button>`;
}

function renderHome() {
  const today = state.today;
  if (!today) return `<p class="empty">${esc(t("loading"))}</p>`;
  const now = today.now;
  const timeline = (today.timeline ?? []).filter((item) => !now || item.id !== now.id);
  const risks = (today.risks ?? []).slice(0, 4);
  const recent = (state.thoughts ?? []).slice(0, 4);
  const waiting = pendingActions();

  const nowCard = now
    ? `<div class="card">
         <span class="label" style="margin:0 0 4px">${esc(t("home.now"))}</span>
         <p class="card-title">${esc(now.title)}</p>
         <p class="card-why">${esc((now.now_reason ?? []).join(" · "))}</p>
         <div class="card-actions">
           <button type="button" class="primary" data-act="start" data-id="${esc(now.id)}">${esc(t("home.start"))}</button>
           <button type="button" class="ghost" data-act="complete" data-id="${esc(now.id)}">${esc(t("home.done"))}</button>
           <button type="button" class="ghost" data-act="later" data-id="${esc(now.id)}">${esc(t("home.later"))}</button>
         </div>
       </div>`
    : `<p class="empty">${t("home.noNow")}</p>`;

  const timelineRows = timeline
    .map((item) =>
      row(
        "commitment",
        item.id,
        item.title,
        item.kind_label,
        clock(item.ai_slot_start) || when(item.deadline ?? item.window_end),
        state.selection?.id === item.id
      )
    )
    .join("");

  const riskRows = risks
    .map((item) =>
      row("commitment", item.id, item.title, t("home.risks"), when(item.deadline), state.selection?.id === item.id)
    )
    .join("");

  const thoughtRows = recent
    .map((thought) =>
      row(
        "thought",
        thought.id,
        thought.title ?? thought.content,
        kindLabel(thought.type),
        when(thought.updated_at ?? thought.created_at),
        state.selection?.id === thought.id
      )
    )
    .join("");

  const decisionRow = waiting.length
    ? row(
        "section",
        "decisions",
        actionLabel(waiting[0].action_type),
        plural(waiting.length, "receipt.decision"),
        t("home.viewAll"),
        false
      )
    : "";

  return `
    <p class="label">${esc(greeting())} · ${esc(dayLabel(today.date_key))}</p>
    ${nowCard}
    ${timelineRows ? `<span class="label">${esc(t("home.timeline"))}</span>${timelineRows}` : ""}
    ${riskRows ? `<span class="label">${esc(t("home.risks"))}</span>${riskRows}` : ""}
    ${decisionRow ? `<span class="label">${esc(t("home.decisions"))}</span>${decisionRow}` : ""}
    ${thoughtRows ? `<span class="label">${esc(t("home.recentThoughts"))}</span>${thoughtRows}` : ""}
  `;
}

function renderThoughts() {
  const items = state.thoughts ?? [];
  if (!items.length) return `<p class="empty">${t("thoughts.empty")}</p>`;
  return items
    .map((thought) =>
      row(
        "thought",
        thought.id,
        thought.title ?? thought.content,
        kindLabel(thought.type),
        when(thought.updated_at ?? thought.created_at),
        state.selection?.id === thought.id
      )
    )
    .join("");
}

function renderProjects() {
  const items = state.projects ?? [];
  if (!items.length) return `<p class="empty">${t("projects.empty")}</p>`;
  return items
    .map((project) =>
      row(
        "project",
        project.id,
        project.name,
        project.description ?? project.brief ?? "",
        `${project.commitment_count ?? 0} ${t("projects.commitments")}`,
        state.selection?.id === project.id
      )
    )
    .join("");
}

function renderMemory() {
  const all = state.memories ?? [];
  const items = all.filter((memory) => {
    if (state.memoryFilter === "all") return true;
    return memory.state === state.memoryFilter;
  });
  if (!items.length) return `<p class="empty">${t(`memory.empty.${state.memoryFilter}`)}</p>`;
  return items
    .map((memory) =>
      row(
        "memory",
        memory.id,
        memory.content,
        `${kindLabel(memory.type)} · ${t(`fresh.${freshness(memory.decay)}`)}`,
        memory.state === "candidate" ? t("memory.candidate") : "",
        state.selection?.id === memory.id
      )
    )
    .join("");
}

function renderDecisions() {
  const items = pendingActions();
  if (!items.length) return `<p class="empty">${t("decisions.empty")}</p>`;
  return items
    .map((action) =>
      row(
        "action",
        action.id,
        actionLabel(action.action_type),
        action.reason ?? "",
        action.status === "pending_second" ? t("decisions.second") : riskLabel(action.risk),
        state.selection?.id === action.id
      )
    )
    .join("");
}

function renderActivity() {
  const items = state.activity ?? [];
  if (!items.length) return `<p class="empty">${t("activity.empty")}</p>`;
  return items
    .map(
      (item) => `
      <div class="log">
        <span class="who">${esc(t(`activity.actor.${item.actor ?? "agent"}`))}</span>
        <span class="what">${esc(item.summary ?? item.action_type)}</span>
        <span class="when">${esc(when(item.created_at))}</span>
      </div>`
    )
    .join("");
}

function composerPane() {
  const receipt = state.lastReceipt
    ? renderReceipt(state.lastReceipt.card, state.lastReceipt.noteKey)
    : "";
  return `
    <div class="card">
      <p class="card-why" style="margin-top:0">${esc(t("input.subtitle"))}</p>
      <form id="input-form">
        <textarea id="input" rows="2" data-i18n-placeholder="input.placeholder"></textarea>
        <div class="sheet-actions">
          <button type="submit" class="primary" id="input-button">${esc(t("input.button"))}</button>
          <span class="hint" id="input-hint">${esc(t("input.hint"))}</span>
        </div>
      </form>
      <div class="chips" id="input-examples">
        <span class="chips-label">${esc(t("input.try"))}</span>
        ${EXAMPLES[state.lang]
          .map((sentence) => `<button type="button" class="chip" data-example="${esc(sentence)}">${esc(sentence)}</button>`)
          .join("")}
      </div>
    </div>
    ${state.lastReceipt ? `<span class="label">${esc(t("input.lastResult"))}</span>${receipt}` : ""}`;
}

function renderPanes() {
  const pane = $("panes");
  if (state.error) {
    pane.innerHTML = `<p class="empty">${esc(t("api.unreachable", { message: state.error }))}</p>`;
    return;
  }
  if (state.section === "home") pane.innerHTML = renderHome();
  else if (state.section === "thoughts") pane.innerHTML = renderThoughts();
  else if (state.section === "projects") pane.innerHTML = renderProjects();
  else if (state.section === "memory") pane.innerHTML = renderMemory();
  else if (state.section === "decisions") pane.innerHTML = renderDecisions();
  else if (state.section === "activity") pane.innerHTML = renderActivity();
  else pane.innerHTML = composerPane();
  const placeholder = pane.querySelector("[data-i18n-placeholder]");
  if (placeholder) {
    placeholder.placeholder = t("input.placeholder");
    placeholder.setAttribute("aria-label", t("input.placeholder"));
  }
}

/* --- render: inspector ---------------------------------------------------- */

function inspectorFields(pairs) {
  return `<dl class="fields">${pairs
    .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${value}</dd>`)
    .join("")}</dl>`;
}

function renderInspector() {
  const node = $("inspector");
  const split = $("split");
  if (!state.selection) {
    node.hidden = true;
    node.innerHTML = "";
    split.classList.remove("has-inspector");
    return;
  }
  node.hidden = false;
  split.classList.add("has-inspector");

  if (state.inspector?.status === "loading") {
    node.innerHTML = `<p class="empty">${esc(t("loading"))}</p>`;
    return;
  }
  if (state.inspector?.status === "error") {
    node.innerHTML = `<p class="empty">${esc(state.inspector.message)}</p>`;
    return;
  }

  const { kind, id } = state.selection;

  if (kind === "commitment") {
    const item = commitmentById(id);
    if (!item) {
      node.innerHTML = `<p class="empty">${esc(t("loading"))}</p>`;
      return;
    }
    node.innerHTML = `
      <span class="kicker">${esc(t("home.today"))}</span>
      <h2>${esc(item.title)}</h2>
      ${inspectorFields([
        [t("thoughts.status"), esc(stateLabel(item.status))],
        [t("home.timeline"), esc(when(item.window_end ?? item.deadline) || "—")],
        [t("memory.why"), esc((item.now_reason ?? []).join(" · ") || "—")],
      ])}
      <div class="inspector-actions">
        <button type="button" class="primary" data-act="start" data-id="${esc(id)}">${esc(t("home.start"))}</button>
        <button type="button" class="ghost" data-act="complete" data-id="${esc(id)}">${esc(t("home.done"))}</button>
        <button type="button" class="ghost" data-act="later" data-id="${esc(id)}">${esc(t("home.later"))}</button>
      </div>`;
    return;
  }

  if (kind === "thought") {
    const data = state.inspector?.data;
    const thought = data?.thought ?? state.thoughts?.find((x) => x.id === id) ?? {};
    node.innerHTML = `
      <span class="kicker">${esc(t("thoughts.detail"))}</span>
      <h2>${esc(thought.title ?? thought.content)}</h2>
      ${thought.content && thought.content !== thought.title ? `<blockquote>${esc(thought.content)}</blockquote>` : ""}
      ${inspectorFields([
        [t("thoughts.type"), esc(kindLabel(thought.type))],
        [t("thoughts.status"), esc(stateLabel(thought.status))],
        [t("thoughts.original"), esc(thought.original_excerpt ?? thought.source_input_content ?? "—")],
        [t("activity.title"), esc(when(thought.created_at))],
      ])}
      <div class="inspector-actions">
        <button type="button" class="primary" data-act="convert" data-id="${esc(id)}">${esc(t("thoughts.convert"))}</button>
      </div>
      ${
        thought.source_input_id
          ? `<h3>${esc(t("reclassify.title"))}</h3>
             <div class="inspector-actions">
               <button type="button" class="ghost" data-act="reclassify" data-mode="bug" data-input="${esc(thought.source_input_id)}">${esc(t("reclassify.bug"))}</button>
               <button type="button" class="ghost" data-act="reclassify" data-mode="task" data-input="${esc(thought.source_input_id)}">${esc(t("reclassify.task"))}</button>
               <button type="button" class="ghost" data-act="reclassify" data-mode="note" data-input="${esc(thought.source_input_id)}">${esc(t("reclassify.note"))}</button>
             </div>`
          : ""
      }`;
    return;
  }

  if (kind === "project") {
    const data = state.inspector?.data;
    const project = data?.project ?? state.projects?.find((x) => x.id === id) ?? {};
    const recent = (data?.commitments ?? []).slice(0, 5);
    node.innerHTML = `
      <span class="kicker">${esc(t("projects.detail"))}</span>
      <h2>${esc(project.name)}</h2>
      ${project.description || project.brief ? `<blockquote>${esc(project.description ?? project.brief)}</blockquote>` : ""}
      ${inspectorFields([
        [t("projects.thoughts"), String(project.thought_count ?? (data?.thoughts ?? []).length ?? 0)],
        [t("projects.commitments"), String(project.commitment_count ?? (data?.commitments ?? []).length ?? 0)],
      ])}
      ${
        recent.length
          ? `<h3>${esc(t("projects.recent"))}</h3>${recent
              .map((c) => `<p>${esc(c.title)} <span class="muted">· ${esc(stateLabel(c.status))}</span></p>`)
              .join("")}`
          : ""
      }`;
    return;
  }

  if (kind === "memory") {
    const memory = state.memories?.find((x) => x.id === id) ?? {};
    const source = state.inspector?.source;
    const versions = state.inspector?.versions ?? [];
    node.innerHTML = `
      <span class="kicker">${esc(t("memory.detail"))}</span>
      <h2>${esc(memory.content)}</h2>
      ${inspectorFields([
        [t("thoughts.type"), esc(kindLabel(memory.type))],
        [t("thoughts.status"), esc(stateLabel(memory.state))],
        [t("memory.why"), esc(memory.source === "user_explicit" ? t("remembered") : t("fresh." + freshness(memory.decay)))],
        [t("memory.source"), esc(when(memory.updated_at))],
      ])}
      ${
        source
          ? `<h3>${esc(t("memory.source"))}</h3><blockquote>${esc(source.content)}</blockquote>
             ${inspectorFields([
               [t("memory.source"), esc(source.source ?? "—")],
               [t("thoughts.original"), esc(when(source.created_at))],
             ])}`
          : ""
      }
      ${
        versions.length
          ? `<h3>${esc(t("memory.versions"))}</h3>${versions
              .map(
                (v) =>
                  `<p>${esc(v.content)} <span class="muted">· ${esc(stateLabel(v.state ?? v.status))} · ${esc(when(v.updated_at))}</span></p>`
              )
              .join("")}`
          : ""
      }
      ${
        memory.state === "candidate"
          ? `<div class="inspector-actions">
               <button type="button" class="primary" data-act="confirm" data-id="${esc(id)}">${esc(t("memory.confirm"))}</button>
               <button type="button" class="ghost" data-act="reject" data-id="${esc(id)}">${esc(t("memory.reject"))}</button>
             </div>`
          : ""
      }`;
    return;
  }

  if (kind === "action") {
    const action = state.actions?.find((x) => x.id === id) ?? {};
    const second = action.status === "pending_second";
    node.innerHTML = `
      <span class="kicker">${esc(t("decisions.detail"))}</span>
      <h2>${esc(actionLabel(action.action_type))}</h2>
      ${inspectorFields([
        [t("decisions.risk"), esc(riskLabel(action.risk))],
        [t("decisions.status"), esc(second ? t("decisions.second") : stateLabel(action.status))],
        [t("decisions.reason"), esc(action.reason ?? "—")],
      ])}
      ${action.payload ? `<h3>${esc(t("decisions.payload"))}</h3><p class="muted">${esc(JSON.stringify(action.payload))}</p>` : ""}
      <div class="inspector-actions">
        <button type="button" class="primary" data-act="approve" data-id="${esc(id)}">
          ${esc(t(second ? "decisions.approveAgain" : "decisions.approve"))}
        </button>
        <button type="button" class="ghost" data-act="reject-action" data-id="${esc(id)}">${esc(t("decisions.reject"))}</button>
      </div>`;
    return;
  }
}

/* --- selection ------------------------------------------------------------ */

async function select(kind, id) {
  if (state.selection?.kind === kind && state.selection?.id === id) {
    state.selection = null;
    state.inspector = null;
    render();
    return;
  }
  state.selection = { kind, id };
  state.inspector = { status: "loading" };
  render();

  try {
    if (kind === "thought") {
      const data = await api(`/v1/thoughts/${encodeURIComponent(id)}`);
      state.inspector = { status: "ready", data: { thought: data.thought ?? data } };
    } else if (kind === "project") {
      const data = await api(`/v1/projects/${encodeURIComponent(id)}`);
      state.inspector = { status: "ready", data };
    } else if (kind === "memory") {
      const memory = state.memories?.find((x) => x.id === id);
      const versions = (await api(`/v1/memories/${encodeURIComponent(id)}/versions`).catch(() => ({}))).versions ?? [];
      let source = null;
      if (memory?.source_input_id) {
        const input = await api(`/v1/inputs/${encodeURIComponent(memory.source_input_id)}`).catch(() => null);
        source = input?.raw_input ?? null;
      }
      state.inspector = { status: "ready", versions, source };
    } else {
      state.inspector = { status: "ready" };
    }
  } catch (error) {
    state.inspector = { status: "error", message: error.message };
  }
  render();
}

function render() {
  renderSidebar();
  renderHead();
  renderPanes();
  renderInspector();
  renderStatus();
}

function renderStatus() {
  const today = state.today;
  const parts = [];
  if (today?.date_key) parts.push(dayLabel(today.date_key));
  if (today?.planning?.mode) parts.push(t(`today.mode.${today.planning.mode}`));
  $("status").textContent = parts.join(" · ");
  const open = (today?.timeline ?? []).length;
  const remembered = (state.memories ?? []).filter((m) => m.state === "active").length;
  const waiting = pendingActions().length;
  $("statusbar").textContent = [
    open ? t("statusbar.scheduled", { n: open }) : "",
    remembered ? t("statusbar.remembered", { n: remembered }) : "",
    waiting ? t("statusbar.waiting", { n: waiting }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/* --- navigation ----------------------------------------------------------- */

async function navigate(section) {
  if (!SECTIONS.includes(section)) section = "home";
  state.section = section;
  state.selection = null;
  state.inspector = null;
  if (window.location.hash !== `#${section}`) window.history.replaceState(null, "", `#${section}`);
  render();
  await load(section);
  render();
}

/* --- capture -------------------------------------------------------------- */

function renderReceipt(card, noteKey) {
  if (!card) return "";
  const note = noteKey ? t(noteKey) : "";
  const group = (label, rows) =>
    rows.length
      ? `<div class="receipt-group"><span class="receipt-group-label">${esc(label)}</span>${rows.join("")}</div>`
      : "";
  const item = (value, tail) =>
    `<div class="receipt-item"><span>${esc(value)}</span>${tail ? `<span class="tail">${esc(tail)}</span>` : ""}</div>`;

  const commitments = (card.commitments ?? []).map((c) => item(c.title, when(c.window_end ?? c.deadline) || t("receipt.noDate")));
  const memories = (card.memory_candidates ?? []).map((m) => item(m.content, kindLabel(m.type)));
  const thoughts = (card.thoughts ?? []).map((th) => item(th.title ?? th.content ?? ""));
  const decisions = (card.decisions ?? []).map((d) => item(d.title, kindLabel("decision")));

  const parts = [];
  if (commitments.length) parts.push(plural(commitments.length, "receipt.commitment"));
  if (memories.length) parts.push(plural(memories.length, "receipt.memory"));
  if (thoughts.length) parts.push(plural(thoughts.length, "receipt.thought"));
  if (decisions.length) parts.push(plural(decisions.length, "receipt.decision"));

  const clarifications = (card.clarifications ?? []).map(
    (clar) => `
      <div class="clarify" data-clarify="${esc(clar.id)}">
        <p class="clarify-q">${esc(clar.prompt)}</p>
        <div class="clarify-options">
          ${(clar.options ?? [])
            .map(
              (option) =>
                `<button type="button" class="ghost" data-clarify-id="${esc(clar.id)}"
                   data-clarify-option="${esc(option.id)}">${esc(option.label)}</button>`
            )
            .join("")}
        </div>
      </div>`
  );

  // The clarification prompt is also a warning on the card; the question block
  // already carries it, so do not print it twice.
  const prompts = new Set((card.clarifications ?? []).map((c) => c.prompt));
  const notes = (card.warnings ?? []).filter((warning) => !prompts.has(warning));

  const links = [
    commitments.length ? `<a class="receipt-link" href="#home">${esc(t("receipt.seeHome"))}</a>` : "",
    memories.length ? `<a class="receipt-link" href="#memory">${esc(t("receipt.seeMemory"))}</a>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <p class="receipt-title">${esc(t("receipt.captured"))}${parts.length ? ` ${esc(parts.join(state.lang === "zh" ? "、" : ", "))}` : ""}${note ? ` <span class="muted">· ${esc(note)}</span>` : ""}</p>
    ${group(t("receipt.commitments"), commitments)}
    ${group(t("receipt.memories"), memories)}
    ${group(t("receipt.thoughts"), thoughts)}
    ${group(t("receipt.decisions"), decisions)}
    ${clarifications.length ? `<div class="receipt-group"><span class="receipt-group-label">${esc(t("receipt.question"))}</span>${clarifications.join("")}</div>` : ""}
    ${notes.length ? `<p class="warn">${notes.map(esc).join("<br />")}</p>` : ""}
    ${links ? `<p style="margin:8px 0 0">${links}</p>` : ""}`;
}

async function runCapture(content, target) {
  if (state.captureBusy) return;
  state.captureBusy = true;
  await languageReady;
  const hint = target.hint;
  if (hint) hint.textContent = t("input.reading");
  try {
    const result = await api("/v1/inputs", {
      method: "POST",
      body: JSON.stringify({ content, source: "text", mode: "progressive" }),
    });
    if (target.receipt) {
      target.receipt.hidden = false;
      target.receipt.innerHTML = renderReceipt(result.action_card, result.enriching ? "receipt.modelReading" : null);
    }
    if (result.enriching) {
      const enriched = await api(`/v1/inputs/${encodeURIComponent(result.id)}/enrich`, { method: "POST" });
      if (target.receipt) target.receipt.innerHTML = renderReceipt(enriched.action_card, "receipt.modelApplied");
    }
    state.lastReceipt = { card: result.action_card, noteKey: null };
    if (hint) hint.textContent = t("input.filed");
    await load(state.section);
    await load("home");
    render();
  } catch (error) {
    if (hint) hint.textContent = t("input.failed", { message: error.message });
  } finally {
    state.captureBusy = false;
  }
}

/* --- sheet ---------------------------------------------------------------- */

function openSheet() {
  $("sheet").hidden = false;
  $("sheet-receipt").hidden = true;
  $("sheet-receipt").innerHTML = "";
  $("sheet-input").value = "";
  $("sheet-input").focus();
}

function closeSheet() {
  $("sheet").hidden = true;
  render();
}

/* --- events --------------------------------------------------------------- */

$("sidebar").addEventListener("click", (event) => {
  const item = event.target.closest("[data-section]");
  if (item) void navigate(item.dataset.section);
});

$("section-actions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.memoryFilter = button.dataset.filter;
  state.selection = null;
  state.inspector = null;
  render();
});

$("panes").addEventListener("click", (event) => {
  const rowNode = event.target.closest("[data-kind]");
  if (rowNode) {
    if (rowNode.dataset.kind === "section") void navigate(rowNode.dataset.id);
    else void select(rowNode.dataset.kind, rowNode.dataset.id);
    return;
  }
  const chip = event.target.closest("[data-example]");
  if (chip) {
    const input = $("input");
    if (input) {
      input.value = chip.dataset.example;
      input.form?.requestSubmit();
    }
  }
});

$("panes").addEventListener("submit", (event) => {
  if (event.target.id !== "input-form") return;
  event.preventDefault();
  const input = $("input");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  void runCapture(content, { receipt: $("panes").querySelector(".receipt"), hint: $("input-hint") });
});

document.addEventListener("click", async (event) => {
  const clarify = event.target.closest("[data-clarify-option]");
  if (clarify) {
    clarify.disabled = true;
    try {
      await api(`/v1/clarifications/${encodeURIComponent(clarify.dataset.clarifyId)}/resolve`, {
        method: "POST",
        body: JSON.stringify({ option_id: clarify.dataset.clarifyOption }),
      });
      if (state.lastReceipt?.card) {
        const resolvedPrompts = new Set(
          (state.lastReceipt.card.clarifications ?? []).map((c) => c.prompt)
        );
        state.lastReceipt = {
          card: {
            ...state.lastReceipt.card,
            clarifications: [],
            warnings: (state.lastReceipt.card.warnings ?? []).filter(
              (warning) => !resolvedPrompts.has(warning)
            ),
          },
          noteKey: "clarify.recorded",
        };
      }
      await load(state.section);
      await load("home");
      render();
      if (!$("sheet").hidden && state.lastReceipt) {
        $("sheet-receipt").hidden = false;
        $("sheet-receipt").innerHTML = renderReceipt(state.lastReceipt.card, state.lastReceipt.noteKey);
      }
    } catch (error) {
      clarify.disabled = false;
      clarify.textContent = error.message;
    }
    return;
  }

  const button = event.target.closest("[data-act]");
  if (button) {
    const { act, id } = button.dataset;
    button.disabled = true;
    try {
      if (act === "start") await api(`/v1/commitments/${encodeURIComponent(id)}/start`, { method: "POST" });
      else if (act === "complete") await api(`/v1/commitments/${encodeURIComponent(id)}/complete`, { method: "POST" });
      else if (act === "later")
        await api(`/v1/commitments/${encodeURIComponent(id)}/remove-from-today`, { method: "POST" });
      else if (act === "confirm") await api(`/v1/memories/${encodeURIComponent(id)}/confirm`, { method: "POST" });
      else if (act === "reject") await api(`/v1/memories/${encodeURIComponent(id)}/reject`, { method: "POST" });
      else if (act === "convert")
        await api(`/v1/thoughts/${encodeURIComponent(id)}/convert-to-commitment`, { method: "POST" });
      else if (act === "reclassify")
        await api(`/v1/inputs/${encodeURIComponent(button.dataset.input)}/reclassify`, {
          method: "POST",
          body: JSON.stringify({ mode: button.dataset.mode }),
        });
      else if (act === "approve")
        await api(`/v1/actions/${encodeURIComponent(id)}/decide`, {
          method: "POST",
          body: JSON.stringify({ decision: "approve" }),
        });
      else if (act === "reject-action")
        await api(`/v1/actions/${encodeURIComponent(id)}/decide`, {
          method: "POST",
          body: JSON.stringify({ decision: "reject" }),
        });
      await load(state.section);
      await load("home");
      if (state.selection?.id === id) {
        state.selection = null;
        state.inspector = null;
      }
      render();
    } catch (error) {
      button.disabled = false;
      $("status").textContent = t("home.startFailed", { message: error.message });
    }
    return;
  }

  if (event.target.closest("#quick-capture")) openSheet();
  if (event.target.closest("#sheet-close")) closeSheet();
  if (event.target === $("sheet")) closeSheet();
});

$("lang-switch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-lang]");
  if (button) void setLang(button.dataset.lang);
});

$("sheet-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("sheet-input");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  void runCapture(content, { receipt: $("sheet-receipt"), hint: null });
});

$("sheet-input").addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    $("sheet-form").requestSubmit();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSheet();
  }
  if (event.key === "Escape" && !$("sheet").hidden) closeSheet();
});

window.addEventListener("hashchange", () => {
  const section = window.location.hash.replace("#", "");
  if (section && section !== state.section) void navigate(section);
});

/* --- language ------------------------------------------------------------- */

async function syncServerLanguage() {
  try {
    const me = await api("/v1/me");
    const current = String(me.user?.language ?? "en");
    if (current !== serverLanguage(state.lang)) {
      await api("/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ language: serverLanguage(state.lang) }),
      });
    }
  } catch {
    // older server: the UI language still works, stored text keeps its language
  }
}

async function setLang(lang) {
  if (lang === state.lang || !LANGS.includes(lang)) return;
  state.lang = lang;
  t = translator(lang);
  saveLang(lang);
  applyChrome();
  render();
  try {
    await api("/v1/me", {
      method: "PATCH",
      body: JSON.stringify({ language: serverLanguage(lang) }),
    });
  } catch {
    // the UI still switches; stored text keeps its language
  }
}

/* --- start ---------------------------------------------------------------- */

applyChrome();
languageReady = syncServerLanguage();
navigate(window.location.hash.replace("#", "") || "home").catch((error) => {
  state.error = error.message;
  render();
});
