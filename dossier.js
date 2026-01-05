// versie 260105_12 oclock

// /dossier.js  (NON-module, gebruikt window.ENVAL uit /config.js)
//
// Doel:
// - Client-side dossier UI voor klanten (invullen stappen 1-6)
// - Communiceert met Supabase Edge Functions via window.ENVAL.API_BASE
// - Houdt rekening met "locked" status: na review zijn wijzigingen vergrendeld

console.log("DOSSIER.JS LOADED versie 260105_12 oclock");

/* ======================================================
   1) DOM + kleine helpers
   ====================================================== */
function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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

/**
 * Normaliseert persoonsnamen (simpel Title Case).
 * Bewust simpel gehouden: geen "van/der/de" uitzonderingen om edge-cases te vermijden.
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

function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Lock/unlock submit buttons (UX: voorkom double submit + toon 'Verwerken…')
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

function formatDateNL(isoLike) {
  const s = String(isoLike || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("nl-NL", {
    year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit"
  });
}

function normalizePostcodeFront(pc) {
  return String(pc || "").toUpperCase().replace(/\s+/g, "").trim();
}

/* ======================================================
   2) API helper
   - ALTIJD Idempotency-Key mee
   - 1 retry bij network errors / 502/503/504
   ====================================================== */
async function apiPost(fnName, body) {
  const url = `${window.ENVAL.API_BASE}/${fnName}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 1; attempt <= 2; attempt++) {
    const idem = newIdempotencyKey();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: window.ENVAL.edgeHeaders({ "Idempotency-Key": idem }),
        body: JSON.stringify(body),
      });

      if (attempt === 1 && (res.status === 502 || res.status === 503 || res.status === 504)) {
        await sleep(450);
        continue;
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        console.error("apiPost failed:", fnName, "status:", res.status, "json:", json);
        const msg = json?.error || json?.message || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      return json;
    } catch (e) {
      const msg = String(e?.message || e);
      const isNetwork =
        /NetworkError/i.test(msg) ||
        /Failed to fetch/i.test(msg) ||
        /fetch/i.test(msg);

      if (attempt === 1 && isNetwork) {
        await sleep(450);
        continue;
      }

      throw e;
    }
  }
}

/* ======================================================
   3) Brand/Model mapping (UI dropdowns)
   - Houdt het simpel: vaste merken + modellen
   - "Anders" vereist toelichting
   ====================================================== */
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
  notesInput.required = !!needsNotes;

  if (!needsNotes) notesInput.value = "";
}

function populateBrandModel() {
  const brandSel = $("chargerBrand");
  const modelSel = $("chargerModel");
  if (!brandSel || !modelSel) return;

  brandSel.innerHTML =
    `<option value="">Kies…</option>` +
    Object.keys(BRAND_MODELS).map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("") +
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
      modelSel.innerHTML = `<option value="Onbekend">Vul merk/model in bij Toelichting</option>`;
      modelSel.value = "Onbekend";
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

  modelSel.addEventListener("change", toggleChargerNotes);
  toggleChargerNotes();
}

/* ======================================================
   4) State (URL params + current dossier)
   ====================================================== */
const urlParams = new URLSearchParams(location.search);
const dossier_id = urlParams.get("d");
const token = urlParams.get("t");

let current = null;

// Address verify UX state (debounce + preview)
let addressVerifyTimer = null;
let addressVerifiedPreview = null; // { street, city } zodra verify ok is

function isLocked() {
  const d = current?.dossier || {};
  if (d.locked_at) return true;
  const st = String(d.status || "");
  return st === "in_review" || st === "ready_for_booking";
}

/**
 * Zet UI in locked state:
 * - disable forms/inputs
 * - hide delete buttons (data-lock-hide="1")
 * - review knop blijft zichtbaar (maar submit doet niets als locked)
 */
function setAllUiLocked(locked) {
  const banner = $("lockedBanner");
  if (banner) banner.classList.toggle("hidden", !locked);

  [
    "btnAccessSave",
    "btnAddressSave",
    "btnChargerSave",
    "btnUpload",
    "btnConsentsSave",
    "btnRefresh",
  ].forEach((id) => { if ($(id)) $(id).disabled = !!locked; });

  if ($("btnEvaluate")) $("btnEvaluate").disabled = false;

  ["accessForm","addressForm","chargerForm","uploadForm","consentsForm"].forEach((fid) => {
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

/* ======================================================
   5) Boot / Bindings
   ====================================================== */
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
  $("btnEvaluate")?.addEventListener("click", onReviewClicked);

  $("addressForm")?.addEventListener("submit", onAddressSave);
  $("accessForm")?.addEventListener("submit", onAccessSave);
  $("chargerForm")?.addEventListener("submit", onChargerSave);
  $("uploadForm")?.addEventListener("submit", onUpload);
  $("consentsForm")?.addEventListener("submit", onConsentsSave);

  // Auto-verify address (debounce) op postcode/nummer/suffix
  const af = $("addressForm");
  if (af) {
    ["postcode", "house_number", "suffix"].forEach((nm) => {
      const el = af.querySelector(`[name="${nm}"]`);
      if (el) el.addEventListener("input", onAddressInputChanged);
    });
  }

  await reloadAll();
});

/* ======================================================
   6) Loaders
   ====================================================== */
async function reloadAll() {
  try {
    if ($("statusPill")) $("statusPill").textContent = "laden…";
    current = await apiPost("api-dossier-get", { dossier_id, token });
    renderAll();
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

/* ======================================================
   7) Render (1 entrypoint -> losse render functies)
   ====================================================== */
function renderAll() {
  renderStatus();
  renderAccess();
  renderAddress();
  renderChargers();
  renderDocs();
  renderConsents();
  setAllUiLocked(isLocked());
}

function pillForStatus(status) {
  if (status === "ready_for_booking") return { cls: "pill ok", text: "Klaar voor inboeken" };
  if (status === "ready_for_review") return { cls: "pill warn", text: "Klaar voor review" };
  if (status === "in_review") return { cls: "pill warn", text: "In review" };
  return { cls: "pill", text: "Onvolledig" };
}

function explainStatus(status) {
  if (status === "ready_for_booking") return "Alles is compleet. Dit dossier kan door naar inboeken.";
  if (status === "ready_for_review") return "Alles lijkt compleet, maar moet nog gecontroleerd worden (review).";
  if (status === "in_review") {
    return "Dit dossier staat op review. Je hoeft niets te doen. Je kunt dit scherm nu sluiten. Wij houden je op de hoogte via het opgegeven e-mailadres.";
  }
  return "Er ontbreken nog onderdelen. Vul de stappen hierboven in.";
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

/**
 * Stap 1: Toegang
 * - Form prefill (voornaam/achternaam/telefoon/count/own)
 * - Overzicht toont naam + email + etc (en lijnt met stap 2)
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
  const lastNice  = normalizePersonName(last);

  const f = $("accessForm");
  if (f) {
    f.querySelector('[name="first_name"]').value = firstNice || "";
    f.querySelector('[name="last_name"]').value  = lastNice || "";

    const inPhone = f.querySelector('[name="customer_phone"]');
    const inCount = f.querySelector('[name="charger_count"]');
    const inOwn   = f.querySelector('[name="own_premises"]');

    if (inPhone) inPhone.value = d.customer_phone || "";
    if (inCount) inCount.value = d.charger_count ? String(d.charger_count) : "";
    if (inOwn) inOwn.value = d.own_premises === true ? "ja" : (d.own_premises === false ? "nee" : "");
  }

  const ownTxt   = d.own_premises === true ? "Ja" : (d.own_premises === false ? "Nee" : "—");
  const phoneTxt = d.customer_phone ? escapeHtml(d.customer_phone) : "—";
  const cntTxt   = d.charger_count ? String(d.charger_count) : "—";

  if ($("accessSummary")) {
    const emailTxt = email ? escapeHtml(email) : "—";
    const naamTxt  = `${firstNice || ""} ${lastNice || ""}`.trim() || "—";

    $("accessSummary").innerHTML =
      `<b>Overzicht</b><br/>` +
      `Naam: <b>${escapeHtml(naamTxt)}</b><br/>` +
      `E-mail: <b>${emailTxt}</b><br/>` +
      `Aantal laadpunten: <b>${escapeHtml(cntTxt)}</b><br/>` +
      `Op eigen terrein: <b>${escapeHtml(ownTxt)}</b><br/>` +
      `Mobiel: <b>${phoneTxt}</b>`;
  }

  if ($("accessState")) {
    $("accessState").textContent = d.locked_at ? `Vergrendeld sinds: ${formatDateNL(d.locked_at)}` : "";
  }
}

/* ===== Stap 2: Adres helpers ===== */
function setAddressPreview(street, city) {
  const f = $("addressForm");
  if (!f) return;
  f.querySelector('[name="street_ro"]').value = street || "";
  f.querySelector('[name="city_ro"]').value   = city || "";
}

function setAddressSaveEnabled(enabled) {
  const btn = $("btnAddressSave");
  if (btn) btn.disabled = !enabled;
}

function clearAddressPreview() {
  addressVerifiedPreview = null;
  setAddressPreview("", "");
  setAddressSaveEnabled(false);
}

/**
 * Stap 2: Adres
 * - Form prefill postcode/nummer/suffix
 * - Overzicht box onderaan (incl. verified_at)
 * - Geen losse statusregel (jouw wens) -> audit info staat in overzicht
 */
function renderAddress() {
  const d = current?.dossier || {};
  const f = $("addressForm");
  if (!f) return;

  const pc   = d.address_postcode || "";
  const hn   = d.address_house_number || "";
  const suf  = d.address_suffix || "";
  const street = d.address_street || "";
  const city   = d.address_city || "";

  f.querySelector('[name="postcode"]').value      = pc;
  f.querySelector('[name="house_number"]').value  = hn;
  f.querySelector('[name="suffix"]').value        = suf;

  setAddressPreview(street, city);

  // Save enabled:
  // - als verified_at al bestaat -> save mag (mits niet locked)
  // - anders: alleen als we een preview hebben via verify
  if (d.address_verified_at) {
    setAddressSaveEnabled(!isLocked());
  } else {
    setAddressSaveEnabled(!!addressVerifiedPreview && !isLocked());
  }

  // Overzicht box
  const sum = $("addressSummary");
  if (sum) {
    const pcTxt     = pc ? escapeHtml(pc) : "—";
    const streetTxt = street ? escapeHtml(street) : "—";
    const cityTxt   = city ? escapeHtml(city) : "—";
    const nrTxt     = hn ? `${hn}${suf ? " " + String(suf).trim() : ""}` : "—";
    const checkedTxt = d.address_verified_at ? formatDateNL(d.address_verified_at) : "";

    sum.innerHTML =
      `<b>Overzicht</b><br/>` +
      `Straat: <b>${streetTxt}</b><br/>` +
      `Nummer: <b>${escapeHtml(nrTxt)}</b><br/>` +
      `Postcode: <b>${pcTxt}</b><br/>` +
      `Stad: <b>${cityTxt}</b>` +
      (checkedTxt ? `<br/><span class="muted small">Gecontroleerd op: ${escapeHtml(checkedTxt)}</span>` : "");
  }

  // We gebruiken addressState niet meer (bewust hidden in HTML)
  if ($("addressState")) $("addressState").textContent = "";
}

/**
 * Address auto-verify (debounce)
 * - Verifieert postcode + huisnummer (+ suffix) via edge function
 * - Toont straat/plaats als readonly preview
 * - Enable opslaan zodra verify ok is
 */
function onAddressInputChanged() {
  clearAddressPreview();

  if (addressVerifyTimer) clearTimeout(addressVerifyTimer);
  addressVerifyTimer = setTimeout(async () => {
    const f = $("addressForm");
    if (!f) return;

    const postcode     = normalizePostcodeFront(f.querySelector('[name="postcode"]').value);
    const house_number = (f.querySelector('[name="house_number"]').value || "").trim();
    const suffix       = (f.querySelector('[name="suffix"]').value || "").trim();

    if (!/^[0-9]{4}[A-Z]{2}$/.test(postcode)) return;
    if (!/^[1-9][0-9]{0,4}$/.test(house_number)) return;

    try {
      const r = await apiPost("api-dossier-address-verify", {
        dossier_id, token, postcode, house_number, suffix,
      });

      const street = r.street || "";
      const city   = r.city || "";
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
 * Stap 3: Chargers
 * - Hint toont compleet / te veel / nog te doen
 * - Save button disabled zodra required count bereikt is
 */
function renderChargers() {
  const tbody = $("chargersTbody");
  if (!tbody) return;

  const d = current?.dossier || {};
  const required = Number(d.charger_count || 0) || 0;

  const chargers = current?.chargers || [];
  const have = chargers.length;

  const remaining = required > 0 ? Math.max(0, required - have) : 0;
  const over = required > 0 ? Math.max(0, have - required) : 0;

  if ($("chargerHint")) {
    if (required > 0) {
      if (remaining === 0 && over === 0) {
        $("chargerHint").innerHTML = `<span class="ok"><b>Compleet:</b></span> ${have}/${required} laadpalen ingevoerd.`;
      } else if (remaining === 0 && over > 0) {
        $("chargerHint").innerHTML = `<span class="danger"><b>Te veel laadpalen:</b></span> ${have}/${required}. Verwijder ${over} laadpaal(en).`;
      } else {
        $("chargerHint").innerHTML = `<b>Nog te doen:</b> ${remaining} laadpaal(en). (${have}/${required})`;
      }
    } else {
      $("chargerHint").textContent = "Voeg minimaal 1 laadpaal toe.";
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
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Nog geen laadpalen toegevoegd.</td></tr>`;
    return;
  }

  tbody.innerHTML = chargers.map((c) => `
    <tr>
      <td class="mono">${escapeHtml(c.serial_number)}</td>
      <td>${escapeHtml(c.brand || "-")}</td>
      <td>${escapeHtml(c.model || "-")}</td>
      <td>${escapeHtml(c.notes || "-")}</td>
      <td class="right">
        <div class="btnstack">
          <button class="btn outline small ${locked ? "hidden" : ""}" data-lock-hide="1"
            type="button" data-act="del" data-id="${c.id}">Verwijder</button>
        </div>
      </td>
    </tr>
  `).join("");

  if (locked) return;

  tbody.querySelectorAll("button[data-act='del']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!confirm("Weet je zeker dat je deze laadpaal wilt verwijderen?")) return;

      try {
        btn.disabled = true;
        await apiPost("api-dossier-charger-delete", { dossier_id, token, charger_id: id });
        showToast("Laadpaal verwijderd.", "success");
        await reloadAll();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

/**
 * Stap 4: Documenten
 * - Vul hint + status per laadpaal (factuur/foto counts)
 * - Table truncation alleen op filename (CSS .td-filename)
 */
function renderDocs() {
  const docs = current?.documents || [];
  const tbody = $("docsTbody");
  if (!tbody) return;

  const locked = isLocked();

  const hint = $("docsHint");
  if (hint) hint.textContent = "Per laadpaal: minimaal 1 factuur installatie + 1 foto van het laadpunt.";

  const chargers = current?.chargers || [];
  const chargerById = {};
  chargers.forEach((c) => { chargerById[String(c.id)] = c; });

  // Charger dropdown
  const sel = $("docChargerId");
  if (sel) {
    sel.innerHTML =
      `<option value="">Kies laadpaal…</option>` +
      chargers.map((c) => {
        const id = String(c.id);
        const sn = c.serial_number ? String(c.serial_number) : "—";
        const b  = c.brand ? String(c.brand) : "";
        const m  = c.model ? String(c.model) : "";
        const label = `${sn} — ${b} ${m}`.trim();
        return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
      }).join("");

    sel.disabled = !!locked || chargers.length === 0;
  }

  // Status per laadpaal
  const needHint = $("docChargerHint");
  if (needHint) {
    if (!chargers.length) {
      needHint.textContent = "Voeg eerst laadpalen toe in stap 3.";
    } else {
      const per = {};
      chargers.forEach((c) => {
        per[String(c.id)] = { factuur: 0, foto_laadpunt: 0 };
      });

      docs.forEach((x) => {
        const dt = String(x.doc_type || "").toLowerCase();
        const chId = x.charger_id ? String(x.charger_id) : "";
        if (!chId || !per[chId]) return;
        if (dt === "factuur") per[chId].factuur += 1;
        if (dt === "foto_laadpunt") per[chId].foto_laadpunt += 1;
      });

      const lines = chargers.map((c) => {
        const chId = String(c.id);
        const sn = c.serial_number ? String(c.serial_number) : "—";
        const p = per[chId] || { factuur: 0, foto_laadpunt: 0 };
        const okF = p.factuur >= 1;
        const okP = p.foto_laadpunt >= 1;
        return `• ${sn}: facturen ${p.factuur} ${okF ? "✅" : "⏳"} / foto's ${p.foto_laadpunt} ${okP ? "✅" : "⏳"}`;
      });

      needHint.innerHTML = `<b>Status per laadpaal</b><br/>` + lines.map(escapeHtml).join("<br/>");
    }
  }

  if (!docs.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Nog geen documenten geüpload.</td></tr>`;
    return;
  }

  tbody.innerHTML = docs.map((x) => {
    const typeLabel = String(x.doc_type || "-");
    const when = x.created_at ? formatDateNL(x.created_at) : "-";
    const filename = x.filename || "-";

    const chId = x.charger_id ? String(x.charger_id) : "";
    const ch = chId ? chargerById[chId] : null;

    const dt = typeLabel.toLowerCase();
    const chargerLabel = ch
      ? `${ch.serial_number || "—"}`
      : (dt === "factuur" || dt === "foto_laadpunt" ? "— (niet gekoppeld)" : "—");

    return `
      <tr>
        <td>${escapeHtml(typeLabel)}</td>
        <td class="mono">${escapeHtml(chargerLabel)}</td>
        <td class="td-filename">${escapeHtml(filename)}</td>
        <td class="small muted">${escapeHtml(when)}</td>
        <td class="right">
          <div class="btnstack">
            <button class="btn outline small" type="button" data-act="open" data-id="${x.id}">Open</button>
            <button class="btn outline small ${locked ? "hidden" : ""}" data-lock-hide="1"
              type="button" data-act="del" data-id="${x.id}">Verwijder</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Open
  tbody.querySelectorAll("button[data-act='open']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      try {
        btn.disabled = true;
        const r = await apiPost("api-dossier-doc-download-url", { dossier_id, token, document_id: id });
        if (!r?.signed_url) throw new Error("Geen signed_url ontvangen.");
        window.open(r.signed_url, "_blank", "noopener");
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  if (locked) return;

  // Delete
  tbody.querySelectorAll("button[data-act='del']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!confirm("Weet je zeker dat je dit document wilt verwijderen?")) return;

      try {
        btn.disabled = true;
        await apiPost("api-dossier-doc-delete", { dossier_id, token, document_id: id });
        showToast("Document verwijderd.", "success");
        await reloadAll();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

/**
 * Stap 5: Toestemmingen
 * - Render laatste status
 * - Opslaan vereist alle 3 vinkjes (UI consistent)
 */
function renderConsents() {
  const cons = current?.consents || [];
  const latest = {};
  for (const c of cons) if (!latest[c.consent_type]) latest[c.consent_type] = c;

  if ($("cTerms")) $("cTerms").checked = latest["terms"]?.accepted === true;
  if ($("cPrivacy")) $("cPrivacy").checked = latest["privacy"]?.accepted === true;
  if ($("cMandaat")) $("cMandaat").checked = latest["mandaat"]?.accepted === true;

  const ts =
    latest["terms"]?.accepted_at ||
    latest["privacy"]?.accepted_at ||
    latest["mandaat"]?.accepted_at ||
    "";

  if ($("consentsStamp")) $("consentsStamp").textContent = ts ? `Laatst opgeslagen: ${formatDateNL(ts)}` : "";
}

/* ======================================================
   8) Actions (submit handlers)
   ====================================================== */

/**
 * Stap 1 opslaan
 * - stuurt ALLES mee naar edge endpoint
 * - fallback naar update endpoint (veiligheid)
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

  const charger_count_raw = (f.querySelector('[name="charger_count"]')?.value || "").trim();
  const charger_count = charger_count_raw ? Number(charger_count_raw) : null;

  const own_raw = (f.querySelector('[name="own_premises"]')?.value || "").trim().toLowerCase();
  const own_premises =
    own_raw === "ja" ? true :
    own_raw === "nee" ? false :
    null;

  if (!first_name) return showToast("Voornaam is verplicht.", "error");
  if (!last_name) return showToast("Achternaam is verplicht.", "error");
  if (!charger_count || !Number.isFinite(charger_count) || charger_count < 1) {
    return showToast("Kies het aantal laadpunten.", "error");
  }
  if (own_premises === null) return showToast("Kies of het op eigen terrein is.", "error");

  lockSubmit(btn, true, "Opslaan…");

  try {
    try {
      await apiPost("api-dossier-access-save", {
        dossier_id, token,
        first_name, last_name,
        customer_phone: customer_phone || null,
        charger_count,
        own_premises,
      });
    } catch (e1) {
      await apiPost("api-dossier-access-update", {
        dossier_id, token,
        first_name, last_name,
        customer_phone: customer_phone || null,
        charger_count,
        own_premises,
      });
    }

    // zet normalized terug in UI
    f.querySelector('[name="first_name"]').value = first_name;
    f.querySelector('[name="last_name"]').value = last_name;

    showToast("Opgeslagen.", "success");
    await reloadAll();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Opslaan mislukt.", "error");
  } finally {
    lockSubmit(btn, false, "Opslaan");
  }
}

/**
 * Stap 2 opslaan
 * - vereist dat verify al is gelopen (addressVerifiedPreview) óf address_verified_at al gezet is
 */
async function onAddressSave(e) {
  e.preventDefault();
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  const f = e.target;
  const btn = $("btnAddressSave");
  if (btn?.disabled) return;

  const postcode = (f.querySelector('[name="postcode"]').value || "").trim();
  const house_number = (f.querySelector('[name="house_number"]').value || "").trim();
  const suffix = (f.querySelector('[name="suffix"]').value || "").trim();

  const d = current?.dossier || {};
  if (!d.address_verified_at && !addressVerifiedPreview) {
    showToast("Controleer eerst het adres (automatisch) voordat je opslaat.", "error");
    return;
  }

  lockSubmit(btn, true, "Opslaan…");

  try {
    await apiPost("api-dossier-address-save", { dossier_id, token, postcode, house_number, suffix });
    showToast("Adres opgeslagen.", "success");
    await reloadAll();
  } catch (e2) {
    showToast(e2.message, "error");
  } finally {
    lockSubmit(btn, false, "Opslaan");
  }
}

/**
 * Stap 3 opslaan
 * - valideert "Anders" cases (notes verplicht)
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
    const serial_number = (f.querySelector('[name="serial_number"]').value || "").trim();
    const brand = ($("chargerBrand")?.value || "").trim();
    let model = ($("chargerModel")?.value || "").trim();

    const notes = (f.querySelector('[name="notes"]')?.value || "").trim();
    const power_kw_raw = (f.querySelector('[name="power_kw"]').value || "").trim();
    const power_kw = power_kw_raw ? Number(power_kw_raw.replace(",", ".")) : null;

    if (!serial_number) return showToast("Serienummer is verplicht.", "error");
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

    await apiPost("api-dossier-charger-save", {
      dossier_id, token,
      charger_id,
      serial_number,
      brand,
      model,
      power_kw,
      notes: (brand === "Anders" || model === "Anders") ? notes : null,
    });

    showToast("Laadpaal opgeslagen.", "success");
    f.reset();
    f.querySelector('[name="charger_id"]').value = "";
    toggleChargerNotes();
    await reloadAll();
  } catch (e2) {
    showToast(e2.message, "error");
  } finally {
    lockSubmit(btn, false, "Opslaan");
  }
}

/**
 * Stap 4 upload
 * - vraagt signed PUT URL + upload file + reload
 * - laadt alleen allowlisted types
 */
async function onUpload(e) {
  e.preventDefault();
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  const f = e.target;
  const btn = $("btnUpload");
  if (btn?.disabled) return;

  const doc_type = f.querySelector('[name="doc_type"]').value;
  const charger_id = (f.querySelector('[name="charger_id"]')?.value || "").trim();

  const fileInput = f.querySelector('[name="file"]');
  const file = fileInput.files && fileInput.files[0];

  if (!doc_type) return showToast("Kies documenttype.", "error");

  const dt = String(doc_type || "").toLowerCase();
  if ((dt === "factuur" || dt === "foto_laadpunt") && !charger_id) {
    return showToast("Kies eerst voor welke laadpaal dit document is.", "error");
  }

  if (!file) return showToast("Kies bestand.", "error");

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

  if (!allowedExt.has(ext)) return showToast("Ongeldig bestandstype. Alleen: PDF, PNG, JPG/JPEG, DOC, DOCX.", "error");
  if (mime && !allowedMime.has(mime)) return showToast("Ongeldig bestandstype. Alleen: PDF, PNG, JPG/JPEG, DOC, DOCX.", "error");

  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) return showToast("Bestand is te groot. Max 15MB.", "error");

  lockSubmit(btn, true, "Uploaden…");

  try {
    if ($("uploadState")) $("uploadState").textContent = "Upload voorbereiden…";

    const meta = await apiPost("api-dossier-upload-url", {
      dossier_id,
      token,
      doc_type,
      charger_id: charger_id || null,
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
  } finally {
    lockSubmit(btn, false, "Upload");
  }
}

/**
 * Stap 5 save consents
 * - alle 3 verplicht
 */
async function onConsentsSave(e) {
  e.preventDefault();
  if (isLocked()) return showToast("Dossier is vergrendeld.", "error");

  const btn = $("btnConsentsSave");
  if (btn?.disabled) return;

  const terms   = $("cTerms")?.checked === true;
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
    await apiPost("api-dossier-consents-save", { dossier_id, token, consents: { terms, privacy, mandaat } });
    if ($("consentsState")) $("consentsState").textContent = "Opgeslagen.";
    showToast("Toestemmingen opgeslagen.", "success");
    await reloadAll();
  } catch (e2) {
    if ($("consentsState")) $("consentsState").textContent = e2.message;
    showToast(e2.message, "error");
  } finally {
    lockSubmit(btn, false, "Opslaan");
  }
}

/**
 * Stap 6 Review / Evaluate
 * - gebruikt RAW fetch zodat we missingSteps kunnen tonen bij niet-ok
 * - bij success moet locked_at terugkomen
 */
async function onReviewClicked() {
  const btn = $("btnEvaluate");
  if (!btn) return;

  const d = current?.dossier || {};
  if (d.locked_at || String(d.status || "") === "in_review" || String(d.status || "") === "ready_for_booking") {
    showToast("Dit dossier is al ingediend.", "success");
    return;
  }

  const okConfirm = confirm("Klopt alle informatie? Na doorgaan kunt u niets meer veranderen.\n\nDoorgaan?");
  if (!okConfirm) return;

  lockSubmit(btn, true, "Reviewen…");

  try {
    if ($("reviewState")) $("reviewState").textContent = "Server controleert dossier…";

    const idem = newIdempotencyKey();
    const res = await fetch(`${window.ENVAL.API_BASE}/api-dossier-evaluate`, {
      method: "POST",
      headers: window.ENVAL.edgeHeaders({ "Idempotency-Key": idem }),
      body: JSON.stringify({ dossier_id, token, finalize: true }),
    });

    const js = await res.json().catch(() => ({}));

    if (!res.ok || !js.ok) {
      const missing = Array.isArray(js?.missingSteps) ? js.missingSteps : [];
      const msg = js?.error || js?.message || `Review failed (${res.status})`;

      if ($("reviewState")) {
        if (missing.length) {
          $("reviewState").innerHTML =
            `<div class="danger"><b>Er ontbreken nog onderdelen.</b></div>` +
            `<div class="small">Vul deze stappen in:</div>` +
            `<ul class="missing-list">` +
            missing.map((x) => `<li class="danger">${escapeHtml(x)}</li>`).join("") +
            `</ul>`;
        } else {
          $("reviewState").textContent = msg;
        }
      }

      showToast(missing.length ? "Dossier is nog niet compleet." : msg, "error");
      return;
    }

    if (!js.locked_at) {
      if ($("reviewState")) $("reviewState").textContent =
        "Review lijkt gelukt, maar dossier is niet vergrendeld. Probeer opnieuw.";
      showToast("Review fout: dossier is niet vergrendeld.", "error");
      return;
    }

    showToast("Dossier ingediend. Staat nu in review.", "success");
    if ($("reviewState")) $("reviewState").textContent = `In review sinds: ${formatDateNL(js.locked_at)}`;
    await reloadAll();
  } catch (e) {
    showToast(e.message, "error");
    if ($("reviewState")) $("reviewState").textContent = e.message;
  } finally {
    lockSubmit(btn, false, "Review dossier");
  }
}
