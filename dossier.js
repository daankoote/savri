// /dossier.js
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function showToast(message, type = "success") {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const div = document.createElement("div");
    div.className = `toast toast--${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4200);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function apiPost(fnName, body) {
    const res = await fetch(`${window.ENVAL.API_BASE}/${fnName}`, {
      method: "POST",
      headers: window.ENVAL.edgeHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      console.error("apiPost failed:", fnName, res.status, json);
      throw new Error(json?.error || json?.message || `Request failed (${res.status})`);
    }
    return json;
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
    if (status === "in_review") return "Dit dossier staat op review. Je hoeft niets te doen tenzij er extra info wordt gevraagd.";
    return "Er ontbreken nog onderdelen. Vul de stappen hierboven in.";
  }

  const BRAND_MODELS = {
    Alfen: ["Eve Single", "Eve Single Pro-line", "Eve Double", "Overig"],
    Zaptec: ["Go", "Pro", "Overig"],
    Wallbox: ["Pulsar Plus", "Commander 2", "Copper SB", "Overig"],
    EVBox: ["Elvi", "BusinessLine", "Livo", "Overig"],
    Easee: ["Home", "Charge", "Overig"],
    Tesla: ["Wall Connector Gen 3", "Wall Connector Gen 2", "Overig"],
    Overig: ["Overig"],
  };

  function fillBrandOptions(selectEl) {
    const brands = Object.keys(BRAND_MODELS);
    selectEl.innerHTML =
      `<option value="">Kies merk…</option>` +
      brands.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  }

  function fillModelOptions(selectEl, brand, selected = "") {
    const models = BRAND_MODELS[brand] || [];
    selectEl.innerHTML =
      `<option value="">Kies model…</option>` +
      models.map((m) => {
        const sel = m === selected ? " selected" : "";
        return `<option value="${escapeHtml(m)}"${sel}>${escapeHtml(m)}</option>`;
      }).join("");
  }

  const urlParams = new URLSearchParams(location.search);
  const dossier_id = urlParams.get("d");
  const token = urlParams.get("t");
  let current = null;

  document.addEventListener("DOMContentLoaded", async () => {
    $("year").textContent = new Date().getFullYear();

    // harde sanity checks
    if (!window.ENVAL?.SUPABASE_ANON_KEY) {
      showToast("config.js is niet geladen (ENVAL config ontbreekt)", "error");
      return;
    }
    if (window.ENVAL.debugAnonIss && window.ENVAL.debugAnonIss() !== "supabase") {
      showToast("Anon key lijkt fout (iss != supabase). Check config.js", "error");
      return;
    }

    if (!dossier_id || !token) {
      showToast("Ongeldige dossierlink (d/t ontbreekt).", "error");
      $("statusPill").className = "pill err";
      $("statusPill").textContent = "Ongeldige link";
      return;
    }

    $("dossierId").textContent = dossier_id;

    // dropdown init
    fillBrandOptions($("chargerBrand"));
    fillModelOptions($("chargerModel"), "", "");
    $("chargerBrand").addEventListener("change", () => {
      fillModelOptions($("chargerModel"), $("chargerBrand").value, "");
    });

    $("btnRefresh").addEventListener("click", () => reloadAll());
    $("btnEvaluate").addEventListener("click", () => evaluateAndRender());

    $("addressForm").addEventListener("submit", onAddressSave);
    $("btnVerifyAddress").addEventListener("click", onAddressVerify);

    $("chargerForm").addEventListener("submit", onChargerSave);
    $("btnChargerReset").addEventListener("click", () => {
      $("chargerForm").reset();
      $("chargerForm").querySelector('[name="charger_id"]').value = "";
      fillModelOptions($("chargerModel"), $("chargerBrand").value, "");
    });

    $("uploadForm").addEventListener("submit", onUpload);
    $("consentsForm").addEventListener("submit", onConsentsSave);

    await reloadAll();
  });

  async function reloadAll() {
    try {
      $("statusPill").textContent = "laden…";
      current = await apiPost("api-dossier-get", { dossier_id, token });
      renderAll();
      await evaluateAndRender();
    } catch (e) {
      showToast(e.message, "error");
      $("statusPill").className = "pill err";
      $("statusPill").textContent = "Fout";
      $("statusExplain").textContent = `Fout: ${e.message}`;
    }
  }

  async function evaluateAndRender() {
    try {
      await apiPost("api-dossier-evaluate", { dossier_id, token });
      current = await apiPost("api-dossier-get", { dossier_id, token });
      renderAll();
    } catch (e) {
      renderStatus();
      $("statusExplain").textContent = `Status niet te herberekenen: ${e.message}`;
    }
  }

  function renderAll() {
    renderStatus();
    renderAccess();
    renderAddress();
    renderChargers();
    renderDocs();
    renderConsents();
  }

  function renderStatus() {
    const status = current?.dossier?.status || "incomplete";
    const p = pillForStatus(status);
    $("statusPill").className = p.cls;
    $("statusPill").textContent = p.text;
    $("statusExplain").textContent = explainStatus(status);
  }

  function renderAccess() {
    $("emailState").innerHTML = `✅ Toegang bevestigd via dossierlink <span class="mono">(d=${escapeHtml(dossier_id)})</span>`;
  }

  function renderAddress() {
    const d = current?.dossier || {};
    const entered = [d.address_postcode, d.address_house_number ? (d.address_house_number + (d.address_suffix || "")) : ""]
      .filter(Boolean)
      .join(" ") || "—";

    const verified = d.address_verified_at ? `✅ gecontroleerd: ${d.address_verified_at}` : "⏳ nog niet gecontroleerd";
    $("addressState").textContent = `Ingevuld: ${entered} | ${verified}`.trim();

    const f = $("addressForm");
    f.querySelector('[name="postcode"]').value = d.address_postcode || "";
    f.querySelector('[name="house_number"]').value = d.address_house_number || "";
    f.querySelector('[name="suffix"]').value = d.address_suffix || "";
  }

  function renderChargers() {
    const tbody = $("chargersTbody");
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
    if (!docs.length) {
      $("docsList").textContent = "Nog geen documenten geüpload.";
      return;
    }
    $("docsList").innerHTML = docs.map((d) =>
      `• ${escapeHtml(d.doc_type || "-")} – ${escapeHtml(d.filename || "-")} <span class="muted small mono">${escapeHtml(d.created_at || "")}</span><br/>`
    ).join("");
  }

  function renderConsents() {
    const cons = current?.consents || [];
    const latest = {};
    for (const c of cons) if (!latest[c.consent_type]) latest[c.consent_type] = c;
    $("cTerms").checked = latest["terms"]?.accepted === true;
    $("cPrivacy").checked = latest["privacy"]?.accepted === true;
    $("cMandaat").checked = latest["mandaat"]?.accepted === true;
  }

  async function onAddressSave(e) {
    e.preventDefault();
    const f = e.target;
    const postcode = f.querySelector('[name="postcode"]').value.trim();
    const house_number = f.querySelector('[name="house_number"]').value.trim();
    const suffix = f.querySelector('[name="suffix"]').value.trim();

    try {
      $("addressState").textContent = "Opslaan…";
      await apiPost("api-dossier-address-save", { dossier_id, token, postcode, house_number, suffix });
      showToast("Adres opgeslagen.", "success");
      await reloadAll();
    } catch (e2) {
      $("addressState").textContent = e2.message;
      showToast(e2.message, "error");
    }
  }

  async function onAddressVerify() {
    try {
      $("addressState").textContent = "Adres controleren…";
      await apiPost("api-dossier-address-verify", { dossier_id, token });
      showToast("Adres gecontroleerd.", "success");
      await reloadAll();
    } catch (e2) {
      $("addressState").textContent = e2.message;
      showToast(e2.message, "error");
    }
  }

  async function onChargerSave(e) {
    e.preventDefault();
    const f = e.target;

    const serial_number = (f.querySelector('[name="serial_number"]').value || "").trim();
    const brand = ($("chargerBrand").value || "").trim();
    const model = ($("chargerModel").value || "").trim();
    const power_kw_raw = (f.querySelector('[name="power_kw"]').value || "").trim();
    const power_kw = power_kw_raw ? Number(power_kw_raw.replace(",", ".")) : null;

    if (!serial_number) return showToast("Serienummer is verplicht.", "error");
    if (!brand) return showToast("Kies merk.", "error");
    if (!model) return showToast("Kies model.", "error");

    try {
      await apiPost("api-dossier-charger-save", { dossier_id, token, serial_number, brand, model, power_kw });
      showToast("Laadpaal opgeslagen.", "success");
      f.reset();
      fillModelOptions($("chargerModel"), $("chargerBrand").value, "");
      await reloadAll();
    } catch (e2) {
      showToast(e2.message, "error");
    }
  }

  async function onConsentsSave(e) {
    e.preventDefault();
    try {
      $("consentsState").textContent = "Opslaan…";
      const consents = {
        terms: $("cTerms").checked,
        privacy: $("cPrivacy").checked,
        mandaat: $("cMandaat").checked,
      };
      await apiPost("api-dossier-consents-save", { dossier_id, token, consents });
      $("consentsState").textContent = "Opgeslagen.";
      showToast("Toestemmingen opgeslagen.", "success");
      await reloadAll();
    } catch (e2) {
      $("consentsState").textContent = e2.message;
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
      $("uploadState").textContent = "Upload voorbereiden…";
      const meta = await apiPost("api-dossier-upload-url", {
        dossier_id,
        token,
        doc_type,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });

      $("uploadState").textContent = "Uploaden…";
      const putRes = await fetch(meta.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      $("uploadState").textContent = "Geüpload.";
      showToast("Upload gelukt.", "success");
      f.reset();
      await reloadAll();
    } catch (e2) {
      $("uploadState").textContent = e2.message;
      showToast(e2.message, "error");
    }
  }
})();
