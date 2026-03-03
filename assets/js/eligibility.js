// /assets/js/eligibility.js
console.log("ENVAL eligibility.js v260223");

function showFieldError(field, message) {
  if (!field) return;
  field.classList.add("input-error");

  const parent = field.closest("label") || field.parentElement || field;
  const existing = parent.querySelector(".field-error");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = "field-error";
  el.textContent = message || "Maak een keuze.";
  parent.appendChild(el);
}

function clearFieldError(field) {
  if (!field) return;
  field.classList.remove("input-error");

  const parent = field.closest("label") || field.parentElement || field;
  const existing = parent.querySelector(".field-error");
  if (existing) existing.remove();
}

function clearAllErrors(form) {
  if (!form) return;
  form.querySelectorAll("select, input, textarea").forEach(clearFieldError);
}

function chargerLabelFromValue(v) {
  if (v === "1") return "1 laadpunt";
  if (v === "2") return "2 laadpunten";
  if (v === "3") return "3 laadpunten";
  if (v === "4") return "4 laadpunten";
  if (v === "5plus") return "Meer dan 4 laadpunten";
  return "Aantal laadpunten";
}

function markHtml(kind) {
  // kind: ok | bad | maybe
  const map = { ok: "✓", bad: "×", maybe: "!" };
  const cls = kind === "ok" ? "ok" : (kind === "maybe" ? "maybe" : "bad");
  return `<span class="result-mark ${cls}">${map[kind] || "•"}</span>`;
}

function resultTitle(status) {
  if (status === "ok") return "U voldoet aan de voorwaarden";
  if (status === "maybe") return "Dit kan wellicht wel, maar valt buiten de standaardvoorwaarden. Neem contact op.";
  return "U voldoet niet aan de voorwaarden";
}

function resultClass(status) {
  if (status === "ok") return "result result--ok";
  if (status === "maybe") return "result result--maybe";
  return "result result--bad";
}

function buildChecklist({ countVal, ownVal, nlVal, midVal }) {
  const items = [];

  // Aantal laadpunten
  if (countVal === "5plus") {
    items.push({ label: chargerLabelFromValue(countVal), kind: "maybe" });
  } else if (["1", "2", "3", "4"].includes(countVal)) {
    items.push({ label: chargerLabelFromValue(countVal), kind: "ok" });
  } else {
    items.push({ label: "Aantal laadpunten", kind: "bad" });
  }

  // Eigen terrein
  items.push({
    label: ownVal === "ja"
      ? "Staat op eigen terrein"
      : 'Staat <b>niet</b> op eigen terrein',
    kind: ownVal === "ja" ? "ok" : "bad",
  });

  // NL
  items.push({
    label: nlVal === "ja"
      ? "Staat in Nederland"
      : 'Staat <b>niet</b> in Nederland',
    kind: nlVal === "ja" ? "ok" : "bad",
  });

  // MID
  items.push({
    label: midVal === "ja"
      ? "Heeft een MID-meter"
      : 'Heeft <b>geen</b> MID-meter',
    kind: midVal === "ja" ? "ok" : "bad",
  });

  const html =
    `<ul class="result-list">` +
    items
      .map((it) => `<li>${markHtml(it.kind)} <span>${it.label}</span></li>`)
      .join("") +
    `</ul>`;

  return { items, html };
}

function decideStatus({ countVal, ownVal, nlVal, midVal }) {
  const allYes = ownVal === "ja" && nlVal === "ja" && midVal === "ja";

  // Meer dan 4 laadpunten:
  // - als rest JA => misschien (contact)
  // - anders => niet
  if (countVal === "5plus") {
    return allYes ? "maybe" : "bad";
  }

  // 1..4:
  if (["1", "2", "3", "4"].includes(countVal)) {
    return allYes ? "ok" : "bad";
  }

  // missing count
  return "bad";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("eligibilityForm");
  const result = document.getElementById("eligibilityResult");

  if (!form || !result) return;

  // Clear errors on change (snappy UX)
  form.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", () => clearFieldError(sel));
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearAllErrors(form);

    const count = document.getElementById("eligChargerCount");
    const own = document.getElementById("eligOwnPremises");
    const nl = document.getElementById("eligInNl");
    const mid = document.getElementById("eligHasMid");

    const countVal = (count?.value || "").trim();
    const ownVal = (own?.value || "").trim();
    const nlVal = (nl?.value || "").trim();
    const midVal = (mid?.value || "").trim();

    let hasMissing = false;

    if (!countVal) { showFieldError(count, "Maak een keuze."); hasMissing = true; }
    if (!ownVal) { showFieldError(own, "Maak een keuze."); hasMissing = true; }
    if (!nlVal) { showFieldError(nl, "Maak een keuze."); hasMissing = true; }
    if (!midVal) { showFieldError(mid, "Maak een keuze."); hasMissing = true; }

    // Als er missing is: geen “u komt mogelijk niet in aanmerking” onzin.
    // Gewoon: errors tonen en result verbergen.
    if (hasMissing) {
      result.className = "result result--neutral";
      result.style.display = "none";
      result.innerHTML = "";
      return;
    }

    const status = decideStatus({ countVal, ownVal, nlVal, midVal });
    const checklist = buildChecklist({ countVal, ownVal, nlVal, midVal });

    const title = resultTitle(status);

    let actions = "";
    if (status === "ok") {
      actions =
        `<div class="result-actions">` +
        `<a class="btn primary" href="/aanmelden.html">Start dossier</a>` +
        `</div>`;
    } else if (status === "maybe") {
      actions =
        `<div class="result-actions">` +
        `<a class="btn outline" href="/index.html#contact">Contact</a>` +
        `</div>`;
    } else {
      actions =
        `<div class="result-cta">Meer dan 4 laadpunten of zakelijke situatie? Neem contact op.</div>` +
        `<div class="result-actions">` +
          `<a class="btn outline" href="/index.html#contact">Contact</a>` +
        `</div>`;
    }

    result.style.display = "block";
    result.className = resultClass(status);
    result.innerHTML =
      `<b>${title}</b>` +
      checklist.html +
      actions;
  });
});