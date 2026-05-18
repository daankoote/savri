// assets/js/pages/dossier.js  (NON-module, gebruikt window.ENVAL uit /config.js)

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

function isRecoverableAccessError(err) {
  const msg = String(err?.message || err || "").toLowerCase();

  return (
    msg.includes("link already used") ||
    msg.includes("link expired") ||
    msg.includes("sessie ontbreekt") ||
    msg.includes("sessie verlopen") ||
    msg.includes("open je dossierlink opnieuw")
  );
}

function setMainDossierUiHidden(hidden) {
  document.querySelectorAll(".grid2.mt-18").forEach((el) => {
    el.classList.toggle("hidden", !!hidden);
  });

  // Access recovery mag analysis verbergen, maar nooit automatisch tonen.
  // Analysis visibility wordt uitsluitend bepaald door renderAnalysisUiEmptyState().
  const analysisSection = $("analysisSection");
  if (hidden && analysisSection) {
    analysisSection.classList.add("hidden");
  }
}

function showAccessRecovery(reasonMessage = "") {
  clearSessionToken();

  const card = $("accessRecoveryCard");
  if (card) card.classList.remove("hidden");

  setMainDossierUiHidden(true);

  if ($("statusPill")) {
    $("statusPill").className = "pill warn";
    $("statusPill").textContent = "Nieuwe link nodig";
  }

  if ($("statusExplain")) {
    $("statusExplain").textContent =
      "Deze toeganglink is verlopen of al gebruikt. Vraag hieronder een nieuwe toeganglink aan.";
  }

  if ($("accessRecoveryState")) {
    $("accessRecoveryState").textContent = reasonMessage
      ? `Nieuwe toeganglink nodig.`
      : "";
  }
}

function hideAccessRecovery() {
  const card = $("accessRecoveryCard");
  if (card) card.classList.add("hidden");

  setMainDossierUiHidden(false);

  if ($("accessRecoveryState")) {
    $("accessRecoveryState").textContent = "";
  }
}

function cleanupLegacySessionKey() {
  // Tijdelijk bewust NO-OP.
  // api.js storage helpers zijn nu verdacht en mogen deze flow niet meer beïnvloeden.
}

let current = null;
let latestPrecheckAnalysis = null;

function canViewAnalysisDetails() {
  return current?.permissions?.can_view_analysis_details === true;
}

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

function downloadTextFile(filename, text) {
  const blob = new Blob([String(text || "")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportReadmeFilename() {
  const safeId = String(dossier_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  return `enval-dossier-export-${safeId}-readme.txt`;
}

function readmeValue(value, fallback = "-") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function readmeDate(value) {
  const s = String(value || "").trim();
  return s ? formatDateNL(s) : "-";
}

function readmeStatus(status) {
  const s = String(status || "").trim().toLowerCase();

  if (s === "pass") return "pass";
  if (s === "fail") return "fail";
  if (s === "partial_pass") return "partial_pass";
  if (s === "not_checked") return "not_checked";
  if (s === "completed") return "completed";
  if (s === "inconclusive") return "inconclusive";

  return readmeValue(status);
}

function readmeCheckStatus(exportData, checkCode) {
  const checks = Array.isArray(exportData?.checks) ? exportData.checks : [];
  const found = checks.find((c) => String(c?.check_code || "") === checkCode);
  return readmeStatus(found?.status);
}

function readmeFirstDocument(exportData, docType) {
  const docs = Array.isArray(exportData?.documents_confirmed)
    ? exportData.documents_confirmed
    : [];

  return docs.find((doc) => String(doc?.doc_type || "").toLowerCase() === String(docType || "").toLowerCase()) || null;
}

function readmeAnalysisResult(exportData, analysisCode) {
  const chargers = Array.isArray(exportData?.analysis_readable?.chargers)
    ? exportData.analysis_readable.chargers
    : [];

  for (const charger of chargers) {
    const results = Array.isArray(charger?.analysis_results)
      ? charger.analysis_results
      : [];

    const found = results.find((r) => String(r?.analysis_code || "") === analysisCode);
    if (found) return found;
  }

  return null;
}

function buildReadableExportReadme(exportData) {
  const dossier = exportData?.dossier || {};
  const chargers = Array.isArray(exportData?.chargers) ? exportData.chargers : [];
  const firstCharger = chargers[0] || {};
  const invoiceDoc = readmeFirstDocument(exportData, "factuur");
  const analysisReadable = exportData?.analysis_readable || {};
  const analysisSummary = exportData?.analysis_summary || {};

  const invoiceAddress = readmeAnalysisResult(exportData, "invoice_address_match");
  const invoiceBrand = readmeAnalysisResult(exportData, "invoice_brand_match");
  const invoiceModel = readmeAnalysisResult(exportData, "invoice_model_match");
  const invoiceSerial = readmeAnalysisResult(exportData, "invoice_serial_match");
  const invoiceMid = readmeAnalysisResult(exportData, "invoice_mid_match");
  const photoVisible = readmeAnalysisResult(exportData, "photo_charger_visible");

  const lines = [];

  lines.push("ENVAL DOSSIERSAMENVATTING");
  lines.push("============================================================");
  lines.push("");
  lines.push("BELANGRIJK");
  lines.push("Deze README is niet de leidende export.");
  lines.push("De leidende export is het JSON-bestand met schema_version, export_sha256, dossierdata, documentdata, analysegegevens en audit-events.");
  lines.push("Deze README is alleen een leesbare samenvatting voor snelle menselijke beoordeling.");
  lines.push("");

  lines.push("1. WAT ENVAL DOET");
  lines.push("------------------------------------------------------------");
  lines.push("Enval helpt bij het structureren van een laadpaaldossier.");
  lines.push("Enval verzamelt dossiergegevens, bewijsstukken, technische controles en auditsporen in een overdraagbare JSON-export.");
  lines.push("");
  lines.push("Enval is geen inboeker, geen verificateur, geen certificerende partij en geeft geen garantie op acceptatie, ERE's, vergoeding of uitbetaling.");
  lines.push("");

  lines.push("2. DOSSIER");
  lines.push("------------------------------------------------------------");
  lines.push(`Dossier-ID: ${readmeValue(dossier.id)}`);
  lines.push(`Status: ${readmeValue(dossier.status)}`);
  lines.push(`Aangemaakt: ${readmeDate(dossier.created_at)}`);
  lines.push(`Ingediend/vergrendeld: ${readmeDate(dossier.locked_at)}`);
  lines.push(`Naam: ${readmeValue(`${readmeValue(dossier.customer_first_name, "")} ${readmeValue(dossier.customer_last_name, "")}`.trim())}`);
  lines.push(`E-mail: ${readmeValue(dossier.customer_email)}`);
  lines.push(`Adres: ${readmeValue(`${readmeValue(dossier.address_street, "")} ${readmeValue(dossier.address_house_number, "")}${dossier.address_suffix ? " " + dossier.address_suffix : ""}, ${readmeValue(dossier.address_postcode, "")} ${readmeValue(dossier.address_city, "")}`.trim())}`);
  lines.push(`Aantal laadpunten: ${readmeValue(dossier.charger_count)}`);
  lines.push("");

  lines.push("3. LAADPUNT");
  lines.push("------------------------------------------------------------");
  lines.push(`Merk: ${readmeValue(firstCharger.brand)}`);
  lines.push(`Model: ${readmeValue(firstCharger.model)}`);
  lines.push(`Serienummer: ${readmeValue(firstCharger.serial_number)}`);
  lines.push(`MID-nummer: ${readmeValue(firstCharger.mid_number)}`);
  lines.push("");

  lines.push("4. DOCUMENTEN");
  lines.push("------------------------------------------------------------");
  if (invoiceDoc) {
    lines.push(`Factuur: ${readmeValue(invoiceDoc.filename)}`);
    lines.push(`Documentstatus: ${readmeValue(invoiceDoc.status)}`);
    lines.push(`Content type: ${readmeValue(invoiceDoc.content_type)}`);
    lines.push(`Bestandsgrootte: ${readmeValue(invoiceDoc.size_bytes)} bytes`);
    lines.push(`SHA-256: ${readmeValue(invoiceDoc.file_sha256)}`);
    lines.push(`Bevestigd op: ${readmeDate(invoiceDoc.confirmed_at)}`);
  } else {
    lines.push("Factuur: geen confirmed factuur gevonden in deze export.");
  }
  lines.push("");

  lines.push("5. UITKOMST CONTROLES");
  lines.push("------------------------------------------------------------");
  lines.push(`E-mail bevestigd: ${readmeCheckStatus(exportData, "email_verified")}`);
  lines.push(`Adres bevestigd: ${readmeCheckStatus(exportData, "address_verified")}`);
  lines.push(`Aantal laadpunten klopt: ${readmeCheckStatus(exportData, "charger_exact_count")}`);
  lines.push(`MID per laadpunt aanwezig: ${readmeCheckStatus(exportData, "mid_per_charger")}`);
  lines.push(`Documenten per laadpunt aanwezig: ${readmeCheckStatus(exportData, "docs_per_charger")}`);
  lines.push(`Toestemmingen vastgelegd: ${readmeCheckStatus(exportData, "consents_required")}`);
  lines.push(`Factuurcontrole gate: ${readmeCheckStatus(exportData, "analysis_invoice_gate")}`);
  lines.push(`Analyse overall: ${readmeStatus(analysisReadable?.overall_status || analysisSummary?.overall_status)}`);
  lines.push(`Fotoanalyse: ${readmeStatus(photoVisible?.status || "not_checked")} — fotoanalyse is in deze MVP niet leidend en blokkeert de export niet.`);
  lines.push("");

  lines.push("6. HOE DE BELANGRIJKSTE CONTROLES ZIJN UITGEVOERD");
  lines.push("------------------------------------------------------------");
  lines.push("Adrescontrole:");
  lines.push("- De gebruiker voert postcode, huisnummer en eventuele toevoeging in.");
  lines.push("- Enval normaliseert de postcode en vraagt het adres op via de adrescontrole in de dossierflow.");
  lines.push("- Straat, plaats en adresreferentie worden pas opgeslagen nadat de adrescontrole een bruikbaar resultaat geeft.");
  lines.push(`- Resultaat in deze export: ${readmeCheckStatus(exportData, "address_verified")}.`);
  lines.push("");
  lines.push("Factuurverwerking:");
  lines.push("- De factuur moet in de MVP als PDF worden geüpload.");
  lines.push("- Na upload berekent de browser een SHA-256 hash over het bestand.");
  lines.push("- De server bevestigt de upload en controleert de hash server-side, zodat vastligt welk bestand onderdeel is van het dossier.");
  lines.push("- De PDF-tekst wordt client-side uitgelezen en als observed payload aangeboden aan de server-side verify stap.");
  lines.push("- De server-side verify stap vergelijkt de gelezen factuurvelden met de dossiergegevens en laadpaalgegevens.");
  lines.push("");
  lines.push("Factuurvergelijkingen:");
  lines.push(`- Factuuradres vs dossieradres: ${readmeStatus(invoiceAddress?.status)} (${readmeValue(invoiceAddress?.reason)})`);
  lines.push(`- Merk op factuur vs opgegeven merk: ${readmeStatus(invoiceBrand?.status)} (${readmeValue(invoiceBrand?.reason)})`);
  lines.push(`- Model op factuur vs opgegeven model: ${readmeStatus(invoiceModel?.status)} (${readmeValue(invoiceModel?.reason)})`);
  lines.push(`- Serienummer op factuur vs opgegeven serienummer: ${readmeStatus(invoiceSerial?.status)} (${readmeValue(invoiceSerial?.reason)})`);
  lines.push(`- MID-nummer op factuur vs opgegeven MID-nummer: ${readmeStatus(invoiceMid?.status)} (${readmeValue(invoiceMid?.reason)})`);
  lines.push("");
  lines.push("Volledigheidscontrole:");
  lines.push("- Enval controleert of verplichte onderdelen aanwezig zijn: e-mailbevestiging, adresbevestiging, laadpaalgegevens, MID-nummer, confirmed documenten en toestemmingen.");
  lines.push("- Alleen confirmed documenten tellen mee voor de dossiercontrole.");
  lines.push("- Bij indienen wordt het dossier vergrendeld, zodat de export een vaste toestand representeert.");
  lines.push("");

  lines.push("7. AUDITPOSITIE");
  lines.push("------------------------------------------------------------");
  lines.push("De JSON-export bevat de volledige audit trail met timestamps, request-id's, actor-referenties en technische metadata.");
  lines.push("Deze README toont alleen een vereenvoudigde selectie.");
  lines.push("Voor auditcontrole, herleidbaarheid of technische beoordeling moet altijd het JSON-bestand worden gebruikt.");
  lines.push("");
  lines.push(`Export-ID: ${readmeValue(exportData?.export_id)}`);
  lines.push(`Exportstatus: ${readmeValue(exportData?.export_status)}`);
  lines.push(`Paymentstatus: ${readmeValue(exportData?.payment_status)}`);
  lines.push(`Schema: ${readmeValue(exportData?.schema_version)}`);
  lines.push(`Claimjaar: ${readmeValue(exportData?.claim_year)}`);
  lines.push(`Claimed MID-nummers: ${Array.isArray(exportData?.claimed_mid_numbers) ? exportData.claimed_mid_numbers.join(", ") : "-"}`);
  lines.push(`Export SHA-256: ${readmeValue(exportData?.export_sha256)}`);
  lines.push("");
  lines.push("EINDE README");

  return lines.join("\n");
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
  const s = String(step || "").trim();
  if (!s) return "";

  if (s.toLowerCase().includes("factuurcontrole") || s.toLowerCase().includes("analyse")) {
    return "Er is een afwijking gevonden in de factuurcontrole. Controleer of het factuuradres, MID-nummer en serienummer overeenkomen met de gegevens in het dossier.";
  }

  return s;
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
    return "";
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
  if (s === "review_required") return { cls: "pill err", text: "fail" };
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


function getChargersForUi() {
  return Array.isArray(current?.chargers) ? [...current.chargers] : [];
}

function renderAnalysisUiEmptyState() {
  const section = $("analysisSection");
  const loadBtn = $("btnLoadAnalysis");

  if (!isDevAnalysisEnabled()) {
    if (section) section.classList.add("hidden");
    if (loadBtn) {
      loadBtn.classList.add("hidden");
      loadBtn.disabled = true;
    }
    clearAnalysisUi();
    setText("analysisState", "");
    return;
  }

  const locked = isLocked();
  const hasCachedAnalysis = !!latestPrecheckAnalysis;
  const shouldShowAnalysisSection = hasCachedAnalysis || locked;

  if (section) {
    section.classList.toggle("hidden", !shouldShowAnalysisSection);
  }

  if (loadBtn) {
    loadBtn.classList.add("hidden");
    loadBtn.disabled = true;
  }

  if (!shouldShowAnalysisSection) {
    clearAnalysisUi();
    setText("analysisState", "");
    return;
  }

  if (hasCachedAnalysis) {
    setText("analysisState", `Analyse geladen. Run: ${latestPrecheckAnalysis.run_id || "-"}`);
    renderAnalysisExportData({ analysis_readable: latestPrecheckAnalysis });
    return;
  }

  clearAnalysisUi();

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
    "Let op: pass betekent dat een specifiek veld uit een document is gelezen en inhoudelijk matcht. partial_pass betekent dat minimaal één relevante controle pass is, maar nog niet alles. inconclusive betekent dat er onvoldoende bruikbare data is om een betrouwbare conclusie te trekken. not_checked betekent dat de analyse voor dat documenttype nog niet is geïmplementeerd. fail betekent dat een relevante controle inhoudelijk niet overeenkomt.",
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

async function apiAuthed(fnName, body, options) {
  return apiPost(fnName, authedBody(body), options || {});
}

async function onAccessRecoverySubmit(e) {
  e.preventDefault();

  const form = e.target;
  const btn = $("btnAccessRecovery");
  const state = $("accessRecoveryState");
  const email = String(form?.querySelector('[name="email"]')?.value || "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (state) state.textContent = "Vul een geldig e-mailadres in.";
    showToast("Vul een geldig e-mailadres in.", "error");
    return;
  }

  lockSubmit(btn, true, "Versturen…");

  try {
    await apiPost("api-dossier-login-request", {
      dossier_id,
      email,
    });

    if (state) {
      state.textContent =
        "Als dit e-mailadres bij dit dossier hoort, sturen wij een nieuwe toeganglink. Controleer ook uw spamfolder.";
    }

    showToast("Aanvraag ontvangen. Controleer uw e-mail.", "success");
  } catch (err) {
    console.error("access recovery failed:", err);

    // Anti-enumeration UX: ook bij onverwachte frontend/API-fout niet te specifiek worden.
    if (state) {
      state.textContent =
        "Als dit e-mailadres bij dit dossier hoort, sturen wij een nieuwe toeganglink. Controleer ook uw spamfolder.";
    }

    showToast("Aanvraag verwerkt. Controleer uw e-mail.", "success");
  } finally {
    lockSubmit(btn, false, "Stuur nieuwe toeganglink");
  }
}

function getAnalyseImageStep1Precheck() {
  return window.ENVAL?.image_step_1_precheck || null;
}

function getAnalyseImageStep1Upload() {
  return window.ENVAL?.image_step_1_upload || null;
}

function getAnalyseVerifyPayload() {
  return window.ENVAL?.verify_payload || null;
}

async function upsertObservedSourceForInvoiceDocument(args) {
  const document_id = String(args?.document_id || "").trim();
  const parserResult = args?.parser_result || null;

  if (!document_id) {
    throw new Error("upsertObservedSourceForInvoiceDocument: missing document_id");
  }
  if (!parserResult || typeof parserResult !== "object") {
    throw new Error("upsertObservedSourceForInvoiceDocument: missing parser_result");
  }

  const confidence = parserResult?.confidence || {};
  const limitations = Array.isArray(parserResult?.limitations) ? parserResult.limitations : [];
  const observedCount = Number(confidence?.observed_non_null_fields || 0);

  const shouldSkipPersist =
    String(parserResult?.source_kind || "").trim().toLowerCase() === "pdf" &&
    (
      observedCount <= 0 ||
      limitations.includes("pdf_text_extraction_empty")
    );

  if (shouldSkipPersist) {
    console.warn("Skipping persisted observed-source upsert for empty PDF parser result", {
      document_id,
      parser_kind: parserResult?.parser_kind,
      parser_version: parserResult?.parser_version,
      confidence,
      limitations,
      summary: parserResult?.summary || {},
      debug: parserResult?.debug || null,
    });

    return {
      skipped: true,
      reason: "empty_pdf_parser_result_not_persisted",
    };
  }

  await apiAuthed("api-dossier-observed-source-upsert", {
    document_id,
    producer_kind: String(parserResult?.parser_kind || "").trim() || null,
    producer_version: String(parserResult?.parser_version || "").trim() || null,
    source_kind: String(parserResult?.source_kind || "").trim() || "unknown",
    status: "completed",
    observed_fields: parserResult?.observed_fields || {},
    confidence,
    limitations,
    summary: parserResult?.summary || {},
    field_sources: parserResult?.field_sources || {},
    pages: Array.isArray(parserResult?.pages) ? parserResult.pages : [],
  });

  return {
    skipped: false,
    reason: null,
  };
}

function getInvoiceImagePrecheckUiSummary(precheck) {
  const imageStep1Upload = getAnalyseImageStep1Upload();
  if (imageStep1Upload?.summarizeInvoiceUploadPrecheck) {
    return imageStep1Upload.summarizeInvoiceUploadPrecheck(precheck);
  }

  const imageStep1Precheck = getAnalyseImageStep1Precheck();
  if (imageStep1Precheck?.summarizeInvoiceImagePrecheck) {
    return imageStep1Precheck.summarizeInvoiceImagePrecheck(precheck);
  }

  return {
    block: true,
    title: "Factuurafbeelding afgekeurd",
    messages: ["Precheck-resultaat ontbreekt of is ongeldig."],
  };
}

function getInvoiceImagePrecheckUiMessage(precheck) {
  const summary = getInvoiceImagePrecheckUiSummary(precheck);
  const messages = Array.isArray(summary?.messages) ? summary.messages.filter(Boolean) : [];
  return messages.join(" ").trim();
}

function invoiceImageWarningStorageKey() {
  return `enval_invoice_image_precheck_warn:${dossier_id}`;
}

function readInvoiceImageWarningState() {
  try {
    const raw = sessionStorage.getItem(invoiceImageWarningStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeInvoiceImageWarningState(state) {
  try {
    sessionStorage.setItem(
      invoiceImageWarningStorageKey(),
      JSON.stringify(state && typeof state === "object" ? state : {})
    );
  } catch (_) {}
}

function setInvoiceImageWarningForDocument(args) {
  const documentId = String(args?.document_id || "").trim();
  if (!documentId) return;

  const state = readInvoiceImageWarningState();
  state[documentId] = {
    document_id: documentId,
    charger_id: String(args?.charger_id || "").trim() || null,
    doc_type: String(args?.doc_type || "").trim().toLowerCase() || null,
    title: String(args?.title || "").trim() || "Factuurafbeelding twijfelachtig",
    message: String(args?.message || "").trim() || "",
    created_at: new Date().toISOString(),
  };
  writeInvoiceImageWarningState(state);
}

function getInvoiceImageWarningForDocument(documentId) {
  const id = String(documentId || "").trim();
  if (!id) return null;

  const state = readInvoiceImageWarningState();
  const item = state[id];
  return item && typeof item === "object" ? item : null;
}

function removeInvoiceImageWarningForDocument(documentId) {
  const id = String(documentId || "").trim();
  if (!id) return;

  const state = readInvoiceImageWarningState();
  if (!Object.prototype.hasOwnProperty.call(state, id)) return;

  delete state[id];
  writeInvoiceImageWarningState(state);
}

function pruneInvoiceImageWarningState(documents) {
  const keepIds = new Set(
    (Array.isArray(documents) ? documents : [])
      .map((doc) => String(doc?.id || "").trim())
      .filter(Boolean)
  );

  const state = readInvoiceImageWarningState();
  let changed = false;

  Object.keys(state).forEach((documentId) => {
    if (!keepIds.has(documentId)) {
      delete state[documentId];
      changed = true;
    }
  });

  if (changed) {
    writeInvoiceImageWarningState(state);
  }
}

// Precheck UX state (client-side)
let precheckOk = false;
let dirtySincePrecheck = true;

function invalidatePrecheck(reason = "") {
  precheckOk = false;
  dirtySincePrecheck = true;
  latestPrecheckAnalysis = null;

  // Bewust stil houden tijdens normale save/upload/delete acties.
  // Review/analyse UI mag pas zichtbaar worden wanneer gebruiker expliciet
  // "Controleer volledigheid" uitvoert, of wanneer het dossier locked is.
  const reviewState = $("reviewState");
  if (reviewState) {
    clearNode(reviewState);
  }

  clearAnalysisUi();
  renderAnalysisUiEmptyState();
  syncReviewButtons();
}

function isDevAnalysisEnabled() {
  return canViewAnalysisDetails();
}

function isDevUnlockEnabled() {
  return canViewAnalysisDetails();
}

function syncReviewButtons() {
  const locked = isLocked();
  const canFinalize = !locked && precheckOk === true && dirtySincePrecheck === false;

  // Precheck knop:
  // - zichtbaar zolang dossier niet locked is én er nog geen geldige precheck is
  // - verborgen zodra "Dossier indienen" zichtbaar wordt
  if ($("btnPrecheck")) {
    $("btnPrecheck").disabled = !!locked || canFinalize;
    $("btnPrecheck").classList.toggle("hidden", !!locked || canFinalize);
  }

  // Finalize knop:
  // - VERBERGEN tot precheckOk=true én dirtySincePrecheck=false
  if ($("btnFinalize")) {
    $("btnFinalize").disabled = !canFinalize;
    $("btnFinalize").classList.toggle("hidden", !canFinalize);
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

  // token is alleen nodig als je nog géén session_token hebt.
  // Zonder token/session tonen we recovery in plaats van een doodlopende fout.
  if (!getSessionToken() && !token) {
    showAccessRecovery("missing_session_or_token");
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
  $("accessRecoveryForm")?.addEventListener("submit", onAccessRecoverySubmit);


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

    hideAccessRecovery();

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
    if (!token) {
      showAccessRecovery("missing_link_token");
      return;
    }

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

    if (isRecoverableAccessError(e)) {
      showAccessRecovery(String(e?.message || ""));
      showToast("Vraag een nieuwe toeganglink aan.", "error");
      return;
    }

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
  const verifyPayload = getAnalyseVerifyPayload();
  if (verifyPayload) {
    verifyPayload.syncCurrentSnapshot(current);
  }

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
    docType === "factuur" ? "PDF-factuur vereist" : "Foto optioneel"
  );

  const hint = createEl(
    "div",
    "doc-upload-slot__hint",
    locked
      ? "Dossier is vergrendeld."
      : docType === "factuur"
        ? "Upload de factuur als PDF. Afbeeldingen worden voor facturen nog niet ondersteund."
        : "Optioneel: upload een JPG/PNG-foto van het laadpunt."
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
    docType === "factuur"
      ? ".pdf,application/pdf"
      : ".png,.jpg,.jpeg,image/png,image/jpeg";

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
  const list = Array.isArray(docs) ? docs : [];
  const hasDocs = list.length > 0;
  const hasIssued = list.some((doc) => String(doc?.status || "").toLowerCase() === "issued");
  const hasConfirmed = list.some((doc) => String(doc?.status || "").toLowerCase() === "confirmed");

  const warningEntries = list
    .map((doc) => ({
      doc,
      warning: getInvoiceImageWarningForDocument(doc?.id),
    }))
    .filter((entry) => !!entry.warning);

  const hasWarning = warningEntries.length > 0;

  const sectionTone = !hasDocs
    ? "doc-group-section doc-group-section--missing"
    : hasWarning
      ? "doc-group-section doc-group-section--missing"
      : "doc-group-section doc-group-section--ok";

  const section = createEl("div", sectionTone);

  const sectionTitle = createEl("div", "doc-group-section__title", title);
  section.appendChild(sectionTitle);

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

  if (hasIssued && !locked) {
    const recovery = createEl(
      "div",
      "doc-group-section__empty muted small",
      "Upload gestart maar nog niet bevestigd. Verwijder dit document en upload opnieuw als de vorige poging is mislukt."
    );
    section.appendChild(recovery);
  } else if (hasWarning) {
    const info = createEl(
      "div",
      "doc-group-section__empty muted small",
      "Document aanwezig met waarschuwing uit client-side precheck."
    );
    section.appendChild(info);
  } else if (hasConfirmed) {
    const info = createEl(
      "div",
      "doc-group-section__empty muted small",
      "Document aanwezig."
    );
    section.appendChild(info);
  }

  list.forEach((doc) => {
    const warningState = getInvoiceImageWarningForDocument(doc?.id);

    const rowWrap = createEl("div", "");
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

    const statusText = String(doc?.status || "").trim();
    if (statusText) {
      const statusMeta = analysisStatusMeta(statusText);
      const statusBadge = document.createElement("span");
      statusBadge.className = `${statusMeta.cls} ml-8`;
      statusBadge.textContent = statusMeta.text;
      fileWrap.appendChild(statusBadge);
    }

    if (warningState) {
      const warnBadge = document.createElement("span");
      warnBadge.className = "pill warn ml-8";
      warnBadge.textContent = "warning";
      fileWrap.appendChild(warnBadge);
    }

    if (warningState?.message) {
      const warnText = createEl("div", "muted small mt-8", warningState.message);
      fileWrap.appendChild(warnText);
    }

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

    rowWrap.appendChild(row);
    section.appendChild(rowWrap);
  });

  return section;
}

function renderDocs() {
  const docs = current?.documents || [];
  const cardsWrap = $("docsCards");
  if (!cardsWrap) return;

  pruneInvoiceImageWarningState(docs);
  clearNode(cardsWrap);

  const locked = isLocked();

  const hint = $("docsHint");
  if (hint) {
    clearNode(hint);
    hint.classList.add("hidden");
    hint.textContent = "";
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

    if (canViewAnalysisDetails()) {
      card.appendChild(
        createDocSection({
          title: "Foto laadpunt",
          docs: grouped.foto_laadpunt,
          locked,
          chargerId: chId,
          docType: "foto_laadpunt",
        })
      );
    }

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

        removeInvoiceImageWarningForDocument(id);

        const verifyPayload = getAnalyseVerifyPayload();
        if (verifyPayload) {
          verifyPayload.removeUploadedDocument(id);
        }

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

    const name = (file.name || "").trim();
    const ext = name.toLowerCase().split(".").pop() || "";
    const mime = (file.type || "").trim();
    const normalizedDocType = String(doc_type || "").toLowerCase();

    if (normalizedDocType === "factuur") {
      if (ext !== "pdf" || (mime && mime !== "application/pdf")) {
        throw new Error("Upload de factuur als PDF. JPG/PNG-facturen worden voor MVP nog niet ondersteund.");
      }
    } else if (normalizedDocType === "foto_laadpunt") {
      const allowedPhotoExt = new Set(["png", "jpg", "jpeg"]);
      const allowedPhotoMime = new Set(["image/png", "image/jpeg"]);

      if (!allowedPhotoExt.has(ext)) {
        throw new Error("Ongeldig bestandstype. Upload een JPG- of PNG-foto.");
      }
      if (mime && !allowedPhotoMime.has(mime)) {
        throw new Error("Ongeldig bestandstype. Upload een JPG- of PNG-foto.");
      }
    } else {
      throw new Error("Ongeldig documenttype.");
    }

    let uploadFile = file;
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

    const imageStep1Precheck = getAnalyseImageStep1Precheck();
    const imageStep1Upload = getAnalyseImageStep1Upload();

    const isInvoiceImage =
      doc_type === "factuur" &&
      (
        String(file?.type || "").toLowerCase() === "image/jpeg" ||
        String(file?.type || "").toLowerCase() === "image/png" ||
        String(file?.name || "").toLowerCase().endsWith(".jpg") ||
        String(file?.name || "").toLowerCase().endsWith(".jpeg") ||
        String(file?.name || "").toLowerCase().endsWith(".png")
      );

    let invoicePrecheckDecision = "allow";
    let invoicePrecheckSummary = null;
    let invoicePrecheckMessage = "";

    if (isInvoiceImage && imageStep1Upload && imageStep1Precheck) {
      if (originalHint) originalHint.textContent = "Factuur precheck…";

      const invoicePrecheck = await imageStep1Upload.prepareInvoiceImagePrecheck(file, doc_type);
      invoicePrecheckSummary = getInvoiceImagePrecheckUiSummary(invoicePrecheck);
      invoicePrecheckMessage = getInvoiceImagePrecheckUiMessage(invoicePrecheck);
      invoicePrecheckDecision = String(invoicePrecheck?.decision || "").trim().toLowerCase();

      console.log("ANALYSE_IMAGE_STEP_1_PRECHECK", {
        precheck: invoicePrecheck,
        summary: invoicePrecheckSummary,
      });

      if (
        !invoicePrecheck?.ok ||
        imageStep1Upload.shouldBlockInvoiceUpload(invoicePrecheck) ||
        invoicePrecheckSummary?.block === true
      ) {
        throw new Error(
          invoicePrecheckMessage ||
          "Factuur-afbeelding is client-side afgekeurd."
        );
      }

      if (String(invoicePrecheck?.decision || "").trim() === "warn" && invoicePrecheckMessage) {
        showToast(invoicePrecheckMessage, "warning");
      }
    }

    if (originalHint) originalHint.textContent = "Bestand optimaliseren…";

    if (imageStep1Upload) {
      const prepared = await imageStep1Upload.prepareUploadFile(file, doc_type);
      uploadFile = prepared.uploadFile;
      client_transform = prepared.client_transform;
    } else {
      const prepared = await prepareUploadFile(file, doc_type);
      uploadFile = prepared.uploadFile;
      client_transform = prepared.client_transform;
    }

    const MAX_FINAL_BYTES = 15 * 1024 * 1024;
    if (uploadFile.size > MAX_FINAL_BYTES) {
      throw new Error("Bestand is te groot na optimalisatie. Max 15MB.");
    }

    if (originalHint) originalHint.textContent = "Hash berekenen…";
    const imageStep1UploadForHash = getAnalyseImageStep1Upload();
    const file_sha256 = imageStep1UploadForHash
      ? await imageStep1UploadForHash.sha256FileHex(uploadFile)
      : await sha256FileHex(uploadFile);

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

    if (
      isInvoiceImage &&
      invoicePrecheckDecision === "warn" &&
      invoicePrecheckMessage
    ) {
      setInvoiceImageWarningForDocument({
        document_id: meta.document_id,
        charger_id,
        doc_type,
        title: invoicePrecheckSummary?.title || "Factuurafbeelding twijfelachtig",
        message: invoicePrecheckMessage,
      });
    }

    const verifyPayload = getAnalyseVerifyPayload();
    if (verifyPayload) {
      verifyPayload.registerUploadedDocument({
        document_id: meta.document_id,
        charger_id,
        doc_type,
        filename: uploadFile.name,
        content_type: uploadFile.type || "application/octet-stream",
        size_bytes: uploadFile.size,
        file_sha256,
        client_transform,
      });
    }

    let invoiceAnalysisState = null;
    let observedSourceUpserted = false;
    let observedSourceUpsertState = null;

    if (String(doc_type || "").toLowerCase() === "factuur") {
      const verifyPayload = getAnalyseVerifyPayload();

      if (verifyPayload?.maybeParseAndRegisterInvoiceDocument) {
        invoiceAnalysisState = await verifyPayload.maybeParseAndRegisterInvoiceDocument({
          file: uploadFile,
          document_id: meta.document_id,
          doc_type,
          content_type: uploadFile.type || "application/octet-stream",
          filename: uploadFile.name,
        });

        const parsedPdf =
          invoiceAnalysisState &&
          invoiceAnalysisState.ok !== false &&
          invoiceAnalysisState.skipped === false &&
          invoiceAnalysisState.parser_result &&
          String(invoiceAnalysisState?.parser_result?.source_kind || "").trim().toLowerCase() === "pdf";

        if (parsedPdf) {
          observedSourceUpsertState = await upsertObservedSourceForInvoiceDocument({
            document_id: meta.document_id,
            parser_result: invoiceAnalysisState.parser_result,
          });

          observedSourceUpserted = observedSourceUpsertState?.skipped !== true;
        }
      } else {
        invoiceAnalysisState = {
          ok: false,
          skipped: true,
          reason: "verify_payload_pdf_registration_helper_missing",
        };
      }
    }

    if (invoiceAnalysisState?.ok && invoiceAnalysisState?.skipped === false) {
      if (observedSourceUpserted) {
        setText("uploadState", "Geüpload, bevestigd, lokaal geanalyseerd en server-side vastgelegd.");
      } else if (observedSourceUpsertState?.reason === "empty_pdf_parser_result_not_persisted") {
        setText("uploadState", "Geüpload en bevestigd. Browser PDF-analyse gaf geen bruikbare velden; niets server-side opgeslagen.");
      } else {
        setText("uploadState", "Geüpload en bevestigd. Lokale analyse beschikbaar, maar nog niet server-side vastgelegd.");
      }
    } else if (
      String(doc_type || "").toLowerCase() === "factuur" &&
      invoiceAnalysisState &&
      invoiceAnalysisState?.skipped === false
    ) {
      setText("uploadState", "Geüpload en bevestigd. Lokale factuuranalyse mislukte.");
    } else {
      setText("uploadState", "Geüpload en bevestigd.");
    }

    showToast("Upload gelukt.", "success");
    invalidatePrecheck("document toegevoegd");
    await reloadAll();
  } catch (e) {
    const msg = String(e?.message || "Upload mislukt.");

    setText("uploadState", msg);
    showToast(msg, "error");

    const lower = msg.toLowerCase();
    const looksLikeExistingDocConflict =
      lower.includes("er is al een factuur toegevoegd") ||
      lower.includes("er is al een document toegevoegd") ||
      lower.includes("409");

    if (looksLikeExistingDocConflict) {
      setText(
        "uploadState",
        "Er staat nog een document voor deze laadpaal open. De documentlijst wordt opnieuw geladen."
      );

      try {
        await reloadAll();
      } catch (_) {}
    }
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
        const verifyPayload = getAnalyseVerifyPayload();
        const verifyExtra = verifyPayload
          ? verifyPayload.buildVerifyExtra({ mode: "refresh" })
          : { mode: "refresh", client_verify_payload: null };

        console.log("DOSSIER verifyExtra", verifyExtra);

        const verifyJs = await apiAuthed("api-dossier-verify", verifyExtra);

        if (verifyJs?.analysis_readable) {
          latestPrecheckAnalysis = verifyJs.analysis_readable;

          if (isDevAnalysisEnabled()) {
            if ($("analysisSection")) $("analysisSection").classList.remove("hidden");
            renderAnalysisExportData({ analysis_readable: latestPrecheckAnalysis });

            if ($("analysisState")) {
              $("analysisState").textContent =
                `Analyse geladen. Run: ${latestPrecheckAnalysis.run_id || "-"}`;
            }
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

    // Tweede download is bewust client-side en afgeleid uit dezelfde JSON-export.
    // De JSON blijft leidend; README is alleen een menselijke samenvatting.
    setTimeout(() => {
      downloadTextFile(exportReadmeFilename(), buildReadableExportReadme(data));
    }, 150);

    if (state) state.textContent = "Export en README gedownload.";
    showToast("Dossier-export en README gedownload.", "success");
  } catch (e) {
    if (state) state.textContent = e.message || "Export mislukt.";
    showToast(e.message || "Export mislukt.", "error");
  } finally {
    lockSubmit(btn, false, "Download dossier");
  }
}
