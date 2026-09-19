/* Reference client: capture, then two consequences (Today, Memory) and the
   decisions that wait for a human. */

const $ = (id) => document.getElementById(id);

const state = {
  today: null,
  memories: [],
  actions: [],
  showCandidates: false,
  expanded: new Set(),
  evidence: new Map(),
  captureBusy: false,
};

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
  return new Intl.DateTimeFormat(undefined, {
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
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function dayLabel(dateKey) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

const KIND = {
  preference: "prefers",
  principle: "principle",
  project_context: "project",
  decision: "decision",
  experience: "experience",
};

function freshness(decay) {
  const value = Number(decay ?? 0);
  if (value >= 0.9) return "fresh";
  if (value >= 0.7) return "settling";
  if (value >= 0.4) return "fading";
  return "old";
}

const SOURCE_LABEL = {
  user_explicit: "you said it",
  ai_inferred: "inferred",
  decision_promote: "from a decision",
};

/* --- Today ---------------------------------------------------------------- */

function renderToday() {
  const payload = state.today;
  const node = $("now");
  if (!payload) {
    node.innerHTML = `<p class="empty">Loading…</p>`;
    return;
  }
  const plan = payload.plan ?? { core: [], optional: [], deferred: [] };
  const total = plan.core.length + plan.optional.length + plan.deferred.length;
  const now = payload.now;
  const timeline = (payload.timeline ?? []).slice(0, 5);
  const risks = (payload.risks ?? []).slice(0, 3);

  const bar = total
    ? `<div class="plan" title="How the day is classified">
         <span class="plan-bar" aria-hidden="true">
           <span class="plan-core" style="width:${(plan.core.length / total) * 100}%"></span>
           <span class="plan-optional" style="width:${(plan.optional.length / total) * 100}%"></span>
         </span>
         <span>core ${plan.core.length} · optional ${plan.optional.length} · later ${plan.deferred.length}</span>
       </div>`
    : "";

  const laterItems = timeline.filter((item) => !now || item.id !== now.id);
  const later = laterItems.length
    ? `<span class="list-label">${now ? "Then" : "Scheduled"}</span>
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
    ? `<div class="stack" style="margin-top:1rem"><span class="list-label">At risk</span>${risks
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
           <p class="now-why">do now · ${esc((now.now_reason ?? []).join(" · "))}</p>`
        : `<p class="empty"><strong>Nothing planned for today.</strong> Capture something with “today” in it, and it appears here.</p>`
    }
    ${bar}
    ${later}
    ${riskList}
  `;

  $("today-note").textContent = payload.date_key ? dayLabel(payload.date_key) : "";
  const tally = timeline.length ? String(timeline.length) : "";
  $("today-tally").textContent = tally;
  $("status").textContent = payload.planning
    ? `${dayLabel(payload.date_key)} · ${payload.planning.mode.replace("_", " ")} day`
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
    node.innerHTML = `<p class="empty"><strong>Nothing remembered yet.</strong> A sentence like “I prefer simple tools” becomes a memory you can inspect.</p>`;
    return;
  }

  node.innerHTML = items
    .map((memory) => {
      const open = state.expanded.has(memory.id);
      const evidence = state.evidence.get(memory.id);
      return `
      <button class="memory-item" data-memory="${esc(memory.id)}"
              data-input="${esc(memory.source_input_id ?? "")}"
              aria-expanded="${open}">
        <span class="memory-body">${esc(memory.content)}</span>
        <span class="memory-meta">
          <span class="kind">${esc(KIND[memory.type] ?? memory.type)}</span>
          <span class="pill">L${esc(memory.level)}</span>
          <span>${esc(freshness(memory.decay))}</span>
          ${
            memory.state !== "active"
              ? `<span class="pill pill-candidate">candidate</span>`
              : ""
          }
          <span class="memory-open">${open ? "hide evidence ↑" : "evidence ↓"}</span>
        </span>
      </button>
      ${
        open
          ? `<div class="memory-evidence">${renderEvidence(evidence)}</div>`
          : ""
      }`;
    })
    .join("") +
    (candidates && !state.showCandidates
      ? `<p class="panel-note" style="margin-top:.6rem">${candidates} candidate memory${candidates === 1 ? "" : "ies"} waiting — turn on “candidates”.</p>`
      : "");
}

function renderEvidence(evidence) {
  if (!evidence || evidence.status === "loading") {
    return `<p class="empty">Reading the source…</p>`;
  }
  if (evidence.status === "error") {
    return `<p class="empty">Could not load the source: ${esc(evidence.message)}</p>`;
  }
  const { raw, memory } = evidence.data;
  return `
    <blockquote>${esc(raw.content)}</blockquote>
    <dl class="fields">
      <dt>source</dt><dd>${esc(raw.source)}</dd>
      <dt>captured</dt><dd>${esc(when(raw.created_at))}</dd>
      <dt>reading</dt><dd>${esc(memory.type ?? "memory")} · ${esc(memory.status ?? "")}</dd>
      <dt>excerpt</dt><dd>${esc(memory.evidence ?? "")}</dd>
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

const ACTION_LABEL = {
  user_data_purge: "Delete all data",
  memory_deleted: "Delete a memory",
  commitment_deleted: "Delete a commitment",
};

function renderActions() {
  const items = state.actions.filter(
    (action) => action.status === "proposed" || action.status === "pending_second"
  );
  const node = $("actions");
  const tally = $("decision-tally");
  tally.hidden = items.length === 0;
  tally.textContent = String(items.length);

  $("decisions-note").textContent = items.length ? "" : "the gate is quiet";

  if (!items.length) {
    node.innerHTML = `<p class="empty"><strong>Nothing needs a decision.</strong> High-risk actions wait here for one approval, critical ones for two. In this demo the only source is deleting everything; every captured sentence is still graded by the same table.</p>`;
    return;
  }

  node.innerHTML = items
    .map((action) => {
      const second = action.status === "pending_second";
      return `
      <div class="action" data-action="${esc(action.id)}">
        <span class="risk risk-${esc(action.risk)}">${esc(action.risk)}</span>
        <span class="action-what">${esc(ACTION_LABEL[action.action_type] ?? action.action_type)}</span>
        <span class="action-why">${esc(action.reason ?? "")}</span>
        ${
          second
            ? `<span class="pill pill-candidate">1 of 2 approvals</span>`
            : ""
        }
        <span class="buttons">
          <button class="primary" data-decide="approve" data-id="${esc(action.id)}">
            ${second ? "Approve again" : "Approve"}
          </button>
          <button class="ghost" data-decide="reject" data-id="${esc(action.id)}">Reject</button>
        </span>
        <span class="action-outcome">${esc(action.error ?? "")}</span>
      </div>`;
    })
    .join("");
}

/* --- Capture receipt ------------------------------------------------------ */

function renderReceipt(card, note) {
  const node = $("receipt");
  node.hidden = false;
  if (!card) {
    node.innerHTML = `<p class="receipt-title">${esc(note ?? "Filed.")}</p>`;
    return;
  }

  const group = (label, rows) =>
    rows.length
      ? `<div class="receipt-group"><span class="receipt-group-label">${esc(label)}</span>${rows.join("")}</div>`
      : "";

  const commitments = (card.commitments ?? []).map(
    (c) => `<div class="receipt-item"><span class="value">${esc(c.title)}</span><span class="tail">${esc(
      when(c.window_end ?? c.deadline) || "no date"
    )}</span></div>`
  );
  const memories = (card.memory_candidates ?? []).map(
    (m) => `<div class="receipt-item"><span class="value">${esc(m.content)}</span><span class="tail">${esc(
      KIND[m.type] ?? m.type
    )}</span></div>`
  );
  const thoughts = (card.thoughts ?? []).map(
    (t) => `<div class="receipt-item"><span class="value">${esc(t.title ?? t.content ?? "")}</span></div>`
  );
  const decisions = (card.decisions ?? []).map(
    (d) => `<div class="receipt-item"><span class="value">${esc(d.title)}</span><span class="tail">decision</span></div>`
  );

  const parts = [];
  if (commitments.length) parts.push(`${commitments.length} commitment${commitments.length === 1 ? "" : "s"}`);
  if (memories.length) parts.push(`${memories.length} memory${memories.length === 1 ? "" : "ies"}`);
  if (thoughts.length) parts.push(`${thoughts.length} thought${thoughts.length === 1 ? "" : "s"}`);
  if (decisions.length) parts.push(`${decisions.length} decision${decisions.length === 1 ? "" : "s"}`);

  const links = [
    commitments.length ? `<a class="receipt-link" href="#today">See it in Today ↓</a>` : "",
    memories.length || card.memory_candidates?.length
      ? `<a class="receipt-link" href="#memory">See it in Memory ↓</a>`
      : "",
  ]
    .filter(Boolean)
    .join("&nbsp;&nbsp;");

  node.innerHTML = `
    <p class="receipt-title">
      ${parts.length ? `Captured ${esc(parts.join(", "))}` : esc(card.summary ?? "Captured")}
      ${note ? `<span class="muted">· ${esc(note)}</span>` : ""}
    </p>
    ${group("Commitments", commitments)}
    ${group("Memories", memories)}
    ${group("Thoughts", thoughts)}
    ${group("Decisions", decisions)}
    ${(card.warnings ?? []).length ? `<p class="warn">${card.warnings.map(esc).join("<br />")}</p>` : ""}
    ${links ? `<p style="margin:.7rem 0 0">${links}</p>` : ""}`;
}

async function capture(content) {
  if (state.captureBusy) return;
  state.captureBusy = true;
  const button = $("file-button");
  button.disabled = true;
  $("capture-hint").textContent = "reading…";
  try {
    const result = await api("/v1/inputs", {
      method: "POST",
      body: JSON.stringify({ content, source: "text", mode: "progressive" }),
    });
    renderReceipt(result.action_card, result.enriching ? "reading with the model…" : "");
    if (result.enriching) {
      const enriched = await api(`/v1/inputs/${encodeURIComponent(result.id)}/enrich`, {
        method: "POST",
      });
      renderReceipt(enriched.action_card, "model reading applied");
    }
    $("capture-hint").textContent = "filed";
    await refresh();
  } catch (error) {
    $("capture-hint").textContent = `failed: ${error.message}`;
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
  renderToday();
  renderMemories();
  renderActions();
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
      ? `executed (${result.execution.status ?? "ok"})`
      : (result.execution?.error ?? result.proposal?.execution_status ?? "decided");
    row.querySelector(".action-outcome").textContent = outcome;
  } catch (error) {
    row.querySelector(".action-outcome").textContent = error.message;
  }
  await refresh();
});

refresh().catch((error) => {
  $("status").textContent = `offline: ${error.message}`;
  $("now").innerHTML = `<p class="empty">Could not reach the API: ${esc(error.message)}</p>`;
});
