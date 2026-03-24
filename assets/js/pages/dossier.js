// /dossier.js  (NON-module, gebruikt window.ENVAL uit /config.js)

console.log("ENVAL DOSSIER.JS versie 260312_export_session_align");

// ======================================================
// Phase-2 Step 1: UI caps + client-side foto optimalisatie
// ======================================================
const UI_MAX_CHARGERS = Number(window.ENVAL?.UI_MAX_CHARGERS || 4);


// Foto compressie (client-side)
// Doel: lagere upload bytes + lagere server stress, zonder audit-contract te breken.
const PHOTO_MAX_DIM_PX = 1600;       // max breedte/hoogte
const PHOTO_JPEG_QUALITY = 0.78;     // pragmatisch: kwaliteit vs size


// ======================================================
// 1) DOM helpers + formatting
// ======================================================

/**
 * $(id)
 * Shortcut voor document.getElementById
 */
function $(id) { return document.getElementById(id); }

function trunc(s, max) {
  const str = String(s ?? "");
  if (!max || str.length <= max) return str;
  if (max <= 3) return str.slice(0, max);
  return str.slice(0, max - 3) + "...";
}


/**
 * showToast(message, type)
 * Doel: feedback voor user (success/error)
 */
function showToast(message, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.className = `toast toast--${type}`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4200);
}

/**
 * normalizePersonName(input)
 * Doel: consistente name formatting voor UI.
 */
function normalizePersonName(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  return s
    .toLowerCase()
    .split(/\s+/g)
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part
            .split("'")
            .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ""))
            .join("'")
        )
        .join("-")
    )
    .join(" ");
}

function isValidMobile(phone) {
  if (!phone) return true; // optioneel veld
  const p = String(phone).trim().replace(/[\s\-().]/g, "");
  return /^06\d{8}$/.test(p) || /^\+316\d{8}$/.test(p);
}

/**
 * lockSubmit(btn, locked, textWhenLocked)
 * Doel: anti double submit + loading state.
 */
function lockSubmit(btn, locked, textWhenLocked = "Verwerken…") {
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = (btn.textContent || "").trim();

  if (locked) {
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.textContent = textWhenLocked;
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

/**
 * formatDateNL(isoLike)
 * Doel: nette NL datum/tijd in UI (audit/overzicht).
 */
function formatDateNL(isoLike) {
  const s = String(isoLike || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("nl-NL", {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit"
  });
}

// ======================================================
// 2) Frontend shared API lives in /assets/js/api.js
// ======================================================

// ======================================================
// 3) Charger brand/model mapping (UI)
// ======================================================

const BRAND_MODELS = {
  "Alfen": ["Eve Single Pro-line", "Eve Double Pro-line", "Eve Single S-line"],
  "Zaptec": ["Go", "Pro"],
  "Easee": ["Home", "Charge"],
  "Wallbox": ["Pulsar Plus", "Commander 2", "Copper SB"],
  "Tesla": ["Wall Connector Gen 3", "Wall Connector Gen 2"],
};

/**
 * toggleChargerNotes()
 * Doel: toelichting tonen/verplichten wanneer merk/model = Anders.
 */
function toggleChargerNotes() {
  const notesRow = $("chargerNotesRow");
  const notesInput = document.querySelector('#chargerForm [name="notes"]');
  if (!notesRow || !notesInput) return;

  const brand = ($("chargerBrand")?.value || "").trim();
  const model = ($("chargerModel")?.value || "").trim();
  const needsNotes = (brand === "Anders") || (model === "Anders");

  notesRow.classList.toggle("hidden", !needsNotes);
  notesInput.required = !!needsNotes;

  if (!needsNotes) notesInput.value = "";
}

/**
 * populateBrandModel()
 * Doel: initialiseer merk/model dropdowns, incl. Anders-flow.
 */
function populateBrandModel() {
  const brandSel = $("chargerBrand");
  const modelSel = $("chargerModel");
  if (!brandSel || !modelSel) return;

  setSelectOptions(
    brandSel,
    [
      ...Object.keys(BRAND_MODELS).map((brand) => ({ value: brand, label: brand })),
      { value: "Anders", label: "Anders…" },
    ],
    "Kies…"
  );

  setSelectOptions(modelSel, [], "Kies eerst merk…");
  modelSel.disabled = true;

  brandSel.addEventListener("change", () => {
    const brand = brandSel.value;

    if (!brand) {
      setSelectOptions(modelSel, [], "Kies eerst merk…");
      modelSel.disabled = true;
      toggleChargerNotes();
      return;
    }

    if (brand === "Anders") {
      clearNode(modelSel);

      const opt = document.createElement("option");
      opt.value = "Onbekend";
      opt.textContent = "Vul merk/model in bij Toelichting";
      modelSel.appendChild(opt);

      modelSel.value = "Onbekend";
      modelSel.disabled = true;
      toggleChargerNotes();
      return;
    }

    const models = BRAND_MODELS[brand] || [];
    setSelectOptions(
      modelSel,
      [
        ...models.map((model) => ({ value: model, label: model })),
        { value: "Anders", label: "Anders…" },
      ],
      "Kies…"
    );
    modelSel.disabled = false;
    toggleChargerNotes();
  });

  modelSel.addEventListener("change", toggleChargerNotes);
  toggleChargerNotes();
}

// ======================================================
// 4) Global state (dossier context)
// ======================================================

const dossier_id = window.ENVAL.api.getDossierIdFromUrl();
const token = window.ENVAL.api.getLinkTokenFromUrl();

function sessionStorageKey() {
  return `enval_session_token:${dossier_id}`;
}

function getSessionToken() {
  try {
    return localStorage.getItem(sessionStorageKey());
  } catch (_) {
    return null;
  }
}

function setSessionToken(v) {
  try {
    if (!v) return;
    localStorage.setItem(sessionStorageKey(), String(v));
  } catch (_) {}
}

function clearSessionToken() {
  try {
    localStorage.removeItem(sessionStorageKey());
  } catch (_) {}
}

function cleanupLegacySessionKey() {
  // Tijdelijk bewust NO-OP.
  // api.js storage helpers zijn nu verdacht en mogen deze flow niet meer beïnvloeden.
}

let current = null;
let latestPrecheckAnalysis = null;

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFilename() {
  const safeId = String(dossier_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  return `enval-dossier-export-${safeId}.json`;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}


function clearNode(node) {
  if (node) node.replaceChildren();
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function appendTextLine(parent, label, value, valueClassName = "") {
  const line = document.createElement("div");

  const labelNode = document.createTextNode(`${label}: `);
  line.appendChild(labelNode);

  const valueNode = document.createElement("b");
  if (valueClassName) valueNode.className = valueClassName;
  valueNode.textContent = value;
  line.appendChild(valueNode);

  parent.appendChild(line);
}

function appendMutedLine(parent, text, className = "muted small") {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  parent.appendChild(div);
}

function createReviewItemNode(itemToneClass, icon, text, sub) {
  const item = document.createElement("div");
  item.className = `review-item ${itemToneClass}`;

  const iconNode = document.createElement("div");
  iconNode.className = "review-item__icon";
  iconNode.textContent = icon;

  const textWrap = document.createElement("div");
  textWrap.className = "review-item__text";
  textWrap.textContent = text || "";

  if (sub) {
    const subNode = document.createElement("span");
    subNode.className = "review-item__sub";
    subNode.textContent = sub;
    textWrap.appendChild(subNode);
  }

  item.appendChild(iconNode);
  item.appendChild(textWrap);

  return item;
}

function setSelectOptions(selectEl, options, placeholder) {
  if (!selectEl) return;

  clearNode(selectEl);

  if (placeholder != null) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    selectEl.appendChild(opt);
  }

  options.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = String(entry.value ?? "");
    opt.textContent = String(entry.label ?? "");
    selectEl.appendChild(opt);
  });
}

function clearAnalysisUi() {
  renderPillInto($("analysisOverallBadge"), "-");
  setText("analysisLegend", "");
  setText("analysisSummaryMeta", "");

  const chargersList = $("analysisChargersList");
  const documentsList = $("analysisDocumentsList");

  if (chargersList) chargersList.replaceChildren();
  if (documentsList) documentsList.replaceChildren();

  $("analysisChargersEmpty")?.classList.add("hidden");
  $("analysisDocumentsEmpty")?.classList.add("hidden");
}

function renderReviewStatePanel(opts) {
  const el = $("reviewState");
  if (!el) return;

  clearNode(el);

  const tone = String(opts?.tone || "error").toLowerCase();
  const title = String(opts?.title || "").trim();
  const intro = String(opts?.intro || "").trim();
  const items = Array.isArray(opts?.items) ? opts.items.filter(Boolean) : [];

  const boxToneClass =
    tone === "ok" ? "review-box--ok" :
    tone === "warn" ? "review-box--warn" :
    "review-box--error";

  const itemToneClass =
    tone === "ok" ? "review-item--ok" :
    tone === "warn" ? "review-item--warn" :
    "review-item--error";

  const icon =
    tone === "ok" ? "✓" :
    tone === "warn" ? "!" :
    "×";

  const panel = createEl("div", "review-panel");
  const box = createEl("div", `review-box ${boxToneClass}`);

  if (title) {
    box.appendChild(createEl("div", "review-title", title));
  }

  if (intro) {
    box.appendChild(createEl("div", "review-intro", intro));
  }

  if (items.length) {
    const itemsWrap = createEl("div", "review-items");

    items.forEach((item) => {
      if (typeof item === "string") {
        itemsWrap.appendChild(createReviewItemNode(itemToneClass, icon, item, ""));
        return;
      }

      const text = String(item?.text || "").trim();
      const sub = String(item?.sub || "").trim();

      itemsWrap.appendChild(createReviewItemNode(itemToneClass, icon, text, sub));
    });

    box.appendChild(itemsWrap);
  }

  panel.appendChild(box);
  el.appendChild(panel);
}

function renderMissingStepsPanel(missing, fallbackMessage) {
  const items = Array.isArray(missing) ? missing : [];
  renderReviewStatePanel({
    tone: "error",
    title: "Dossier is nog niet volledig",
    intro: items.length
      ? "Vul eerst alle onderstaande onderdelen aan voordat documentcontrole kan starten."
      : (fallbackMessage || "Er ontbreken nog onderdelen."),
    items,
  });
}

function renderBlockingAnalysisPanel(args) {
  const el = $("reviewState");
  if (!el) return;

  clearNode(el);

  const missingRaw = Array.isArray(args?.missing) ? args.missing : [];
  const blockingRaw = Array.isArray(args?.blocking) ? args.blocking : [];
  const warningsRaw = Array.isArray(args?.warnings) ? args.warnings : [];
  const fallbackMessage = String(args?.fallbackMessage || "").trim();

  const missing = missingRaw.map(humanizeMissingStep).filter(Boolean);
  const blocking = blockingRaw.map(humanizeBlockingReason).filter(Boolean);
  const warnings = warningsRaw.map(humanizeWarning).filter(Boolean);

  const panel = createEl("div", "review-panel");
  const box = createEl("div", "review-box review-box--error");

  box.appendChild(createEl("div", "review-title", "Dossier kan nog niet worden ingediend"));

  box.appendChild(
    createEl(
      "div",
      "review-intro",
      (missing.length || blocking.length || warnings.length)
        ? "De onderstaande punten zijn gevonden tijdens controle van volledigheid en documentinhoud."
        : (fallbackMessage || "De controle blokkeert indiening.")
    )
  );

  const itemsWrap = createEl("div", "review-items");

  missing.forEach((text) => {
    itemsWrap.appendChild(
      createReviewItemNode(
        "review-item--error",
        "×",
        text,
        "Ontbrekend of nog niet volledig ingevuld."
      )
    );
  });

  blocking.forEach((text) => {
    itemsWrap.appendChild(
      createReviewItemNode(
        "review-item--error",
        "×",
        text,
        "Deze controle blokkeert indiening."
      )
    );
  });

  warnings.forEach((text) => {
    itemsWrap.appendChild(
      createReviewItemNode(
        "review-item--warn",
        "!",
        text,
        "Dit is een waarschuwing en blokkeert indiening niet."
      )
    );
  });

  if (itemsWrap.childNodes.length) {
    box.appendChild(itemsWrap);
  }

  panel.appendChild(box);
  el.appendChild(panel);
}

function renderPrecheckSuccessPanel(warnings) {
  const warnItems = Array.isArray(warnings)
    ? warnings.map(humanizeWarning).filter(Boolean)
    : [];

  if (!warnItems.length) {
    renderReviewStatePanel({
      tone: "ok",
      title: "Dossier klaar voor indiening",
      intro: "Volledigheid en documentcontrole zijn geslaagd. U kunt het dossier nu indienen.",
      items: [],
    });
    return;
  }

  const el = $("reviewState");
  if (!el) return;

  clearNode(el);

  const panel = createEl("div", "review-panel");
  const box = createEl("div", "review-box review-box--ok");

  box.appendChild(createEl("div", "review-title", "Dossier klaar voor indiening"));
  box.appendChild(
    createEl(
      "div",
      "review-intro",
      "Het dossier mag worden ingediend. Hieronder staan nog aandachtspunten die niet blokkeren."
    )
  );

  const itemsWrap = createEl("div", "review-items");
  warnItems.forEach((text) => {
    itemsWrap.appendChild(
      createReviewItemNode(
        "review-item--warn",
        "!",
        text,
        "Niet-blokkerende waarschuwing."
      )
    );
  });

  box.appendChild(itemsWrap);
  panel.appendChild(box);
  el.appendChild(panel);
}

function renderLockedReviewPanel(lockedAt, warningsRaw = []) {
  const el = $("reviewState");
  if (!el) return;

  clearNode(el);

  const warnings = Array.isArray(warningsRaw)
    ? warningsRaw.map(humanizeWarning).filter(Boolean)
    : [];

  const panel = createEl("div", "review-panel");
  const box = createEl("div", "review-box review-box--ok");

  box.appendChild(createEl("div", "review-title", "Dossier ingediend"));
  box.appendChild(
    createEl(
      "div",
      "review-intro",
      `In review sinds: ${formatDateNL(lockedAt)}`
    )
  );

  if (warnings.length) {
    const itemsWrap = createEl("div", "review-items");

    warnings.forEach((text) => {
      itemsWrap.appendChild(
        createReviewItemNode(
          "review-item--warn",
          "!",
          text,
          "Niet-blokkerende waarschuwing."
        )
      );
    });

    box.appendChild(itemsWrap);
  }

  panel.appendChild(box);
  el.appendChild(panel);
}

function normalizeApiErrorPayload(err, fallbackMessage = "Controle mislukt.") {
  const payload =
    err?.body ||
    err?.payload ||
    err?.data ||
    err?.details ||
    err?.response?.body ||
    err?.responseJSON ||
    err?.json ||
    null;

  return {
    ok: false,
    error: String(
      payload?.error ||
      payload?.message ||
      err?.message ||
      fallbackMessage
    ).trim(),
    missingSteps: Array.isArray(payload?.missingSteps) ? payload.missingSteps : [],
    blocking_reasons: Array.isArray(payload?.blocking_reasons) ? payload.blocking_reasons : [],
    warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
  };
}

function humanizeMissingStep(step) {
  return String(step || "").trim();
}

function humanizeBlockingReason(reason) {
  const s = String(reason || "").trim();
  if (!s) return "";

  if (s.startsWith("invoice_mid_match:")) {
    return "Het MID-nummer op de factuur komt niet overeen met het MID-nummer van de laadpaal in het dossier.";
  }

  if (s.startsWith("invoice_serial_match:")) {
    return "Het serienummer op de factuur komt niet overeen met het serienummer van de laadpaal in het dossier.";
  }

  if (s.startsWith("invoice_address_match:")) {
    if (s.includes("onvoldoende zeker")) {
      return "Het adres kon niet voldoende zeker uit de factuur worden gelezen.";
    }
    return "Het adres op de factuur komt niet overeen met het dossieradres.";
  }

  if (s.includes("onvoldoende zeker")) {
    return "Een verplicht gegeven kon niet voldoende zeker uit de factuur worden gelezen.";
  }

  if (s.includes("niet uitgevoerd")) {
    return "Een verplichte documentcontrole is niet uitgevoerd.";
  }

  if (s.includes("factuur-analyse is technisch mislukt")) {
    return "De factuurcontrole is technisch mislukt. Probeer het opnieuw of gebruik een beter leesbaar document.";
  }

  if (s.includes("Geen bruikbare factuur-analyse beschikbaar")) {
    return "De factuur kon niet bruikbaar worden geanalyseerd.";
  }

  if (s.includes("Verplichte factuurchecks ontbreken")) {
    return "De verplichte factuurcontroles ontbreken.";
  }

  if (s.includes("Analyse ontbreekt of is nog niet uitgevoerd")) {
    return "De documentcontrole is nog niet uitgevoerd.";
  }

  return s;
}

function humanizeWarning(warning) {
  const s = String(warning || "").trim();
  if (!s) return "";

  if (s.includes("Foto-analyse is nog niet geïmplementeerd")) {
    return "De foto is wel aanwezig, maar foto-inhoud wordt op dit moment nog niet automatisch gecontroleerd.";
  }

  if (s.startsWith("invoice_brand_match:")) {
    return "Merk op de factuur kon niet betrouwbaar worden bevestigd, maar dit blokkeert indiening niet.";
  }

  if (s.startsWith("invoice_model_match:")) {
    return "Model op de factuur kon niet betrouwbaar worden bevestigd, maar dit blokkeert indiening niet.";
  }

  return s;
}

function analysisStatusMeta(status) {
  const s = String(status || "").toLowerCase();

  if (s === "pass") return { cls: "pill ok", text: "pass" };
  if (s === "fail") return { cls: "pill err", text: "fail" };
  if (s === "inconclusive") return { cls: "pill warn", text: "inconclusive" };
  if (s === "not_checked") return { cls: "pill", text: "not_checked" };
  if (s === "partial_pass") return { cls: "pill warn", text: "partial_pass" };
  if (s === "completed") return { cls: "pill", text: "completed" };

  return { cls: "pill", text: String(status || "-") };
}

function renderPillInto(container, status) {
  if (!container) return;
  container.replaceChildren();

  const meta = analysisStatusMeta(status);
  const span = document.createElement("span");
  span.className = meta.cls;
  span.textContent = meta.text;
  container.appendChild(span);
}

function createAnalysisBlock() {
  const block = document.createElement("div");
  block.className = "analysis-block";
  return block;
}

function createAnalysisPre(value) {
  const pre = document.createElement("pre");
  pre.className = "mono analysis-pre";
  pre.textContent = JSON.stringify(value ?? {}, null, 2);
  return pre;
}

function createAnalysisTable(headers, rows) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap mt-10";

  const table = document.createElement("table");
  table.className = "table table-docs";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headers.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    row.forEach((cell) => {
      const td = document.createElement("td");

      if (cell.className) td.className = cell.className;
      if (cell.title) td.title = cell.title;

      if (cell.node) {
        td.appendChild(cell.node);
      } else {
        td.textContent = cell.text || "";
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);

  return wrap;
}

function createIconButton({ className = "", label = "", title = "", action = "", id = "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.title = title;
  button.dataset.act = action;
  button.dataset.id = id;
  button.textContent = "×";
  return button;
}


function createDocSection({ title, docs, locked }) {
  const section = createEl("div", "doc-group-section");

  const sectionTitle = createEl("div", "doc-group-section__title", title);
  section.appendChild(sectionTitle);

  if (!Array.isArray(docs) || !docs.length) {
    section.appendChild(
      createEl("div", "doc-group-section__empty muted small", "Nog niet geüpload.")
    );
    return section;
  }

  docs.forEach((doc) => {
    const row = createEl("div", "doc-entry");

    const fileWrap = createEl("div", "doc-entry__file");

    const fileLink = document.createElement("a");
    fileLink.href = "#";
    fileLink.dataset.act = "open";
    fileLink.dataset.id = doc.id;
    fileLink.className = "doc-card__link";
    fileLink.title = doc.filename || "-";
    fileLink.textContent = doc.filename || "-";

    fileWrap.appendChild(fileLink);

    const actions = createEl("div", "doc-entry__actions");

    const deleteButton = createIconButton({
      className: `iconbtn iconbtn--danger ${locked ? "hidden" : ""}`,
      label: "Verwijder document",
      title: "Verwijder",
      action: "del",
      id: doc.id,
    });
    deleteButton.setAttribute("data-lock-hide", "1");

    actions.appendChild(deleteButton);

    row.appendChild(fileWrap);
    row.appendChild(actions);

    section.appendChild(row);
  });

  return section;
}


function getChargersForUi() {
  return Array.isArray(current?.chargers) ? [...current.chargers] : [];
}

function renderAnalysisUiEmptyState() {
  const locked = isLocked();
  const hasCachedAnalysis = !!latestPrecheckAnalysis;

  const section = $("analysisSection");
  if (section) {
    section.classList.toggle("hidden", !(locked || hasCachedAnalysis));
  }

  const loadBtn = $("btnLoadAnalysis");
  if (loadBtn) {
    loadBtn.classList.add("hidden");
    loadBtn.disabled = true;
  }

  if (hasCachedAnalysis) {
    setText("analysisState", `Analyse geladen. Run: ${latestPrecheckAnalysis.run_id || "-"}`);
    renderAnalysisExportData({ analysis_readable: latestPrecheckAnalysis });
    return;
  }

  if (!locked) {
    setText("analysisState", "");
    clearAnalysisUi();
    return;
  }

  setText("analysisState", "Analyse wordt getoond zodra deze beschikbaar is.");
}



function renderAnalysisExportData(data) {
  const readable = data?.analysis_readable || null;
  const summary = readable?.summary || {};
  const chargerSummary = summary?.charger_analysis || {};
  const docSummary = summary?.document_analysis || {};
  const chargers = Array.isArray(readable?.chargers) ? readable.chargers : [];
  const documents = Array.isArray(readable?.documents) ? readable.documents : [];

  renderPillInto($("analysisOverallBadge"), readable?.overall_status || "not_run");

  setText(
    "analysisLegend",
    "Let op: pass betekent dat een specifiek veld uit een document is gelezen en inhoudelijk matcht met het dossier of de laadpaal. not_checked betekent dat het document wel aanwezig is, maar dat die analyse nog niet is geïmplementeerd.",
  );

  setText(
    "analysisSummaryMeta",
    [
      `Run ID: ${readable?.run_id || "-"}`,
      `Chargers seen: ${summary?.chargers_seen ?? "-"}`,
      `Pass: ${chargerSummary?.pass ?? 0} · Fail: ${chargerSummary?.fail ?? 0} · Inconclusive: ${chargerSummary?.inconclusive ?? 0} · Not checked: ${chargerSummary?.not_checked ?? 0}`,
      `Documents completed: ${docSummary?.completed ?? 0} / ${docSummary?.total ?? 0}`,
    ].join("\n"),
  );

  const chargersList = $("analysisChargersList");
  const documentsList = $("analysisDocumentsList");

  if (chargersList) chargersList.replaceChildren();
  if (documentsList) documentsList.replaceChildren();

  $("analysisChargersEmpty")?.classList.toggle("hidden", chargers.length > 0);
  $("analysisDocumentsEmpty")?.classList.toggle("hidden", documents.length > 0);

  chargers.forEach((ch) => {
    if (!chargersList) return;

    const label = ch?.charger_label || {};
    const results = Array.isArray(ch?.analysis_results) ? ch.analysis_results : [];

    const block = createAnalysisBlock();

    const head = document.createElement("div");
    head.className = "small";

    const strong = document.createElement("b");
    strong.textContent = `${label?.brand || "-"} ${label?.model || "-"}`.trim();

    const snLine = document.createElement("div");
    snLine.appendChild(document.createTextNode("SN: "));
    const snValue = document.createElement("span");
    snValue.className = "mono";
    snValue.textContent = label?.serial_number || "-";
    snLine.appendChild(snValue);

    const midLine = document.createElement("div");
    midLine.appendChild(document.createTextNode("MID: "));
    const midValue = document.createElement("span");
    midValue.className = "mono";
    midValue.textContent = label?.mid_number || "-";
    midLine.appendChild(midValue);

    head.appendChild(strong);
    head.appendChild(document.createElement("br"));
    head.appendChild(snLine);
    head.appendChild(midLine);

    const rows = results.map((r) => {
      const statusNodeWrap = document.createElement("div");
      renderPillInto(statusNodeWrap, r?.status || "-");

      return [
        { text: r?.analysis_code || "-", className: "mono" },
        { node: statusNodeWrap },
        {
          text: trunc(r?.source_document_filename || "-", 42),
          title: r?.source_document_filename || "-",
        },
        {
          text: trunc(r?.reason || "-", 42),
          title: r?.reason || "-",
        },
      ];
    });

    block.appendChild(head);
    block.appendChild(
      createAnalysisTable(
        ["Code", "Status", "Bronbestand", "Reason"],
        rows,
      ),
    );

    chargersList.appendChild(block);
  });

  documents.forEach((d) => {
    if (!documentsList) return;

    const observed = d?.observed_fields || {};
    const limitations = Array.isArray(d?.limitations) ? d.limitations : [];
    const summaryObj = d?.summary || {};

    const block = createAnalysisBlock();

    const top = document.createElement("div");

    const filename = document.createElement("b");
    filename.textContent = d?.filename || "-";
    filename.title = d?.filename || "-";

    const metaRow = document.createElement("div");
    metaRow.className = "small";

    const metaLabel = document.createElement("span");
    metaLabel.className = "muted";
    metaLabel.textContent = `Type: ${d?.doc_type || "-"} · Status: `;

    const statusWrap = document.createElement("span");
    renderPillInto(statusWrap, d?.status || "-");

    metaRow.appendChild(metaLabel);
    metaRow.appendChild(statusWrap);

    top.appendChild(filename);
    top.appendChild(document.createElement("br"));
    top.appendChild(metaRow);

    const observedWrap = document.createElement("div");
    observedWrap.className = "small mt-10";
    const observedTitle = document.createElement("b");
    observedTitle.textContent = "Observed fields";
    observedWrap.appendChild(observedTitle);
    observedWrap.appendChild(document.createElement("br"));
    observedWrap.appendChild(createAnalysisPre(observed));

    const limitationsWrap = document.createElement("div");
    limitationsWrap.className = "small mt-10";
    const limitationsTitle = document.createElement("b");
    limitationsTitle.textContent = "Limitations";
    limitationsWrap.appendChild(limitationsTitle);
    limitationsWrap.appendChild(document.createElement("br"));
    limitationsWrap.appendChild(createAnalysisPre(limitations));

    const summaryWrap = document.createElement("div");
    summaryWrap.className = "small mt-10";
    const summaryTitle = document.createElement("b");
    summaryTitle.textContent = "Summary";
    summaryWrap.appendChild(summaryTitle);
    summaryWrap.appendChild(document.createElement("br"));
    summaryWrap.appendChild(createAnalysisPre(summaryObj));

    block.appendChild(top);
    block.appendChild(observedWrap);
    block.appendChild(limitationsWrap);
    block.appendChild(summaryWrap);

    documentsList.appendChild(block);
  });
}

function authedBody(extra) {
  const session_token = getSessionToken();
  if (!session_token) throw new Error("Sessie verlopen. Open je dossierlink opnieuw.");
  return Object.assign({ dossier_id, session_token }, extra || {});
}

async function apiPost(fnName, body, options) {
  return window.ENVAL.api.apiPost(fnName, body, options || {});
}

async function apiAuthed(fnName, extra, options) {
  return apiPost(fnName, authedBody(extra), options || {});
}


// Precheck UX state (client-side)
let precheckOk = false;
let dirtySincePrecheck = true;

function invalidatePrecheck(reason = "") {
  precheckOk = false;
  dirtySincePrecheck = true;
  latestPrecheckAnalysis = null;

  renderReviewStatePanel({
    tone: "warn",
    title: "Controle opnieuw nodig",
    intro: reason
      ? `Er is een wijziging gedaan in het dossier (${reason}). Controleer volledigheid opnieuw.`
      : "Er is een wijziging gedaan in het dossier. Controleer volledigheid opnieuw.",
    items: [],
  });

  setText(
    "analysisState",
    "Analyse vervallen door wijziging in dossier. Controleer volledigheid opnieuw.",
  );

  clearAnalysisUi();
  renderAnalysisUiEmptyState();
  syncReviewButtons();
}

function isDevUnlockEnabled() {
  const env = String(window.ENVAL?.ENVIRONMENT || "").toLowerCase();
  const host = String(window.location.hostname || "").toLowerCase();

  if (window.ENVAL?.DEV_UNLOCK_ENABLED === true) return true;
  if (env === "dev") return true;

  // extra dev-safety voor lokale/dev hosts
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".netlify.app")
  ) {
    return true;
  }

  return false;
}

function syncReviewButtons() {
  const locked = isLocked();

  // Precheck knop: zichtbaar zolang niet locked
  if ($("btnPrecheck")) {
    $("btnPrecheck").disabled = !!locked;
    $("btnPrecheck").classList.toggle("hidden", !!locked);
  }

  // Finalize knop:
  // - VERBERGEN tot precheckOk=true én dirtySincePrecheck=false
  const canFinalize = !locked && precheckOk === true && dirtySincePrecheck === false;

  if ($("btnFinalize")) {
    $("btnFinalize").disabled = !canFinalize;
    $("btnFinalize").classList.toggle("hidden", !canFinalize);

    // title alleen als hij wél bestaat maar disabled (bijv. locked wordt al hidden)
    $("btnFinalize").title = canFinalize ? "" : "Eerst ‘Controleer volledigheid’ uitvoeren.";
  }
}



// Address verify UX state (debounced verify)
let addressVerifyTimer = null;
let addressVerifiedPreview = null; // { street, city } na verify ok

/**
 * isLocked()
 * Doel: bepalen of dossier vergrendeld is (in review / locked_at).
 */
function isLocked() {
  const d = current?.dossier || {};
  if (d.locked_at) return true;
  const st = String(d.status || "");
  return st === "in_review" || st === "ready_for_booking";
}

/**
 * setAllUiLocked(locked)
 * Doel: disable forms/buttons + hide acties (delete) indien locked.
 */
function setAllUiLocked(locked) {
  const banner = $("lockedBanner");
  if (banner) banner.classList.toggle("hidden", !locked);

  // btnRefresh bewust NIET locken
  [
    "btnAccessSave",
    "btnAddressSave",
    "btnChargerSave",
    "btnConsentsSave",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !!locked;
  });

  ["accessForm", "addressForm", "chargerForm", "consentsForm"].forEach((fid) => {
    const f = $(fid);
    if (!f) return;
    f.querySelectorAll("input, select, textarea").forEach((el) => {
      el.disabled = !!locked;
    });
  });

  document.querySelectorAll("[data-lock-hide='1']").forEach((el) => {
    el.classList.toggle("hidden", !!locked);
  });
}


// ======================================================
// 5) Boot / event wiring
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {
  cleanupLegacySessionKey();
  if ($("year")) $("year").textContent = new Date().getFullYear();

  if (!dossier_id) {
    showToast("Ongeldige dossierlink (d ontbreekt).", "error");
    if ($("statusPill")) {
      $("statusPill").className = "pill err";
      $("statusPill").textContent = "Ongeldige link";
    }
    return;
  }

  // token is alleen nodig als je nog géén session_token hebt
  if (!getSessionToken() && !token) {
    showToast("Sessie ontbreekt. Open de dossierlink uit je e-mail opnieuw.", "error");
    if ($("statusPill")) {
      $("statusPill").className = "pill err";
      $("statusPill").textContent = "Sessie ontbreekt";
    }
    return;
  }

  if ($("dossierId")) $("dossierId").textContent = dossier_id;

  populateBrandModel();

  $("btnRefresh")?.addEventListener("click", reloadAll);
  $("btnPrecheck")?.addEventListener("click", onPrecheckClicked);
  $("btnFinalize")?.addEventListener("click", onFinalizeClicked);
  $("btnExportDossier")?.addEventListener("click", onExportClicked);
  $("btnLoadAnalysis")?.addEventListener("click", onLoadAnalysisClicked);
  if ($("btnLoadAnalysis")) {
    $("btnLoadAnalysis").classList.add("hidden");
    $("btnLoadAnalysis").disabled = true;
  }
  $("btnDevUnlock")?.addEventListener("click", onDevUnlockClicked);


  $("addressForm")?.addEventListener("submit", onAddressSave);
  $("accessForm")?.addEventListener("submit", onAccessSave);
  $("chargerForm")?.addEventListener("submit", onChargerSave);
  // Upload gebeurt nu per documentvak in de laadpaalkaarten van stap 4.
  $("consentsForm")?.addEventListener("submit", onConsentsSave);

  // auto-verify address (debounce)
  const af = $("addressForm");
  if (af) {
    ["postcode", "house_number", "suffix"].forEach((nm) => {
      const el = af.querySelector(`[name="${nm}"]`);
      if (el) el.addEventListener("input", onAddressInputChanged);
    });
  }

  await reloadAll();
});

// ======================================================
// 6) Loaders
// ======================================================

/**
 * reloadAll()
 * Doel: haal dossier + subresources op via api-dossier-get en render alles.
 */
async function reloadAll() {
  try {
    if ($("statusPill")) $("statusPill").textContent = "laden…";

    const session_token = getSessionToken();

    console.log("DOSSIER reloadAll session_token =", session_token);
    console.log("DOSSIER reloadAll sessionStorageKey =", sessionStorageKey());

    // 1) Eerst proberen met bestaande session token
    if (session_token) {
      let sessionResponse = null;

      try {
        sessionResponse = await apiPost("api-dossier-get", { dossier_id, session_token });
      } catch (e) {
        const msg = String(e?.message || e);
        console.warn("Session API call failed, clearing session token:", msg);
        clearSessionToken();
        sessionResponse = null;
      }

      if (sessionResponse) {
        current = sessionResponse;

        // BELANGRIJK:
        // render fouten mogen NOOIT de sessie wissen
        renderAll();
        return;
      }
    }

    // 2) Fallback: eenmalige link-token exchange
    if (!token) throw new Error("Sessie verlopen. Open je dossierlink opnieuw.");

    const r = await apiPost("api-dossier-get", { dossier_id, token });

    if (!r?.session_token) {
      console.error("api-dossier-get response (no session_token):", r);
      throw new Error("Backend gaf geen session_token terug. Fix api-dossier-get (token→sessie exchange).");
    }

    setSessionToken(r.session_token);

    try {
      const u = new URL(location.href);
      u.searchParams.delete("t");
      history.replaceState({}, "", u.toString());
    } catch (_) {}

    current = r;
    renderAll();
  } catch (e) {
    console.error("reloadAll failed:", e);
    showToast(e.message || "Fout bij laden", "error");

    if ($("statusPill")) {
      $("statusPill").className = "pill err";
      $("statusPill").textContent = "Fout";
    }
    if ($("statusExplain")) {
      $("statusExplain").textContent = `Fout: ${e.message}`;
    }
  }
}

// ======================================================
// 7) Render (UI op basis van current)
// ======================================================

function renderAll() {
  renderStatus();
  renderAccess();
  renderAddress();
  renderChargers();
  renderDocs();
  renderConsents();
  renderAnalysisUiEmptyState();

  // dossier-lock (in_review / ready_for_booking) => alles locken
  setAllUiLocked(isLocked());
}


/**
 * pillForStatus(status)
 * Doel: mapping van status naar pill UI.
 */
function pillForStatus(status) {
  if (status === "ready_for_booking") return { cls: "pill ok", text: "Klaar voor inboeken" };
  if (status === "ready_for_review") return { cls: "pill warn", text: "Klaar voor review" };
  if (status === "in_review") return { cls: "pill warn", text: "In review" };
  return { cls: "pill", text: "Onvolledig" };
}

/**
 * explainStatus(status)
 * Doel: uitleg onder stap 6 review.
 */
function explainStatus(status) {
  if (status === "ready_for_booking") return "Alles is compleet. Dit dossier kan door naar inboeken.";
  if (status === "ready_for_review") return "Alles lijkt compleet, maar moet nog gecontroleerd worden (review).";
  if (status === "in_review") {
    return "Dit dossier staat op review. Je hoeft niets te doen. Je kunt dit scherm nu sluiten. Wij houden je op de hoogte van de voortgang via het door jou opgegeven e-mailadres.";
  }
  return "Er ontbreken nog onderdelen. Vul de stappen hierboven in.";
}

/**
 * renderStatus()
 * Doel: status pill + status uitleg.
 */
function renderStatus() {
  const status = current?.dossier?.status || "incomplete";
  const p = pillForStatus(status);
  if ($("statusPill")) {
    $("statusPill").className = p.cls;
    $("statusPill").textContent = p.text;
  }
  if ($("statusExplain")) $("statusExplain").textContent = explainStatus(status);

  const locked = isLocked();
  // Knoppen worden verderop door syncReviewButtons() correct verborgen/getoond.
  // Hier doen we dus geen "always unhide" meer.
  if (locked) {
    if ($("btnPrecheck")) $("btnPrecheck").classList.add("hidden");
    if ($("btnFinalize")) $("btnFinalize").classList.add("hidden");
  }


  // Precheck status afleiden uit server status
  // ready_for_review betekent: laatste evaluate(precheck) was OK
  // Maar als er daarna iets gewijzigd is, zetten we dirtySincePrecheck=true (client-side)
  if (status === "ready_for_review") {
    if (dirtySincePrecheck === false) precheckOk = true;
    // Als dirtySincePrecheck true is, laten we finalize disabled.
  } else {
    // elke andere status => precheck niet geldig
    precheckOk = false;
  }

  syncReviewButtons();

  if (locked) {
    renderLockedReviewPanel(current?.dossier?.locked_at || null, []);
  }

  const exportBox = $("exportBox");
  const btnExport = $("btnExportDossier");
  const devUnlockBox = $("devUnlockBox");
  const btnDevUnlock = $("btnDevUnlock");

  if (exportBox) exportBox.classList.toggle("hidden", !locked);
  if (btnExport) btnExport.disabled = !locked;

 const showDevUnlock = locked && isDevUnlockEnabled();

  console.log("DEV_UNLOCK_DEBUG", {
    locked,
    env: window.ENVAL?.ENVIRONMENT,
    dev_unlock_enabled: window.ENVAL?.DEV_UNLOCK_ENABLED,
    hostname: window.location.hostname,
    showDevUnlock,
  });

  if (devUnlockBox) devUnlockBox.classList.toggle("hidden", !showDevUnlock);
  if (btnDevUnlock) btnDevUnlock.disabled = !showDevUnlock;

  if (!showDevUnlock && $("devUnlockState")) {
    $("devUnlockState").textContent = "";
  }
}

/**
 * renderAccess()
 * Doel:
 * - vul formulier stap 1
 * - toon overzicht (Naam onder email, etc.)
 */
function renderAccess() {
  const d = current?.dossier || {};

  const email = d.customer_email || d.email || d.contact_email || "";

  const first =
    d.first_name ||
    d.customer_first_name ||
    d.contact_first_name ||
    d.firstname ||
    d.voornaam ||
    "";

  const last =
    d.last_name ||
    d.customer_last_name ||
    d.contact_last_name ||
    d.lastname ||
    d.achternaam ||
    "";

  const firstNice = normalizePersonName(first);
  const lastNice = normalizePersonName(last);

  const f = $("accessForm");
  if (f) {
    const inFirst = f.querySelector('[name="first_name"]');
    const inLast = f.querySelector('[name="last_name"]');
    const inPhone = f.querySelector('[name="customer_phone"]');
    const inCount = f.querySelector('[name="charger_count"]');

    if (inFirst) inFirst.value = firstNice || "";
    if (inLast) inLast.value = lastNice || "";
    if (inPhone) inPhone.value = d.customer_phone || "";

    if (inCount) {
      const v = d.charger_count ? String(d.charger_count) : "";
      const n = v ? Number(v) : null;

      if (n && n > UI_MAX_CHARGERS) {
        const exists = Array.from(inCount.options).some((opt) => opt.value === String(n));
        if (!exists) {
          const opt = document.createElement("option");
          opt.value = String(n);
          opt.textContent = `${n} (batch/contact)`;
          inCount.appendChild(opt);
        }

        inCount.value = String(n);
        inCount.disabled = true;

        const btn = $("btnAccessSave");
        if (btn) {
          btn.disabled = true;
          btn.title = "Dossier met >4 laadpalen valt buiten onze scope online. Neem contact op met ons voor maatwerk.";
        }

        setText(
          "accessState",
          "Dit dossier bevat meer dan 4 laadpalen. Aanmelding is beperkt tot 4 laadpalen. Neem contact op voor maatwerk."
        );
      } else {
        inCount.disabled = !!isLocked();
        inCount.value = v || "";

        const btn = $("btnAccessSave");
        if (btn) {
          btn.disabled = !!isLocked();
          btn.title = "";
        }

        setText("accessState", "");
      }
    }
  }

  const phoneTxt = d.customer_phone || "—";
  const cntTxt = d.charger_count ? String(d.charger_count) : "—";
  const emailTxt = email || "—";
  const naamTxt = `${firstNice || ""} ${lastNice || ""}`.trim() || "—";

  const summary = $("accessSummary");
  if (summary) {
    clearNode(summary);

    const title = document.createElement("b");
    title.textContent = "Overzicht";
    summary.appendChild(title);

    appendTextLine(summary, "Naam", naamTxt);
    appendTextLine(summary, "E-mail", emailTxt);
    appendTextLine(summary, "Aantal laadpunten", cntTxt);
    appendTextLine(summary, "Mobiel", phoneTxt);
  }

  if ($("accessState") && !(Number(d.charger_count || 0) > UI_MAX_CHARGERS)) {
    $("accessState").textContent = "";
  }
}


/**
 * normalizePostcodeFront(pc)
 * Doel: NL postcode naar "1234AB"
 */
function normalizePostcodeFront(pc) {
  return String(pc || "").toUpperCase().replace(/\s+/g, "").trim();
}

/**
 * setAddressPreview(street, city)
 * Doel: zet read-only straat/plaats in UI.
 */
function setAddressPreview(street, city) {
  const f = $("addressForm");
  if (!f) return;
  f.querySelector('[name="street_ro"]').value = street || "";
  f.querySelector('[name="city_ro"]').value = city || "";
}

/**
 * setAddressSaveEnabled(enabled)
 * Doel: enable/disable Opslaan knop bij adres.
 */
function setAddressSaveEnabled(enabled) {
  const btn = $("btnAddressSave");
  if (btn) btn.disabled = !enabled;
}

/**
 * clearAddressPreview()
 * Doel: reset verified preview state + UI.
 */
function clearAddressPreview() {
  addressVerifiedPreview = null;
  setAddressPreview("", "");
  setAddressSaveEnabled(false);
}

/**
 * renderAddress()
 * Doel:
 * - vul adresform
 * - toon overzichtbox (incl. gecontroleerd op)
 * - GEEN losse statusregel in UI (jouw wens)
 */
function renderAddress() {
  const d = current?.dossier || {};
  const f = $("addressForm");
  if (!f) return;

  const pc = d.address_postcode || "";
  const hn = d.address_house_number || "";
  const suf = d.address_suffix || "";
  const street = d.address_street || "";
  const city = d.address_city || "";
  const checkedTxt = d.address_verified_at ? formatDateNL(d.address_verified_at) : "";

  f.querySelector('[name="postcode"]').value = pc;
  f.querySelector('[name="house_number"]').value = hn;
  f.querySelector('[name="suffix"]').value = suf;

  setAddressPreview(street, city);

  if (d.address_verified_at) {
    setAddressSaveEnabled(!isLocked());
  } else {
    setAddressSaveEnabled(!!addressVerifiedPreview && !isLocked());
  }

  const sum = $("addressSummary");
  if (sum) {
    clearNode(sum);

    const title = document.createElement("b");
    title.textContent = "Overzicht";
    sum.appendChild(title);

    const nrTxt = hn ? `${hn}${suf ? " " + String(suf).trim() : ""}` : "—";

    appendTextLine(sum, "Straat", street || "—");
    appendTextLine(sum, "Nummer", nrTxt);
    appendTextLine(sum, "Postcode", pc || "—");
    appendTextLine(sum, "Stad", city || "—");

    if (checkedTxt) {
      appendMutedLine(sum, `Gecontroleerd op: ${checkedTxt}`);
    }
  }

  setText("addressState", "");
}

/**
 * onAddressInputChanged()
 * Doel:
 * - debounce address verify
 * - bij succes: enable save + preview straat/plaats
 * - GEEN "aan het controleren" tekst (jouw wens)
 */
function onAddressInputChanged() {
  clearAddressPreview();

  if (addressVerifyTimer) clearTimeout(addressVerifyTimer);
  addressVerifyTimer = setTimeout(async () => {
    const f = $("addressForm");
    if (!f) return;

    const postcode = normalizePostcodeFront(f.querySelector('[name="postcode"]').value);
    const house_number = (f.querySelector('[name="house_number"]').value || "").trim();
    const suffix = (f.querySelector('[name="suffix"]').value || "").trim();

    // Geen UI spam tijdens typen; gewoon niet verifiëren als format niet klopt
    if (!/^[0-9]{4}[A-Z]{2}$/.test(postcode)) return;
    if (!/^[1-9][0-9]{0,4}$/.test(house_number)) return;

    try {
      const r = await apiAuthed("api-dossier-address-verify", { postcode, house_number, suffix });

      const street = r.street || "";
      const city = r.city || "";
      if (!street || !city) {
        showToast("Adres niet gevonden. Controleer je invoer.", "error");
        return;
      }

      addressVerifiedPreview = { street, city };
      setAddressPreview(street, city);
      setAddressSaveEnabled(!isLocked());
    } catch (e) {
      showToast(`Adres niet gevonden: ${e.message}`, "error");
      clearAddressPreview();
    }
  }, 450);
}

/**
 * renderChargers()
 * Doel:
 * - hint status t.o.v. required count
 * - tabel render + delete acties
 */
function renderChargers() {
  const wrap = $("chargersCards");
  if (!wrap) return;

  clearNode(wrap);

  const d = current?.dossier || {};
  const required = Number(d.charger_count || 0) || 0;
  const chargers = getChargersForUi();
  const have = chargers.length;

  const remaining = required > 0 ? Math.max(0, required - have) : 0;
  const over = required > 0 ? Math.max(0, have - required) : 0;

  const hint = $("chargerHint");
  if (hint) {
    clearNode(hint);

    if (required > 0) {
      if (remaining === 0 && over === 0) {
        const span = createEl("span", "ok");
        const bold = document.createElement("b");
        bold.textContent = "Compleet:";
        span.appendChild(bold);

        hint.appendChild(span);
        hint.appendChild(document.createTextNode(` ${have}/${required} laadpalen ingevoerd.`));
      } else if (remaining === 0 && over > 0) {
        const span = createEl("span", "danger");
        const bold = document.createElement("b");
        bold.textContent = "Te veel laadpalen:";
        span.appendChild(bold);

        hint.appendChild(span);
        hint.appendChild(document.createTextNode(` ${have}/${required}. Verwijder ${over} laadpaal(en).`));
      } else {
        const bold = document.createElement("b");
        bold.textContent = "Nog te doen:";
        hint.appendChild(bold);
        hint.appendChild(document.createTextNode(` ${remaining} laadpaal(en). (${have}/${required})`));
      }
    } else {
      hint.textContent = "Voeg minimaal 1 laadpaal toe.";
    }
  }

  const locked = isLocked();
  const btnSave = $("btnChargerSave");
  if (btnSave) {
    if (!locked && required > 0 && have >= required) {
      btnSave.disabled = true;
      btnSave.title = "Je hebt al het maximale aantal laadpalen ingevoerd.";
    } else {
      btnSave.disabled = !!locked;
      btnSave.title = "";
    }
  }

  if (!chargers.length) {
    const empty = createEl("div", "notice small muted", "Nog geen laadpalen toegevoegd.");
    wrap.appendChild(empty);
    return;
  }

  chargers.forEach((c, index) => {
    const card = createEl("div", "charger-card");

    const head = createEl("div", "charger-card__head");
    const titleWrap = createEl("div", "charger-card__titlewrap");

    const title = createEl("div", "charger-card__title", `Laadpaal ${index + 1}`);
    const subtitle = createEl(
      "div",
      "doc-card__subtitle",
      `${c.brand || "Onbekend merk"} — ${c.model || "Onbekend model"}`
    );

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const actions = createEl("div", "charger-card__actions");
    if (!locked) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "iconbtn iconbtn--danger";
      delBtn.setAttribute("aria-label", "Verwijder laadpaal");
      delBtn.title = "Verwijder";
      delBtn.dataset.act = "del";
      delBtn.dataset.id = c.id;
      delBtn.textContent = "×";
      actions.appendChild(delBtn);
    }

    head.appendChild(titleWrap);
    head.appendChild(actions);
    card.appendChild(head);

    const body = createEl("div", "charger-card__grid");

    const midItem = createEl("div", "charger-card__item");
    midItem.appendChild(createEl("div", "charger-card__label", "MID-nummer"));
    midItem.appendChild(createEl("div", "charger-card__value mono", c.mid_number || "—"));

    const serialItem = createEl("div", "charger-card__item");
    serialItem.appendChild(createEl("div", "charger-card__label", "Serienummer"));
    serialItem.appendChild(createEl("div", "charger-card__value mono", c.serial_number || "—"));

    body.appendChild(midItem);
    body.appendChild(serialItem);

    if (c.notes) {
      const notesItem = createEl("div", "charger-card__item charger-card__item--full");
      notesItem.appendChild(createEl("div", "charger-card__label", "Toelichting"));
      notesItem.appendChild(createEl("div", "charger-card__value", c.notes));
      body.appendChild(notesItem);
    }

    card.appendChild(body);
    wrap.appendChild(card);
  });

  if (locked) return;

  wrap.querySelectorAll("button[data-act='del']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!confirm("Weet je zeker dat je deze laadpaal wilt verwijderen?")) return;

      try {
        btn.disabled = true;
        await apiAuthed("api-dossier-charger-delete", { charger_id: id });
        showToast("Laadpaal verwijderd.", "success");
        invalidatePrecheck("laadpaal verwijderd");
        await reloadAll();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}




function createUploadSlot({ chargerId, docType, locked }) {
  const slot = createEl("div", "doc-upload-slot doc-upload-slot--missing");
  if (locked) slot.classList.add("doc-upload-slot--locked");

  const title = createEl(
    "div",
    "doc-upload-slot__title",
    "Document vereist"
  );

  const hint = createEl(
    "div",
    "doc-upload-slot__hint",
    locked
      ? "Dossier is vergrendeld."
      : "Sleep bestand hierheen of klik om te uploaden."
  );

  slot.appendChild(title);
  slot.appendChild(hint);

  if (locked) {
    return slot;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.className = "hidden";
  input.accept =
    ".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/png,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      await uploadDocumentForCard({
        charger_id: chargerId,
        doc_type: docType,
        file,
        slot,
      });
    } finally {
      input.value = "";
    }
  });

  slot.addEventListener("click", () => {
    input.click();
  });

  slot.addEventListener("dragenter", (e) => {
    e.preventDefault();
    slot.classList.add("is-dragover");
  });

  slot.addEventListener("dragover", (e) => {
    e.preventDefault();
    slot.classList.add("is-dragover");
  });

  slot.addEventListener("dragleave", (e) => {
    if (!slot.contains(e.relatedTarget)) {
      slot.classList.remove("is-dragover");
    }
  });

  slot.addEventListener("drop", async (e) => {
    e.preventDefault();
    slot.classList.remove("is-dragover");

    const file = e.dataTransfer?.files && e.dataTransfer.files[0];
    if (!file) return;

    await uploadDocumentForCard({
      charger_id: chargerId,
      doc_type: docType,
      file,
      slot,
    });
  });

  slot.appendChild(input);
  return slot;
}

function createDocSection({ title, docs, locked, chargerId, docType }) {
  const hasDocs = Array.isArray(docs) && docs.length > 0;

  const sectionTone = hasDocs
    ? "doc-group-section doc-group-section--ok"
    : "doc-group-section doc-group-section--missing";

  const section = createEl("div", sectionTone);

  const sectionTitle = createEl("div", "doc-group-section__title", title);
  section.appendChild(sectionTitle);

  // MVP/DB-contract: maximaal 1 document per type per laadpaal.
  // Daarom tonen we upload alleen zolang de sectie nog leeg is.
  if (!hasDocs) {
    section.appendChild(
      createUploadSlot({
        chargerId,
        docType,
        locked,
      })
    );

    section.appendChild(
      createEl("div", "doc-group-section__empty muted small", "Nog niet geüpload.")
    );

    return section;
  }

  docs.forEach((doc) => {
    const row = createEl("div", "doc-entry");

    const fileWrap = createEl("div", "doc-entry__file");

    const fileLink = document.createElement("a");
    fileLink.href = "#";
    fileLink.dataset.act = "open";
    fileLink.dataset.id = doc.id;
    fileLink.className = "doc-card__link";
    fileLink.title = doc.filename || "-";
    fileLink.textContent = doc.filename || "-";

    fileWrap.appendChild(fileLink);

    const actions = createEl("div", "doc-entry__actions");

    const deleteButton = createIconButton({
      className: `iconbtn iconbtn--danger ${locked ? "hidden" : ""}`,
      label: "Verwijder document",
      title: "Verwijder",
      action: "del",
      id: doc.id,
    });
    deleteButton.setAttribute("data-lock-hide", "1");

    actions.appendChild(deleteButton);

    row.appendChild(fileWrap);
    row.appendChild(actions);

    section.appendChild(row);
  });

  return section;
}

function renderDocs() {
  const docs = current?.documents || [];
  const cardsWrap = $("docsCards");
  if (!cardsWrap) return;

  clearNode(cardsWrap);

  const locked = isLocked();

  const hint = $("docsHint");
  if (hint) {
    hint.textContent = "Per laadpaal: minimaal 1 factuur installatie + 1 foto van het laadpunt.";
  }

  const chargers = getChargersForUi();

  if (!chargers.length) {
    cardsWrap.appendChild(createEl("div", "notice small muted", "Voeg eerst laadpalen toe in stap 3."));
    return;
  }

  const docsByCharger = {};
  chargers.forEach((c) => {
    docsByCharger[String(c.id)] = {
      factuur: [],
      foto_laadpunt: [],
    };
  });

  docs.forEach((doc) => {
    const chId = doc.charger_id ? String(doc.charger_id) : "";
    if (!chId || !docsByCharger[chId]) return;

    const dt = String(doc.doc_type || "").toLowerCase();
    if (dt === "factuur") docsByCharger[chId].factuur.push(doc);
    if (dt === "foto_laadpunt") docsByCharger[chId].foto_laadpunt.push(doc);
  });

  chargers.forEach((c, index) => {
    const chId = String(c.id);
    const grouped = docsByCharger[chId] || { factuur: [], foto_laadpunt: [] };

    const card = createEl("div", "charger-card doc-group-card");

    const head = createEl("div", "charger-card__head");
    const titleWrap = createEl("div", "charger-card__titlewrap");

    const title = createEl("div", "charger-card__title", `Laadpaal ${index + 1}`);
    const subtitle = createEl(
      "div",
      "doc-card__subtitle",
      `${c.brand || "—"} — ${c.model || "—"}`
    );

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    head.appendChild(titleWrap);
    card.appendChild(head);

    const metaGrid = createEl("div", "charger-card__grid");

    const midItem = createEl("div", "charger-card__item");
    midItem.appendChild(createEl("div", "charger-card__label", "MID-nummer"));
    midItem.appendChild(createEl("div", "charger-card__value mono", c.mid_number || "—"));

    const serialItem = createEl("div", "charger-card__item");
    serialItem.appendChild(createEl("div", "charger-card__label", "Serienummer"));
    serialItem.appendChild(createEl("div", "charger-card__value mono", c.serial_number || "—"));

    metaGrid.appendChild(midItem);
    metaGrid.appendChild(serialItem);

    card.appendChild(metaGrid);

    card.appendChild(
      createDocSection({
        title: "Factuur",
        docs: grouped.factuur,
        locked,
        chargerId: chId,
        docType: "factuur",
      })
    );

    card.appendChild(
      createDocSection({
        title: "Foto laadpunt",
        docs: grouped.foto_laadpunt,
        locked,
        chargerId: chId,
        docType: "foto_laadpunt",
      })
    );

    cardsWrap.appendChild(card);
  });

  cardsWrap.querySelectorAll("a[data-act='open']").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const id = a.getAttribute("data-id");

      try {
        a.classList.add("muted");
        const r = await apiAuthed("api-dossier-doc-download-url", { document_id: id });
        if (!r?.signed_url) throw new Error("Geen signed_url ontvangen.");
        window.open(r.signed_url, "_blank", "noopener");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        a.classList.remove("muted");
      }
    });
  });

  if (locked) return;

  cardsWrap.querySelectorAll("button[data-act='del']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const id = btn.getAttribute("data-id");
      if (!confirm("Weet je zeker dat je dit document wilt verwijderen?")) return;

      try {
        btn.disabled = true;
        await apiAuthed("api-dossier-doc-delete", { document_id: id });
        showToast("Document verwijderd.", "success");
        invalidatePrecheck("document verwijderd");
        await reloadAll();
      } catch (e2) {
        showToast(e2.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}


/**
 * setConsentsLocked(locked)
 * Doel: stap 5 read-only maken na succesvolle save (geen revoke UX),
 * maar wel visueel duidelijk: aangevinkt + grijs + unclickable.
 */
function setConsentsLocked(locked) {
  const ids = ["cTerms", "cPrivacy", "cMandaat"];

  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;

    el.disabled = !!locked;

    if (locked) {
      el.style.opacity = "0.6";
      el.style.cursor = "not-allowed";
    } else {
      el.style.opacity = "";
      el.style.cursor = "";
    }

    const label = document.querySelector(`label[for="${id}"]`);
    if (label) {
      if (locked) {
        label.style.opacity = "0.75";
        label.style.cursor = "not-allowed";
      } else {
        label.style.opacity = "";
        label.style.cursor = "";
      }
    }
  });

  const btn = $("btnConsentsSave");
  if (btn) {
    btn.disabled = !!locked;
    btn.classList.toggle("hidden", !!locked);
  }

  const state = $("consentsState");
  if (state) {
    state.textContent = locked
      ? "Opgeslagen. Toestemmingen zijn vastgelegd en kunnen niet meer worden aangepast."
      : "";
  }
}


/**
 * renderConsents()
 * Doel: checkbox state + laatst opgeslagen timestamp + lock UI na save.
 */
function renderConsents() {
  const cons = current?.consents || [];

  // pak de laatste status per consent_type (aannemende dat current.consents newest-first is)
  const latest = {};
  for (const c of cons) {
    const t = String(c.consent_type || "");
    if (!latest[t]) latest[t] = c;
  }

  const termsOk = latest["terms"]?.accepted === true;
  const privacyOk = latest["privacy"]?.accepted === true;
  const mandaatOk = latest["mandaat"]?.accepted === true;

  if ($("cTerms")) $("cTerms").checked = termsOk;
  if ($("cPrivacy")) $("cPrivacy").checked = privacyOk;
  if ($("cMandaat")) $("cMandaat").checked = mandaatOk;

  const ts =
    latest["mandaat"]?.accepted_at ||
    latest["privacy"]?.accepted_at ||
    latest["terms"]?.accepted_at ||
    "";

  if ($("consentsStamp")) {
    $("consentsStamp").textContent = ts ? `Laatst opgeslagen: ${formatDateNL(ts)}` : "";
  }

  // lock logic:
  // - als dossier locked is: sowieso lock
  // - anders: lock zodra alle drie TRUE zijn (geen revoke UX)
  const locked = isLocked() || (termsOk && privacyOk && mandaatOk);
  setConsentsLocked(locked);
}


// ======================================================
// 8) Actions (save/upload/review)
// ======================================================

/**
 * onAccessSave(e)
 * Doel: opslaan stap 1.
 * Let op: endpoint fallback blijft bewust aanwezig (safety).
 */
async function onAccessSave(e) {
  e.preventDefault();
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  const f = e.target;
  const btn = $("btnAccessSave");
  if (btn?.disabled) return;

  const rawFirst = (f.querySelector('[name="first_name"]')?.value || "").trim();
  const rawLast  = (f.querySelector('[name="last_name"]')?.value || "").trim();

  const first_name = normalizePersonName(rawFirst);
  const last_name  = normalizePersonName(rawLast);

  const customer_phone = (f.querySelector('[name="customer_phone"]')?.value || "").trim();
  if (customer_phone && !isValidMobile(customer_phone)) {
    return showToast("Vul een geldig mobiel nummer in (06xxxxxxxx of +316xxxxxxxx).", "error");
  }

  const charger_count_raw = (f.querySelector('[name="charger_count"]')?.value || "").trim();
  const charger_count = charger_count_raw ? Number(charger_count_raw) : null;

  if (!first_name) return showToast("Voornaam is verplicht.", "error");
  if (!last_name) return showToast("Achternaam is verplicht.", "error");
  if (!charger_count || !Number.isFinite(charger_count) || charger_count < 1) {
    return showToast("Kies het aantal laadpunten.", "error");
  }
  if (charger_count > UI_MAX_CHARGERS) {
    return showToast("Aanmelding is beperkt tot maximaal 4 laadpalen. Neem contact op voor batch dossiers.", "error");
  }

  lockSubmit(btn, true, "Opslaan…");

  try {
    try {
      await apiAuthed("api-dossier-access-save", {
        first_name,
        last_name,
        customer_phone: customer_phone || null,
        charger_count,
      });
    } catch (e1) {
      await apiAuthed("api-dossier-access-update", {
        first_name,
        last_name,
        customer_phone: customer_phone || null,
        charger_count,
      });
    }

    const inFirst = f.querySelector('[name="first_name"]');
    const inLast  = f.querySelector('[name="last_name"]');
    if (inFirst) inFirst.value = first_name;
    if (inLast)  inLast.value = last_name;

    showToast("Opgeslagen.", "success");
    invalidatePrecheck("stap 1 gewijzigd");
    await reloadAll();

  } catch (err) {
    console.error(err);
    showToast(err.message || "Opslaan mislukt.", "error");
  } finally {
    lockSubmit(btn, false, "Opslaan");
  }
}

/**
 * onAddressSave(e)
 * Doel: opslaan stap 2 nadat verify succesvol is.
 */
async function onAddressSave(e) {
  e.preventDefault();
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  const f = e.target;
  const btn = $("btnAddressSave");
  if (btn?.disabled) return;

  const postcode = normalizePostcodeFront(f.querySelector('[name="postcode"]').value.trim());
  const house_number = f.querySelector('[name="house_number"]').value.trim();
  const suffix = f.querySelector('[name="suffix"]').value.trim();

  const d = current?.dossier || {};
  if (!d.address_verified_at && !addressVerifiedPreview) {
    showToast("Controleer eerst het adres (automatisch) voordat je opslaat.", "error");
    return;
  }

  lockSubmit(btn, true, "Opslaan…");

  try {
    await apiAuthed("api-dossier-address-save", { postcode, house_number, suffix });
    showToast("Adres opgeslagen.", "success");
    invalidatePrecheck("stap 2 gewijzigd");
    await reloadAll();

  } catch (e2) {
    showToast(e2.message, "error");
  } finally {
    lockSubmit(btn, false, "Opslaan");
  }
}

/**
 * onChargerSave(e)
 * Doel: opslaan stap 3.
 */
async function onChargerSave(e) {
  e.preventDefault();
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  const f = e.target;
  const btn = $("btnChargerSave");
  if (btn?.disabled) return;

  lockSubmit(btn, true, "Opslaan…");

  try {
    const charger_id = f.querySelector('[name="charger_id"]').value || null;
    const brand = ($("chargerBrand")?.value || "").trim();
    let model = ($("chargerModel")?.value || "").trim();
    const serial_number = (f.querySelector('[name="serial_number"]')?.value || "").trim();
    const mid_number = (f.querySelector('[name="mid_number"]')?.value || "").trim();
    const notes = (f.querySelector('[name="notes"]')?.value || "").trim();

    if (!serial_number) return showToast("Serienummer is verplicht.", "error");
    if (!mid_number) return showToast("MID-nummer is verplicht.", "error");

    if (!brand) return showToast("Kies een merk.", "error");

    if (brand === "Anders") {
      model = "Onbekend";
      if (!notes || notes.length < 2) return showToast("Vul bij Anders merk/model de Toelichting in.", "error");
    } else {
      if (!model) return showToast("Kies een model.", "error");
      if (model === "Anders") {
        if (!notes || notes.length < 2) return showToast("Vul bij Anders model de Toelichting in.", "error");
      }
    }

    await apiAuthed("api-dossier-charger-save", {
      charger_id,
      serial_number,
      mid_number,
      brand,
      model,
      notes: (brand === "Anders" || model === "Anders") ? notes : null,
    });


    showToast("Laadpaal opgeslagen.", "success");
    f.reset();
    f.querySelector('[name="charger_id"]').value = "";
    toggleChargerNotes();
    invalidatePrecheck("stap 3 gewijzigd");
    await reloadAll();

  } catch (e2) {
    showToast(e2.message, "error");
  } finally {
    lockSubmit(btn, false, "Opslaan");
  }
}


// ======================================================
// Upload helpers: image compress + transform metadata
// ======================================================

function isImageFile(file) {
  const t = String(file?.type || "").toLowerCase();
  const n = String(file?.name || "").toLowerCase();
  return (
    t === "image/jpeg" ||
    t === "image/png" ||
    t === "image/jpg" ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png")
  );
}

function withJpgExtension(filename) {
  const name = String(filename || "upload").trim() || "upload";
  // strip extension
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  return `${base}.jpg`;
}

async function fileToImageBitmap(file) {
  // createImageBitmap is sneller/zuiniger dan Image() in veel browsers
  if (window.createImageBitmap) {
    const bmp = await createImageBitmap(file);
    return bmp;
  }

  // fallback via <img>
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error("Image decode failed"));
    });
    return img; // we behandelen dit als bitmap-achtige
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * compressImageToJpeg(file, opts)
 * - Input: jpg/png/jpeg
 * - Output: Blob (image/jpeg)
 */
async function compressImageToJpeg(file, opts) {
  const maxDim = Number(opts?.maxDim || 2000);
  const quality = Number(opts?.quality || 0.82);

  const src = await fileToImageBitmap(file);
  const w = src.width;
  const h = src.height;

  // bepaal scale
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas context unavailable");

  // draw
  ctx.drawImage(src, 0, 0, outW, outH);

  // toBlob jpeg
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image compress failed"))),
      "image/jpeg",
      quality
    );
  });

  // cleanup bitmap indien createImageBitmap gebruikt
  try { src.close?.(); } catch (_) {}

  return { blob, outW, outH, quality };
}

/**
 * prepareUploadFile(file, doc_type)
 * - Alleen compressie voor foto_laadpunt (en alleen image files)
 * - Geeft { uploadFile, client_transform }
 */
async function prepareUploadFile(file, doc_type) {
  const dt = String(doc_type || "").toLowerCase();

  // default: geen transform
  let client_transform = {
    applied: false,
    kind: null,
    original_bytes: file.size,
    final_bytes: file.size,
    original_mime: file.type || null,
    final_mime: file.type || null,
    original_filename: file.name || null,
    final_filename: file.name || null,
    max_dim: null,
    quality: null,
    out_w: null,
    out_h: null,
  };

  // Alleen foto compressen (niet PDF factuur)
  if (dt !== "foto_laadpunt") {
    return { uploadFile: file, client_transform };
  }

  // Alleen bij images
  if (!isImageFile(file)) {
    return { uploadFile: file, client_transform };
  }

  // compress → jpeg
  const maxDim = PHOTO_MAX_DIM_PX;
  const quality = PHOTO_JPEG_QUALITY;

  const { blob, outW, outH } = await compressImageToJpeg(file, { maxDim, quality });


  const newName = withJpgExtension(file.name);
  const uploadFile = new File([blob], newName, { type: "image/jpeg" });

  client_transform = {
    applied: true,
    kind: "image_downscale_jpeg",
    original_bytes: file.size,
    final_bytes: uploadFile.size,
    original_mime: file.type || null,
    final_mime: "image/jpeg",
    original_filename: file.name || null,
    final_filename: newName,
    max_dim: maxDim,
    quality,
    out_w: outW,
    out_h: outH,
  };

  return { uploadFile, client_transform };
}




/**
 * onUpload(e)
 * Doel: stap 4 upload:
 * - validate type/charger/file
 * - request signed url via api-dossier-upload-url
 * - PUT upload
*/

async function sha256FileHex(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadDocumentForCard({ charger_id, doc_type, file, slot }) {
  if (isLocked()) {
    showToast("Dossier is vergrendeld.", "error");
    return;
  }

  if (!charger_id) {
    showToast("Ongeldige laadpaal.", "error");
    return;
  }

  if (!doc_type) {
    showToast("Ongeldig documenttype.", "error");
    return;
  }

  if (!file) {
    showToast("Kies eerst een bestand.", "error");
    return;
  }

  const originalHint = slot?.querySelector(".doc-upload-slot__hint");
  const originalHintText = originalHint ? originalHint.textContent : "";

  try {
    if (slot) slot.classList.add("is-busy");
    if (originalHint) originalHint.textContent = "Bestand wordt verwerkt…";

    const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_ORIGINAL_BYTES) {
      throw new Error("Bestand is te groot. Max 25MB (origineel).");
    }

    const allowedExt = new Set(["pdf", "png", "jpg", "jpeg", "doc", "docx"]);
    const allowedMime = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);

    const name = (file.name || "").trim();
    const ext = name.toLowerCase().split(".").pop() || "";
    const mime = (file.type || "").trim();

    if (!allowedExt.has(ext)) {
      throw new Error("Ongeldig bestandstype. Alleen: PDF, PNG, JPG/JPEG, DOC, DOCX.");
    }
    if (mime && !allowedMime.has(mime)) {
      throw new Error("Ongeldig bestandstype. Alleen: PDF, PNG, JPG/JPEG, DOC, DOCX.");
    }

    if (originalHint) originalHint.textContent = "Bestand optimaliseren…";
    const prepared = await prepareUploadFile(file, doc_type);
    const uploadFile = prepared.uploadFile;
    const client_transform = prepared.client_transform;

    const MAX_FINAL_BYTES = 15 * 1024 * 1024;
    if (uploadFile.size > MAX_FINAL_BYTES) {
      throw new Error("Bestand is te groot na optimalisatie. Max 15MB.");
    }

    if (originalHint) originalHint.textContent = "Hash berekenen…";
    const file_sha256 = await sha256FileHex(uploadFile);

    if (originalHint) originalHint.textContent = "Upload voorbereiden…";
    const meta = await apiAuthed("api-dossier-upload-url", {
      doc_type,
      charger_id,
      filename: uploadFile.name,
      content_type: uploadFile.type || "application/octet-stream",
      size_bytes: uploadFile.size,
      client_transform,
    });

    if (!meta?.document_id) throw new Error("Upload voorbereiding faalde (geen document_id).");
    if (!meta?.signed_url) throw new Error("Upload voorbereiding faalde (geen signed_url).");

    if (originalHint) originalHint.textContent = "Uploaden…";
    const putRes = await fetch(meta.signed_url, {
      method: "PUT",
      headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
      body: uploadFile,
    });

    if (!putRes.ok) {
      throw new Error(`Upload failed: ${putRes.status}`);
    }

    if (originalHint) originalHint.textContent = "Bevestigen…";
    await apiAuthed("api-dossier-upload-confirm", {
      document_id: meta.document_id,
      file_sha256,
      client_transform,
    });

    setText("uploadState", "Geüpload en bevestigd.");
    showToast("Upload gelukt.", "success");
    invalidatePrecheck("document toegevoegd");
    await reloadAll();
  } catch (e) {
    setText("uploadState", e.message || "Upload mislukt.");
    showToast(e.message || "Upload mislukt.", "error");
  } finally {
    if (slot) {
      slot.classList.remove("is-busy");
      slot.classList.remove("is-dragover");
    }
    if (originalHint) {
      originalHint.textContent = originalHintText || "Sleep bestand hierheen of klik om te uploaden.";
    }
  }
}


/**
 * onConsentsSave(e)
 * Doel: stap 5 — alle 3 verplicht, opslaan via api-dossier-consents-save
 * Na succes: UI locken (geen revoke).
 */
async function onConsentsSave(e) {
  e.preventDefault();
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  const btn = $("btnConsentsSave");
  if (!btn || btn.disabled) return;

  const terms = $("cTerms")?.checked === true;
  const privacy = $("cPrivacy")?.checked === true;
  const mandaat = $("cMandaat")?.checked === true;

  if (!terms || !privacy || !mandaat) {
    const msg = "Vink alle drie de toestemmingen aan om door te gaan.";
    showToast(msg, "error");
    if ($("consentsState")) $("consentsState").textContent = msg;
    return;
  }

  lockSubmit(btn, true, "Opslaan…");

  try {
    if ($("consentsState")) $("consentsState").textContent = "Opslaan…";

    const consents = { terms, privacy, mandaat };
    await apiAuthed("api-dossier-consents-save", { consents });

    showToast("Toestemmingen opgeslagen.", "success");
    invalidatePrecheck("toestemmingen gewijzigd");

    // ✅ meteen locken in UI (ook voordat reloadAll klaar is)
    setConsentsLocked(true);

    // reload om timestamps/status uit DB te laten terugkomen
    await reloadAll();
  } catch (e2) {
    if ($("consentsState")) $("consentsState").textContent = e2.message;
    showToast(e2.message, "error");
  } finally {
    // knop is nu toch verborgen/locked, maar dit houdt state consistent als er een error was
    lockSubmit(btn, false, "Opslaan");
  }
}


/**
 * runEvaluate(finalize)
 * Doel:
 * - finalize=false => precheck (ready_for_review, GEEN lock)
 * - finalize=true  => indienen (in_review, WEL lock)
 */
async function runEvaluate(finalize) {
  const btn = finalize ? $("btnFinalize") : $("btnPrecheck");
  if (!btn) return;

  const d = current?.dossier || {};

  if (d.locked_at || String(d.status || "") === "in_review" || String(d.status || "") === "ready_for_booking") {
    showToast("Dit dossier is al ingediend.", "success");
    renderReviewStatePanel({
      tone: "ok",
      title: "Dossier al ingediend",
      intro: d.locked_at
        ? `In review sinds: ${formatDateNL(d.locked_at)}`
        : "Dit dossier staat al in review.",
      items: [],
    });
    return;
  }

  if (finalize) {
    const okConfirm = confirm(
      "Klopt alle informatie? Na indienen kunt u niets meer veranderen.\n\nDossier indienen?"
    );
    if (!okConfirm) return;
  }

  lockSubmit(btn, true, finalize ? "Indienen…" : "Controleren…");

  try {
    renderReviewStatePanel({
      tone: "warn",
      title: finalize ? "Dossier wordt ingediend" : "Controle wordt uitgevoerd",
      intro: finalize
        ? "Server controleert het dossier en probeert het daarna in te dienen."
        : "Volledigheid wordt gecontroleerd.",
      items: [],
    });

    if (!finalize) {
      // =====================================================
      // 1) CORE COMPLETENESS
      // =====================================================
      let coreJs;
      try {
        coreJs = await apiAuthed("api-dossier-evaluate", {
          finalize: false,
          evaluation_mode: "core",
        });
      } catch (e) {
        coreJs = normalizeApiErrorPayload(e, "Volledigheidscheck mislukt.");
      }

      if (!coreJs?.ok) {
        const missing = Array.isArray(coreJs?.missingSteps) ? coreJs.missingSteps : [];
        const msg = coreJs?.error || coreJs?.message || "Volledigheidscheck mislukt.";

        latestPrecheckAnalysis = null;
        precheckOk = false;
        dirtySincePrecheck = true;
        syncReviewButtons();

        if ($("analysisState")) {
          $("analysisState").textContent = "Analyse niet uitgevoerd: dossier is nog niet volledig.";
        }
        clearAnalysisUi();
        renderAnalysisUiEmptyState();

        renderMissingStepsPanel(missing, msg);

        showToast("Dossier is nog niet volledig.", "error");
        return;
      }

      renderReviewStatePanel({
        tone: "warn",
        title: "Documentcontrole wordt uitgevoerd",
        intro: "Dossier is volledig. De inhoud van de documenten wordt nu gecontroleerd.",
        items: [],
      });

      // =====================================================
      // 2) VERIFY / ANALYSIS
      // =====================================================
      try {
        const verifyJs = await apiAuthed("api-dossier-verify", { mode: "refresh" });

        if (verifyJs?.analysis_readable) {
          latestPrecheckAnalysis = verifyJs.analysis_readable;

          if ($("analysisSection")) $("analysisSection").classList.remove("hidden");
          renderAnalysisExportData({ analysis_readable: latestPrecheckAnalysis });

          if ($("analysisState")) {
            $("analysisState").textContent =
              `Analyse geladen. Run: ${latestPrecheckAnalysis.run_id || "-"}`;
          }
        } else {
          latestPrecheckAnalysis = null;

          if ($("analysisState")) {
            $("analysisState").textContent =
              "Analyse uitgevoerd, maar geen leesbare analyse-output ontvangen.";
          }
        }
      } catch (e) {
        latestPrecheckAnalysis = null;
        if ($("analysisState")) {
          $("analysisState").textContent =
            `Analyse uitvoeren mislukt: ${String(e?.message || e)}`;
        }
      }

      // =====================================================
      // 3) FULL EVALUATE
      // =====================================================
      let fullJs;
      try {
        fullJs = await apiAuthed("api-dossier-evaluate", {
          finalize: false,
          evaluation_mode: "full",
        });
      } catch (e) {
        fullJs = normalizeApiErrorPayload(e, "Documentcontrole blokkeert indiening.");
      }

      if (!fullJs?.ok) {
        const missing = Array.isArray(fullJs?.missingSteps) ? fullJs.missingSteps : [];
        const blocking = Array.isArray(fullJs?.blocking_reasons) ? fullJs.blocking_reasons : [];
        const warnings = Array.isArray(fullJs?.warnings) ? fullJs.warnings : [];
        const msg = fullJs?.error || fullJs?.message || "Documentcontrole blokkeert indiening.";

        precheckOk = false;
        dirtySincePrecheck = true;
        syncReviewButtons();

        renderBlockingAnalysisPanel({
          missing,
          blocking,
          warnings,
          fallbackMessage: msg,
        });

        showToast("Documentcontrole blokkeert indiening.", "error");
        return;
      }

      precheckOk = true;
      dirtySincePrecheck = false;
      syncReviewButtons();

      const warnings = Array.isArray(fullJs?.warnings) ? fullJs.warnings : [];
      renderPrecheckSuccessPanel(warnings);

      showToast("Volledigheidscheck en documentcontrole OK. Klaar om in te dienen.", "success");
      await reloadAll();
      return;
    }

    // =====================================================
    // FINALIZE FLOW
    // =====================================================
    let js;
    try {
      js = await apiAuthed("api-dossier-evaluate", {
        finalize: true,
        evaluation_mode: "full",
      });
    } catch (e) {
      js = normalizeApiErrorPayload(e, "Indienen geblokkeerd.");
    }

    if (!js?.ok) {
      const missing = Array.isArray(js?.missingSteps) ? js.missingSteps : [];
      const blocking = Array.isArray(js?.blocking_reasons) ? js.blocking_reasons : [];
      const warnings = Array.isArray(js?.warnings) ? js.warnings : [];
      const msg = js?.error || js?.message || "Indienen geblokkeerd.";

      precheckOk = false;
      dirtySincePrecheck = true;
      syncReviewButtons();

      renderBlockingAnalysisPanel({
        missing,
        blocking,
        warnings,
        fallbackMessage: msg,
      });

      showToast("Indienen geblokkeerd.", "error");
      return;
    }

    if (!js.locked_at) {
      renderReviewStatePanel({
        tone: "error",
        title: "Indienen mislukt",
        intro: "Indienen lijkt gelukt, maar dossier is niet vergrendeld. Probeer opnieuw.",
        items: [],
      });
      showToast("Indienen fout: dossier is niet vergrendeld.", "error");
      return;
    }

    latestPrecheckAnalysis = null;

    renderLockedReviewPanel(js.locked_at, Array.isArray(js?.warnings) ? js.warnings : []);

    showToast("Dossier ingediend. Staat nu in review.", "success");
    await reloadAll();
  } catch (e) {
    const normalized = normalizeApiErrorPayload(e, "Controle mislukt.");

    precheckOk = false;
    dirtySincePrecheck = true;
    syncReviewButtons();

    renderBlockingAnalysisPanel({
      missing: normalized.missingSteps,
      blocking: normalized.blocking_reasons,
      warnings: normalized.warnings,
      fallbackMessage: normalized.error,
    });

    showToast(normalized.error, "error");
  } finally {
    lockSubmit(btn, false, finalize ? "Dossier indienen" : "Controleer volledigheid");
  }
}

async function onPrecheckClicked() {
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");
  return runEvaluate(false);
}

async function onFinalizeClicked() {
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  // extra safety: ook als iemand via DOM/console triggert
  if (!(precheckOk === true && dirtySincePrecheck === false)) {
    return showToast("Controleer eerst volledigheid opnieuw.", "error");
  }

  return runEvaluate(true);
}

async function onDevUnlockClicked() {
  const btn = $("btnDevUnlock");
  const state = $("devUnlockState");

  if (!isDevUnlockEnabled()) {
    return showToast("Dev unlock is hier niet beschikbaar.", "error");
  }

  if (!isLocked()) {
    return showToast("Dossier is al ontgrendeld.", "error");
  }

  const okConfirm = confirm(
    "Dit ontgrendelt het dossier alleen voor development.\n\n" +
    "Status gaat terug naar 'incomplete' en je moet opnieuw controleren/indienen.\n\n" +
    "Doorgaan?"
  );
  if (!okConfirm) return;

  lockSubmit(btn, true, "Ontgrendelen…");

  try {
    if (state) state.textContent = "Dossier wordt ontgrendeld…";

    const js = await apiAuthed("api-dossier-dev-unlock", {});

    if (!js?.ok) {
      throw new Error(js?.error || "Dev unlock mislukt.");
    }

    precheckOk = false;
    dirtySincePrecheck = true;

    renderReviewStatePanel({
      tone: "warn",
      title: "Dossier ontgrendeld voor development",
      intro: "Controleer volledigheid opnieuw voordat je opnieuw indient.",
      items: [],
    });

    if (state) {
      state.textContent =
        "Dossier ontgrendeld voor development. Controleer volledigheid opnieuw.";
    }

    showToast("Dossier ontgrendeld voor development.", "success");
    await reloadAll();
  } catch (e) {
    if (state) state.textContent = e.message || "Dev unlock mislukt.";
    showToast(e.message || "Dev unlock mislukt.", "error");
  } finally {
    lockSubmit(btn, false, "Ontgrendel dossier (dev)");
  }
}

async function onLoadAnalysisClicked() {
  if (!isLocked()) {
    return showToast("Analyse is pas beschikbaar nadat het dossier is ingediend.", "error");
  }

  const btn = $("btnLoadAnalysis");
  const state = $("analysisState");
  if (!btn) return;

  lockSubmit(btn, true, "Laden…");

  try {
    if (state) state.textContent = "Analyse wordt opgehaald…";

    const data = await apiAuthed("api-dossier-export", {});

    if (!data?.analysis_readable) {
      throw new Error("Geen analysis_readable gevonden in export.");
    }

    renderAnalysisExportData(data);

    if (state) {
      state.textContent =
        `Analyse geladen. Run: ${data.analysis_readable.run_id || "-"}`;
    }

    showToast("Analyse geladen.", "success");
  } catch (e) {
    if (state) state.textContent = e.message || "Analyse laden mislukt.";
    showToast(e.message || "Analyse laden mislukt.", "error");
  } finally {
    lockSubmit(btn, false, "Laad analyse");
  }
}

async function onExportClicked() {
  if (!isLocked()) {
    return showToast("Export is pas beschikbaar nadat het dossier is ingediend.", "error");
  }

  const btn = $("btnExportDossier");
  const state = $("exportState");
  if (!btn) return;

  lockSubmit(btn, true, "Exporteren…");

  try {
    if (state) state.textContent = "Dossier-export wordt opgebouwd…";

    const data = await apiAuthed("api-dossier-export", {});
    downloadJsonFile(exportFilename(), data);

    if (state) state.textContent = "Export gedownload.";
    showToast("Dossier-export gedownload.", "success");
  } catch (e) {
    if (state) state.textContent = e.message || "Export mislukt.";
    showToast(e.message || "Export mislukt.", "error");
  } finally {
    lockSubmit(btn, false, "Exporteer dossier");
  }
}
