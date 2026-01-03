// /dossier.js  (NON-module, gebruikt window.ENVAL uit /config.js)
console.log("DOSSIER.JS LOADED v2026-01-02-01");

// ---------------- helpers ----------------
function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.className = `toast toast--${type}`;
  div.textContent = message;
  document.body.appendChild(div);

  setTimeout(() => div.remove(), 4200);
}

function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Centrale POST helper: ALTIJD Idempotency-Key meesturen
async function apiPost(fnName, body) {
  const idem = newIdempotencyKey();

  const res = await fetch(`${window.ENVAL.API_BASE}/${fnName}`, {
    method: "POST",
    headers: window.ENVAL.edgeHeaders({ "Idempotency-Key": idem }),
    body: JSON.stringify(body),
  });

  // Soms bij CORS/500 krijg je geen leesbare body -> safe parse
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json.ok) {
    console.error("apiPost failed:", fnName, "status:", res.status, "json:", json);
    const msg = json?.error || json?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json;
}

// ---------------- UI status helpers ----------------
function pillForStatus(status) {
  if (status === "ready_for_booking") return { cls: "pill ok", text: "Klaar voor inboeken" };
  if (status === "ready_for_review") return { cls: "pill warn", text: "Klaar voor review" };
  if (status === "in_review") return { cls: "pill warn", text: "In review" };
  return { cls: "pill", text: "Onvolledig" };
}

function explainStatus(status) {
  if (status === "ready_for_booking") return "Alles is compleet. Dit dossier kan door naar inboeken.";
  if (status === "ready_for_review") return "Alles lijkt compleet, maar moet nog gecontroleerd worden (review).";
  if (status === "in_review") return "Dit dossier staat op review. Je hoeft niets te doen tenzij er om extra info wordt gevraagd.";
  return "Er ontbreken nog onderdelen. Vul de stappen hierboven in.";
}

// ---------------- Brand/Model mapping (voor jouw HTML: #chargerBrand/#chargerModel) ----------------
const BRAND_MODELS = {
  "Alfen": ["Eve Single Pro-line", "Eve Double Pro-line", "Eve Single S-line"],
  "Zaptec": ["Go", "Pro"],
  "Easee": ["Home", "Charge"],
  "Wallbox": ["Pulsar Plus", "Commander 2", "Copper SB"],
  "Tesla": ["Wall Connector Gen 3", "Wall Connector Gen 2"],
};

function toggleChargerNotes() {
  const notesRow = $("chargerNotesRow");
  const notesInput = document.querySelector('#chargerForm [name="notes"]');
  if (!notesRow || !notesInput) return;

  const brand = ($("chargerBrand")?.value || "").trim();
  const model = ($("chargerModel")?.value || "").trim();

  const needsNotes = (brand === "Anders") || (model === "Anders");
  notesRow.classList.toggle("hidden", !needsNotes);

  if (needsNotes) {
    if (!notesInput.value) notesInput.value = "Vul hier merk en model in: ";
    notesInput.required = true;
  } else {
    notesInput.required = false;
  }
}


function populateBrandModel() {
  const brandSel = $("chargerBrand");
  const modelSel = $("chargerModel");
  if (!brandSel || !modelSel) return;

  brandSel.innerHTML =
    `<option value="">Kies…</option>` +
    Object.keys(BRAND_MODELS)
      .map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`)
      .join("") +
    `<option value="Anders">Anders…</option>`;

  modelSel.innerHTML = `<option value="">Kies eerst merk…</option>`;
  modelSel.disabled = true;

  brandSel.addEventListener("change", () => {
    const brand = brandSel.value;

    if (!brand) {
      modelSel.disabled = true;
      modelSel.innerHTML = `<option value="">Kies eerst merk…</option>`;
      toggleChargerNotes();
      return;
    }

    if (brand === "Anders") {
      modelSel.disabled = true;
      modelSel.innerHTML = `<option value="">Vul merk/model later in</option>`;
      toggleChargerNotes();
      return;
    }

    const models = BRAND_MODELS[brand] || [];
    modelSel.disabled = false;
    modelSel.innerHTML =
      `<option value="">Kies…</option>` +
      models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("") +
      `<option value="Anders">Anders…</option>`;

    toggleChargerNotes();
  });

  modelSel.addEventListener("change", () => {
    toggleChargerNotes();
  });

  // init state
  toggleChargerNotes();
}







// ---------------- STATE ----------------
const urlParams = new URLSearchParams(location.search);
const dossier_id = urlParams.get("d");
const token = urlParams.get("t");

let current = null;

// ---------------- boot ----------------
document.addEventListener("DOMContentLoaded", async () => {
  if ($("year")) $("year").textContent = new Date().getFullYear();

  if (!dossier_id || !token) {
    showToast("Ongeldige dossierlink (d/t ontbreekt).", "error");
    if ($("statusPill")) {
      $("statusPill").className = "pill err";
      $("statusPill").textContent = "Ongeldige link";
    }
    return;
  }

  if ($("dossierId")) $("dossierId").textContent = dossier_id;

  populateBrandModel();

  $("btnRefresh")?.addEventListener("click", reloadAll);
  $("btnEvaluate")?.addEventListener("click", evaluateAndRender);

  $("addressForm")?.addEventListener("submit", onAddressSave);
  $("btnVerifyAddress")?.addEventListener("click", onAddressVerify);

  $("chargerForm")?.addEventListener("submit", onChargerSave);
  $("btnChargerReset")?.addEventListener("click", () => {
    $("chargerForm").reset();
    $("chargerForm").querySelector('[name="charger_id"]').value = "";
  });

  $("uploadForm")?.addEventListener("submit", onUpload);
  $("consentsForm")?.addEventListener("submit", onConsentsSave);

  await reloadAll();
  
});

// ---------------- loaders ----------------
async function reloadAll() {
  try {
    if ($("statusPill")) $("statusPill").textContent = "laden…";
    current = await apiPost("api-dossier-get", { dossier_id, token });
    renderAll();
    await evaluateAndRender();
  } catch (e) {
    console.error(e);
    showToast(e.message || "Fout bij laden", "error");
    if ($("statusPill")) {
      $("statusPill").className = "pill err";
      $("statusPill").textContent = "Fout";
    }
    if ($("statusExplain")) $("statusExplain").textContent = `Fout: ${e.message}`;
  }
}

async function evaluateAndRender() {
  try {
    await apiPost("api-dossier-evaluate", { dossier_id, token });
    current = await apiPost("api-dossier-get", { dossier_id, token });
    renderAll();
  } catch (e) {
    console.error(e);
    if ($("statusExplain")) $("statusExplain").textContent = `Status niet te herberekenen: ${e.message}`;
  }
}

// ---------------- render ----------------
function renderAll() {
  renderStatus();
  renderAccessBlock();
  renderAddressState();
  renderChargers();
  renderDocs();
  renderConsents();
}

function renderStatus() {
  const status = current?.dossier?.status || "incomplete";
  const p = pillForStatus(status);
  if ($("statusPill")) {
    $("statusPill").className = p.cls;
    $("statusPill").textContent = p.text;
  }
  if ($("statusExplain")) $("statusExplain").textContent = explainStatus(status);
}

// Jouw wens: toon email als beschikbaar, zonder “extra verificatie uitgeschakeld” vibe
function renderAccessBlock() {
  const d = current?.dossier || {};
  const email =
    d.customer_email || d.email || d.contact_email || "";

  if ($("emailState")) {
    if (email) {
      $("emailState").innerHTML = `✅ E-mail gekoppeld: <span class="mono">${escapeHtml(email)}</span>`;
    } else {
      $("emailState").textContent = "✅ Toegang bevestigd via dossierlink.";
    }
  }
}

function renderAddressState() {
  const d = current?.dossier || {};
  const f = $("addressForm");
  if (!f) return;

  f.querySelector('[name="postcode"]').value = d.address_postcode || "";
  f.querySelector('[name="house_number"]').value = d.address_house_number || "";
  f.querySelector('[name="suffix"]').value = d.address_suffix || "";

  const parts = [];
  if (d.address_postcode) parts.push(d.address_postcode);
  if (d.address_house_number) parts.push(d.address_house_number + (d.address_suffix ? d.address_suffix : ""));
  const entered = parts.length ? parts.join(" ") : "—";

  const verified = d.address_verified_at ? `✅ gecontroleerd: ${d.address_verified_at}` : "⏳ nog niet gecontroleerd";
  const resolved = (d.address_street || d.address_city) ? `→ ${d.address_street || ""} ${d.address_city || ""}` : "";

  if ($("addressState")) $("addressState").textContent = `Ingevuld: ${entered} | ${verified} ${resolved}`.trim();
}

function renderChargers() {
  const tbody = $("chargersTbody");
  if (!tbody) return;

  const chargers = current?.chargers || [];
  if (!chargers.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Nog geen laadpalen toegevoegd.</td></tr>`;
    return;
  }

  tbody.innerHTML = chargers.map((c) => `
    <tr>
      <td class="mono">${escapeHtml(c.serial_number)}</td>
      <td>${escapeHtml(c.brand || "-")}</td>
      <td>${escapeHtml(c.model || "-")}</td>
      <td class="right">
        <button class="btn outline small" type="button" data-act="del" data-id="${c.id}">Verwijder</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button[data-act='del']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!confirm("Weet je zeker dat je deze laadpaal wilt verwijderen?")) return;
      try {
        await apiPost("api-dossier-charger-delete", { dossier_id, token, charger_id: id });
        showToast("Laadpaal verwijderd.", "success");
        await reloadAll();
      } catch (e) {
        showToast(e.message, "error");
      }
    });
  });
}

function renderDocs() {
  const docs = current?.documents || [];
  if (!$("docsList")) return;

  if (!docs.length) {
    $("docsList").textContent = "Nog geen documenten geüpload.";
    return;
  }

  $("docsList").innerHTML = docs.map((d) => {
    const dt = d.doc_type || "-";
    const fn = d.filename || "-";
    const when = d.created_at || "";
    return `• ${escapeHtml(dt)} – ${escapeHtml(fn)} <span class="muted small mono">${escapeHtml(when)}</span><br/>`;
  }).join("");
}

function renderConsents() {
  const cons = current?.consents || [];
  const latest = {};
  for (const c of cons) if (!latest[c.consent_type]) latest[c.consent_type] = c;

  if ($("cTerms")) $("cTerms").checked = latest["terms"]?.accepted === true;
  if ($("cPrivacy")) $("cPrivacy").checked = latest["privacy"]?.accepted === true;
  if ($("cMandaat")) $("cMandaat").checked = latest["mandaat"]?.accepted === true;
}

// ---------------- actions ----------------
async function onAddressSave(e) {
  e.preventDefault();
  const f = e.target;
  const postcode = f.querySelector('[name="postcode"]').value.trim();
  const house_number = f.querySelector('[name="house_number"]').value.trim();
  const suffix = f.querySelector('[name="suffix"]').value.trim();

  try {
    if ($("addressState")) $("addressState").textContent = "Opslaan…";
    await apiPost("api-dossier-address-save", { dossier_id, token, postcode, house_number, suffix });
    showToast("Adres opgeslagen.", "success");
    await reloadAll();
  } catch (e2) {
    showToast(e2.message, "error");
    if ($("addressState")) $("addressState").textContent = e2.message;
  }
}

async function onAddressVerify() {
  try {
    if ($("addressState")) $("addressState").textContent = "Adres controleren…";
    await apiPost("api-dossier-address-verify", { dossier_id, token });
    showToast("Adres gecontroleerd.", "success");
    await reloadAll();
  } catch (e2) {
    showToast(e2.message, "error");
    if ($("addressState")) $("addressState").textContent = e2.message;
  }
}

async function onChargerSave(e) {
  e.preventDefault();
  const f = e.target;

  const charger_id = f.querySelector('[name="charger_id"]').value || null;
  const serial_number = (f.querySelector('[name="serial_number"]').value || "").trim();
  const brand = ($("chargerBrand")?.value || "").trim();
  let model = ($("chargerModel")?.value || "").trim();

  const notes = (f.querySelector('[name="notes"]')?.value || "").trim();

  const power_kw_raw = (f.querySelector('[name="power_kw"]').value || "").trim();
  const power_kw = power_kw_raw ? Number(power_kw_raw.replace(",", ".")) : null;

  if (!serial_number) return showToast("Serienummer is verplicht.", "error");
  if (!brand) return showToast("Kies een merk.", "error");

  // --- Anders-logica ---
  if (brand === "Anders") {
    // model mag nooit null zijn (DB constraint)
    model = "Onbekend";
    if (!notes || notes.length < 6) return showToast("Vul bij Anders merk/model in bij Toelichting.", "error");
  } else {
    if (!model) return showToast("Kies een model.", "error");
    if (model === "Anders") {
      if (!notes || notes.length < 6) return showToast("Vul bij Anders model de Toelichting in.", "error");
    }
  }

  try {
    await apiPost("api-dossier-charger-save", {
      dossier_id,
      token,
      charger_id,
      serial_number,
      brand,
      model,               // <-- nooit null
      power_kw,
      notes: (brand === "Anders" || model === "Anders") ? notes : null,
    });

    showToast("Laadpaal opgeslagen.", "success");
    f.reset();
    f.querySelector('[name="charger_id"]').value = "";
    // verberg notes weer
    toggleChargerNotes();
    await reloadAll();
  } catch (e2) {
    showToast(e2.message, "error");
  }
}


async function onConsentsSave(e) {
  e.preventDefault();
  try {
    if ($("consentsState")) $("consentsState").textContent = "Opslaan…";
    const consents = {
      terms: $("cTerms")?.checked === true,
      privacy: $("cPrivacy")?.checked === true,
      mandaat: $("cMandaat")?.checked === true,
    };
    await apiPost("api-dossier-consents-save", { dossier_id, token, consents });
    if ($("consentsState")) $("consentsState").textContent = "Opgeslagen.";
    showToast("Toestemmingen opgeslagen.", "success");
    await reloadAll();
  } catch (e2) {
    if ($("consentsState")) $("consentsState").textContent = e2.message;
    showToast(e2.message, "error");
  }
}

async function onUpload(e) {
  e.preventDefault();
  const f = e.target;
  const doc_type = f.querySelector('[name="doc_type"]').value;
  const fileInput = f.querySelector('[name="file"]');
  const file = fileInput.files && fileInput.files[0];

  if (!doc_type) return showToast("Kies documenttype.", "error");
  if (!file) return showToast("Kies bestand.", "error");

  try {
    if ($("uploadState")) $("uploadState").textContent = "Upload voorbereiden…";

    const meta = await apiPost("api-dossier-upload-url", {
      dossier_id,
      token,
      doc_type,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    });

    if ($("uploadState")) $("uploadState").textContent = "Uploaden…";
    const putRes = await fetch(meta.signed_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

    if ($("uploadState")) $("uploadState").textContent = "Geüpload.";
    showToast("Upload gelukt.", "success");
    f.reset();
    await reloadAll();
  } catch (e2) {
    if ($("uploadState")) $("uploadState").textContent = e2.message;
    showToast(e2.message, "error");
  }
}
