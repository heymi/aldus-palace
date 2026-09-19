/* Reference client: five reads of the same context — capture, Now, memory,
   evidence, and the decisions that wait for a human. */

const $ = (id) => document.getElementById(id);

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
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function line(tag, value, tail) {
  return `<div class="line"><span class="tag">${esc(tag)}</span><span class="value">${esc(
    value
  )}</span>${tail ? `<span class="when">${esc(tail)}</span>` : ""}</div>`;
}

/* --- Now ----------------------------------------------------------------- */

function renderNow(payload) {
  const now = payload.now;
  const plan = payload.plan ?? { core: [], optional: [], deferred: [] };
  const metrics = `
    <dl class="metrics">
      <div><dt>core</dt><dd>${plan.core.length}</dd></div>
      <div><dt>optional</dt><dd>${plan.optional.length}</dd></div>
      <div><dt>deferred</dt><dd>${plan.deferred.length}</dd></div>
      <div><dt>unscheduled</dt><dd>${payload.unscheduled_total ?? 0}</dd></div>
      <div><dt>done</dt><dd>${payload.planning?.completed_today ?? 0}</dd></div>
    </dl>`;

  const timeline = (payload.timeline ?? [])
    .slice(0, 5)
    .map((item) => line(item.kind_label ?? "planned", item.title, when(item.ai_slot_start)))
    .join("");

  const risks = (payload.risks ?? [])
    .map((item) => line("at risk", item.title, when(item.deadline)))
    .join("");

  $("now").innerHTML = `
    ${
      now
        ? `<p class="now-focus">${esc(now.title)}</p>
           <p class="now-reason">${esc((now.now_reason ?? []).join(" · "))}</p>`
        : `<p class="empty">Nothing is scheduled for today yet.</p>`
    }
    ${metrics}
    ${timeline ? `<div class="stack">${timeline}</div>` : ""}
    ${risks ? `<div class="warn">${risks}</div>` : ""}
  `;
  $("status").textContent = `${payload.date_key} · plan ${payload.planning?.mode ?? "—"}`;
}

/* --- Memory + evidence --------------------------------------------------- */

const SOURCE_LABEL = {
  user_explicit: "you said it",
  ai_inferred: "inferred",
  decision_promote: "from a decision",
};

function renderMemories(items) {
  if (!items.length) {
    $("memory").innerHTML = `<p class="empty">Nothing remembered yet. Capture a preference.</p>`;
    return;
  }
  $("memory").innerHTML = items
    .map(
      (m) => `
      <button class="memory-item" data-memory="${esc(m.id)}" data-input="${esc(
        m.source_input_id ?? ""
      )}" aria-pressed="false">
        <span class="memory-head">
          <span class="type">${esc(m.type)}</span>
          <span>L${esc(m.level)}</span>
          <span>decay ${Number(m.decay ?? 0).toFixed(2)}</span>
          <span>${esc(m.state)}</span>
        </span>
        <span class="memory-body">${esc(m.content)}</span>
        <span class="memory-note">${esc(SOURCE_LABEL[m.source] ?? m.source)} · ${esc(
          when(m.updated_at)
        )}</span>
      </button>`
    )
    .join("");
}

async function showEvidence(button) {
  const id = button.dataset.input;
  const memoryId = button.dataset.memory;
  document
    .querySelectorAll(".memory-item")
    .forEach((node) => node.setAttribute("aria-pressed", String(node === button)));

  if (!id) {
    $("evidence").innerHTML = `<p class="empty">This memory has no source sentence.</p>`;
    return;
  }
  $("evidence").innerHTML = `<p class="empty">Reading the source…</p>`;
  try {
    const data = await api(`/v1/inputs/${encodeURIComponent(id)}`);
    const raw = data.raw_input ?? {};
    const memory = (data.memories ?? []).find((row) => row.id === memoryId) ?? {};
    $("evidence").innerHTML = `
      <blockquote>${esc(raw.content)}</blockquote>
      <dl class="fields">
        <dt>source</dt><dd>${esc(raw.source)}</dd>
        <dt>captured</dt><dd>${esc(when(raw.created_at))}</dd>
        <dt>status</dt><dd>${esc(raw.processing_status)}</dd>
        <dt>reading</dt><dd>${esc(memory.type ?? "memory")} · ${esc(memory.status ?? "")}</dd>
        <dt>excerpt</dt><dd>${esc(memory.evidence ?? "")}</dd>
      </dl>`;
  } catch (error) {
    $("evidence").innerHTML = `<p class="empty">Could not load the source: ${esc(
      error.message
    )}</p>`;
  }
}

/* --- Action approval ----------------------------------------------------- */

function renderActions(items) {
  if (!items.length) {
    $("actions").innerHTML = `<p class="empty">Nothing needs a decision.</p>`;
    return;
  }
  $("actions").innerHTML = items
    .map((action) => {
      const outcome = action.result ?? action.error ?? action.execution_status;
      return `
      <div class="action" data-action="${esc(action.id)}">
        <span class="risk risk-${esc(action.risk)}">${esc(action.risk)}</span>
        <span class="action-type">${esc(action.action_type)}</span>
        <span class="action-reason">${esc(action.reason ?? "")}</span>
        <span class="buttons">
          <button class="primary" data-decide="approve" data-id="${esc(action.id)}">Approve</button>
          <button class="ghost" data-decide="reject" data-id="${esc(action.id)}">Reject</button>
        </span>
        <span class="action-outcome">${esc(outcome ?? "")}</span>
      </div>`;
    })
    .join("");
}

/* --- Capture ------------------------------------------------------------- */

function renderReceipt(card, id, note) {
  const node = $("receipt");
  node.hidden = false;
  if (!card) {
    node.innerHTML = `<p class="summary">${esc(note ?? "Filed.")}</p>`;
    return;
  }
  const commitments = (card.commitments ?? [])
    .map((c) => line("commitment", c.title, when(c.window_end ?? c.deadline)))
    .join("");
  const candidates = (card.memory_candidates ?? [])
    .map((m) => line("memory", m.content, m.type ?? ""))
    .join("");
  const thoughts = (card.thoughts ?? [])
    .map((t) => line("thought", t.content ?? t.summary ?? "", ""))
    .join("");
  const warnings = (card.warnings ?? []).map((w) => esc(w)).join("<br />");
  const project =
    card.project_match?.project_name ?? card.project_suggestion?.suggested_name;

  node.innerHTML = `
    <p class="summary">${esc(card.summary ?? "Captured.")}</p>
    ${project ? line("project", project, "") : ""}
    ${commitments}
    ${candidates}
    ${thoughts}
    ${warnings ? `<p class="warn">${warnings}</p>` : ""}
    ${note ? `<p class="warn">${esc(note)}</p>` : ""}
    <input type="hidden" id="receipt-id" value="${esc(id ?? "")}" />`;
}

async function capture(content) {
  const hint = $("capture-hint");
  hint.textContent = "reading…";
  try {
    const result = await api("/v1/inputs", {
      method: "POST",
      body: JSON.stringify({ content, source: "text", mode: "progressive" }),
    });
    renderReceipt(result.action_card, result.id, result.enriching ? "reading with the model…" : "");

    if (result.enriching) {
      const enriched = await api(`/v1/inputs/${encodeURIComponent(result.id)}/enrich`, {
        method: "POST",
      });
      renderReceipt(enriched.action_card, result.id, "model reading applied");
    }
    hint.textContent = "filed";
    await refresh();
  } catch (error) {
    hint.textContent = `failed: ${error.message}`;
  }
}

/* --- Wire up ------------------------------------------------------------- */

async function refresh() {
  const [today, memories, actions] = await Promise.all([
    api("/v1/today"),
    api("/v1/memories?state=active"),
    api("/v1/actions?status=proposed"),
  ]);
  renderNow(today);
  renderMemories(memories.items ?? []);
  renderActions(actions.items ?? []);
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

$("memory").addEventListener("click", (event) => {
  const button = event.target.closest(".memory-item");
  if (button) void showEvidence(button);
});

$("actions").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-decide]");
  if (!button) return;
  button.disabled = true;
  try {
    const result = await api(
      `/v1/actions/${encodeURIComponent(button.dataset.id)}/decide`,
      { method: "POST", body: JSON.stringify({ decision: button.dataset.decide }) }
    );
    const outcome = result.execution?.ok
      ? `executed (${result.execution.status ?? "ok"})`
      : result.execution?.error ?? result.proposal?.execution_status ?? "decided";
    button.closest(".action").querySelector(".action-outcome").textContent = outcome;
  } catch (error) {
    button.closest(".action").querySelector(".action-outcome").textContent = error.message;
  }
  await refresh();
});

refresh().catch((error) => {
  $("status").textContent = `offline: ${error.message}`;
});
