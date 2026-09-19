/* Reference client: capture, then two consequences (Today, Memory) and the
   decisions that wait for a human. Bilingual, defaulting to the browser. */

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

const state = {
  lang: detectLang(),
  today: null,
  memories: [],
  actions: [],
  showCandidates: false,
  expanded: new Set(),
  evidence: new Map(),
  captureBusy: false,
  receipt: null,
};

let t = translator(state.lang);
let languageReady = Promise.resolve();

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
  return new Intl.DateTimeFormat(localeTag(state.lang), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dayLabel(dateKey) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00`);
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

/* --- chrome --------------------------------------------------------------- */

function renderLangSwitch() {
  $("lang-switch").innerHTML = LANGS.map(
    (lang) => `<button type="button" data-lang="${lang}" aria-pressed="${state.lang === lang}"
      >${lang === "zh" ? "中文" : "EN"}</button>`
  ).join("");
}

function renderExamples() {
  $("examples").innerHTML =
    `<span class="chips-label">${esc(t("chips.try"))}</span>` +
    EXAMPLES[state.lang]
      .map((sentence) => `<button type="button" class="chip" data-example="${esc(sentence)}">${esc(sentence)}</button>`)
      .join("");
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
  $("footer-text").innerHTML = t("footer");
  $("capture-hint").textContent = t("capture.hint");
  $("lang-switch").setAttribute("aria-label", t("masthead.lang"));
  renderLangSwitch();
  renderExamples();
}

function renderAll() {
  renderToday();
  renderMemories();
  renderActions();
}

/** Align the server's language with the UI before the first capture. */
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
  renderAll();
  if (state.receipt) renderReceipt(state.receipt.card, state.receipt.noteKey);
  // Server-written text (memory wording, summaries) follows the same choice.
  try {
    await api("/v1/me", {
      method: "PATCH",
      body: JSON.stringify({ language: serverLanguage(lang) }),
    });
  } catch {
    // older server: the UI language still works, stored text keeps its language
  }
}

/* --- Today ---------------------------------------------------------------- */

function renderToday() {
  const payload = state.today;
  const node = $("now");
  if (!payload) {
    node.innerHTML = `<p class="empty">${esc(t("loading"))}</p>`;
    return;
  }
  const plan = payload.plan ?? { core: [], optional: [], deferred: [] };
  const total = plan.core.length + plan.optional.length + plan.deferred.length;
  const now = payload.now;
  const timeline = (payload.timeline ?? []).slice(0, 5);
  const risks = (payload.risks ?? []).slice(0, 3);

  const bar = total
    ? `<div class="plan">
         <span class="plan-bar" aria-hidden="true">
           <span class="plan-core" style="width:${(plan.core.length / total) * 100}%"></span>
           <span class="plan-optional" style="width:${(plan.optional.length / total) * 100}%"></span>
         </span>
         <span>${esc(t("plan.core"))} ${plan.core.length} · ${esc(t("plan.optional"))} ${plan.optional.length} · ${esc(t("plan.later"))} ${plan.deferred.length}</span>
       </div>`
    : "";

  const laterItems = timeline.filter((item) => !now || item.id !== now.id);
  const later = laterItems.length
    ? `<span class="list-label">${esc(t(now ? "today.then" : "today.scheduled"))}</span>
       <div class="stack">${laterItems
         .map(
           (item) => `
         <div class="line">
           <span class="value">${esc(item.title)}</span>
           <span class="when">${esc(clock(item.ai_slot_start) || item.kind_label || "")}</span>
         </div>`
         )
         .join("")}</div>`
    : "";

  const riskList = risks.length
    ? `<div class="stack" style="margin-top:1rem"><span class="list-label">${esc(t("today.atRisk"))}</span>${risks
        .map(
          (item) => `
        <div class="line risk-line">
          <span class="value">${esc(item.title)}</span>
          <span class="when">${esc(when(item.deadline))}</span>
        </div>`
        )
        .join("")}</div>`
    : "";

  node.innerHTML = `
    ${
      now
        ? `<p class="now-focus">${esc(now.title)}</p>
           <p class="now-why">${esc(t("today.doNow"))} · ${esc((now.now_reason ?? []).join(" · "))}</p>`
        : `<p class="empty">${t("today.empty")}</p>`
    }
    ${bar}
    ${later}
    ${riskList}
  `;

  $("today-note").textContent = payload.date_key ? dayLabel(payload.date_key) : "";
  $("today-tally").textContent = timeline.length ? String(timeline.length) : "";
  $("status").textContent = payload.planning
    ? `${dayLabel(payload.date_key)} · ${t(`today.mode.${payload.planning.mode}`)}`
    : dayLabel(payload.date_key);
}

/* --- Memory, with evidence in place --------------------------------------- */

function memoryItems() {
  return state.memories.filter(
    (memory) => state.showCandidates || memory.state === "active"
  );
}

function renderMemories() {
  const items = memoryItems();
  const node = $("memory-list");
  const active = state.memories.filter((m) => m.state === "active").length;
  const candidates = state.memories.length - active;
  $("memory-tally").textContent = active ? String(active) : "";

  if (!items.length) {
    node.innerHTML = `<p class="empty">${t("memory.empty")}</p>`;
    return;
  }

  node.innerHTML =
    items
      .map((memory) => {
        const open = state.expanded.has(memory.id);
        const evidence = state.evidence.get(memory.id);
        const kind = t(`kind.${memory.type}`);
        return `
      <button class="memory-item" data-memory="${esc(memory.id)}"
              data-input="${esc(memory.source_input_id ?? "")}"
              aria-expanded="${open}">
        <span class="memory-body">${esc(memory.content)}</span>
        <span class="memory-meta">
          <span class="kind">${esc(kind === `kind.${memory.type}` ? memory.type : kind)}</span>
          <span class="pill">L${esc(memory.level)}</span>
          <span>${esc(t(`fresh.${freshness(memory.decay)}`))}</span>
          ${
            memory.state !== "active"
              ? `<span class="pill pill-candidate">${esc(t("memory.candidate"))}</span>`
              : ""
          }
          <span class="memory-open">${esc(t(open ? "memory.hideEvidence" : "memory.evidence"))}</span>
        </span>
      </button>
      ${open ? `<div class="memory-evidence">${renderEvidence(evidence)}</div>` : ""}`;
      })
      .join("") +
    (candidates && !state.showCandidates
      ? `<p class="panel-note" style="margin-top:.6rem">${esc(
          plural(candidates, "memory.waiting")
        )}</p>`
      : "");
}

function renderEvidence(evidence) {
  if (!evidence || evidence.status === "loading") {
    return `<p class="empty">${esc(t("evidence.loading"))}</p>`;
  }
  if (evidence.status === "error") {
    return `<p class="empty">${esc(t("evidence.error", { message: evidence.message }))}</p>`;
  }
  const { raw, memory } = evidence.data;
  return `
    <blockquote>${esc(raw.content)}</blockquote>
    <dl class="fields">
      <dt>${esc(t("evidence.source"))}</dt><dd>${esc(raw.source)}</dd>
      <dt>${esc(t("evidence.captured"))}</dt><dd>${esc(when(raw.created_at))}</dd>
      <dt>${esc(t("evidence.reading"))}</dt><dd>${esc(memory.type ?? "memory")} · ${esc(memory.status ?? "")}</dd>
      <dt>${esc(t("evidence.excerpt"))}</dt><dd>${esc(memory.evidence ?? "")}</dd>
    </dl>`;
}

async function toggleMemory(id, inputId) {
  if (state.expanded.has(id)) {
    state.expanded.delete(id);
    renderMemories();
    return;
  }
  state.expanded.add(id);
  if (inputId && !state.evidence.has(id)) {
    state.evidence.set(id, { status: "loading" });
    renderMemories();
    try {
      const data = await api(`/v1/inputs/${encodeURIComponent(inputId)}`);
      const memory = (data.memories ?? []).find((row) => row.id === id) ?? {};
      state.evidence.set(id, { status: "ready", data: { raw: data.raw_input ?? {}, memory } });
    } catch (error) {
      state.evidence.set(id, { status: "error", message: error.message });
    }
  }
  renderMemories();
}

/* --- Decisions ------------------------------------------------------------ */

function actionLabel(type) {
  const key = `action.${type}`;
  const label = t(key);
  return label === key ? type.replace(/_/g, " ") : label;
}

function renderActions() {
  const items = state.actions.filter(
    (action) => action.status === "proposed" || action.status === "pending_second"
  );
  const node = $("actions");
  const tally = $("decision-tally");
  tally.hidden = items.length === 0;
  tally.textContent = String(items.length);

  $("decisions-note").textContent = items.length ? "" : t("decisions.quiet");

  if (!items.length) {
    node.innerHTML = `<p class="empty">${t("decisions.empty")}</p>`;
    return;
  }

  node.innerHTML = items
    .map((action) => {
      const second = action.status === "pending_second";
      return `
      <div class="action" data-action="${esc(action.id)}">
        <span class="risk risk-${esc(action.risk)}">${esc(t(`risk.${action.risk}`))}</span>
        <span class="action-what">${esc(actionLabel(action.action_type))}</span>
        <span class="action-why">${esc(action.reason ?? "")}</span>
        ${second ? `<span class="pill pill-candidate">${esc(t("decisions.second"))}</span>` : ""}
        <span class="buttons">
          <button class="primary" data-decide="approve" data-id="${esc(action.id)}">
            ${esc(t(second ? "decisions.approveAgain" : "decisions.approve"))}
          </button>
          <button class="ghost" data-decide="reject" data-id="${esc(action.id)}">${esc(t("decisions.reject"))}</button>
        </span>
        <span class="action-outcome">${esc(action.error ?? "")}</span>
      </div>`;
    })
    .join("");
}

/* --- Capture receipt ------------------------------------------------------ */

function renderReceipt(card, noteKey) {
  const node = $("receipt");
  state.receipt = { card, noteKey: noteKey ?? null };
  node.hidden = false;
  const note = noteKey ? t(noteKey) : "";
  if (!card) {
    node.innerHTML = `<p class="receipt-title">${esc(note)}</p>`;
    return;
  }

  const group = (label, rows) =>
    rows.length
      ? `<div class="receipt-group"><span class="receipt-group-label">${esc(label)}</span>${rows.join("")}</div>`
      : "";

  const commitments = (card.commitments ?? []).map(
    (c) => `<div class="receipt-item"><span class="value">${esc(c.title)}</span><span class="tail">${esc(
      when(c.window_end ?? c.deadline) || t("receipt.noDate")
    )}</span></div>`
  );
  const memories = (card.memory_candidates ?? []).map(
    (m) => `<div class="receipt-item"><span class="value">${esc(m.content)}</span><span class="tail">${esc(
      t(`kind.${m.type}`)
    )}</span></div>`
  );
  const thoughts = (card.thoughts ?? []).map(
    (th) => `<div class="receipt-item"><span class="value">${esc(th.title ?? th.content ?? "")}</span></div>`
  );
  const decisions = (card.decisions ?? []).map(
    (d) => `<div class="receipt-item"><span class="value">${esc(d.title)}</span><span class="tail">${esc(t("kind.decision"))}</span></div>`
  );

  const parts = [];
  if (commitments.length) parts.push(plural(commitments.length, "receipt.commitment"));
  if (memories.length) parts.push(plural(memories.length, "receipt.memory"));
  if (thoughts.length) parts.push(plural(thoughts.length, "receipt.thought"));
  if (decisions.length) parts.push(plural(decisions.length, "receipt.decision"));

  const links = [
    commitments.length
      ? `<a class="receipt-link" href="#today">${esc(t("receipt.seeToday"))}</a>`
      : "",
    memories.length
      ? `<a class="receipt-link" href="#memory">${esc(t("receipt.seeMemory"))}</a>`
      : "",
  ]
    .filter(Boolean)
    .join("&nbsp;&nbsp;");

  node.innerHTML = `
    <p class="receipt-title">
      ${esc(t("receipt.captured"))}${parts.length ? ` ${esc(parts.join(state.lang === "zh" ? "、" : ", "))}` : ""}
      ${note ? `<span class="muted">· ${esc(note)}</span>` : ""}
    </p>
    ${group(t("receipt.commitments"), commitments)}
    ${group(t("receipt.memories"), memories)}
    ${group(t("receipt.thoughts"), thoughts)}
    ${group(t("receipt.decisions"), decisions)}
    ${(card.warnings ?? []).length ? `<p class="warn">${card.warnings.map(esc).join("<br />")}</p>` : ""}
    ${links ? `<p style="margin:.7rem 0 0">${links}</p>` : ""}`;
}

async function capture(content) {
  if (state.captureBusy) return;
  state.captureBusy = true;
  // The first capture must not race the language alignment.
  await languageReady;
  const button = $("file-button");
  button.disabled = true;
  $("capture-hint").textContent = t("capture.reading");
  try {
    const result = await api("/v1/inputs", {
      method: "POST",
      body: JSON.stringify({ content, source: "text", mode: "progressive" }),
    });
    renderReceipt(result.action_card, result.enriching ? "receipt.modelReading" : null);
    if (result.enriching) {
      const enriched = await api(`/v1/inputs/${encodeURIComponent(result.id)}/enrich`, {
        method: "POST",
      });
      renderReceipt(enriched.action_card, "receipt.modelApplied");
    }
    $("capture-hint").textContent = t("capture.filed");
    await refresh();
  } catch (error) {
    $("capture-hint").textContent = t("capture.failed", { message: error.message });
  } finally {
    state.captureBusy = false;
    button.disabled = false;
  }
}

/* --- Wiring --------------------------------------------------------------- */

async function refresh() {
  const [today, memories, actions] = await Promise.all([
    api("/v1/today"),
    api("/v1/memories"),
    api("/v1/actions?status=all"),
  ]);
  state.today = today;
  state.memories = memories.items ?? [];
  state.actions = actions.items ?? [];
  renderAll();
}

$("capture-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("input");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  void capture(content);
});

$("examples").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-example]");
  if (!chip) return;
  $("input").value = chip.dataset.example;
  $("capture-form").requestSubmit();
});

$("lang-switch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-lang]");
  if (button) void setLang(button.dataset.lang);
});

$("input").addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    $("capture-form").requestSubmit();
  }
});

$("memory-list").addEventListener("click", (event) => {
  const button = event.target.closest(".memory-item");
  if (button) void toggleMemory(button.dataset.memory, button.dataset.input);
});

$("show-candidates").addEventListener("change", (event) => {
  state.showCandidates = event.target.checked;
  renderMemories();
});

$("actions").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-decide]");
  if (!button) return;
  button.disabled = true;
  const row = button.closest(".action");
  try {
    const result = await api(`/v1/actions/${encodeURIComponent(button.dataset.id)}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision: button.dataset.decide }),
    });
    const outcome = result.execution?.ok
      ? t("decisions.executed", { status: result.execution.status ?? "ok" })
      : (result.execution?.error ?? result.proposal?.execution_status ?? t("decisions.decided"));
    row.querySelector(".action-outcome").textContent = outcome;
  } catch (error) {
    row.querySelector(".action-outcome").textContent = error.message;
  }
  await refresh();
});

applyChrome();
languageReady = syncServerLanguage();
refresh().catch((error) => {
  $("status").textContent = t("status.offline", { message: error.message });
  $("now").innerHTML = `<p class="empty">${esc(t("api.unreachable", { message: error.message }))}</p>`;
});
