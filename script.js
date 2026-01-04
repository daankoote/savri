// Test script
console.log("ENVAL SCRIPT.JS v2026-01-03-01 LOADED");

// ======================================================
// Config (komt uit /config.js)
// ======================================================
const SUPABASE_URL = window.ENVAL?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.ENVAL?.SUPABASE_ANON_KEY;
const API_BASE = window.ENVAL?.API_BASE;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !API_BASE) {
  console.error("ENVAL config ontbreekt. Laad eerst /config.js vóór script.js");
}


function edgeHeaders(idempotencyKey) {
  const extra = {};
  if (idempotencyKey) extra["Idempotency-Key"] = idempotencyKey;
  return window.ENVAL.edgeHeaders(extra);
}


function newIdempotencyKey() {
  // modern browsers
  if (crypto?.randomUUID) return crypto.randomUUID();

  // fallback
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


// ======================================================
// Validatie helpers
// ======================================================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

function isValidMobile(phone) {
  // optioneel veld: leeg = ok
  if (!phone) return true;
  const trimmed = phone.trim();
  return /^0[1-9][0-9]{8}$|^\+31[1-9][0-9]{8}$/.test(trimmed);
}

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


// ======================================================
// UI helpers: inline errors
// ======================================================
function showFieldError(field, message) {
  if (!field) return;

  // checkbox heeft vaak andere DOM; toch proberen op parent te hangen
  field.classList.add("input-error");

  const parent = field.parentElement || field.closest("label") || field;
  const existing = parent.querySelector?.(".field-error");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = "field-error";
  el.textContent = message;

  if (parent.appendChild) parent.appendChild(el);
}

function clearFieldError(field) {
  if (!field) return;
  field.classList.remove("input-error");

  const parent = field.parentElement || field.closest("label") || field;
  const el = parent.querySelector?.(".field-error");
  if (el) el.remove();
}

function clearAllFieldErrors(form) {
  if (!form) return;
  form.querySelectorAll(".input-error").forEach(clearFieldError);
}

// ======================================================
// Toast
// ======================================================
function showToast(message, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.className = `toast toast--${type}`;
  div.textContent = message;
  document.body.appendChild(div);

  setTimeout(() => {
    if (div) div.remove();
  }, 4200);
}

function keepAndReset(form, keepSelectors = [], focusSelector = null) {
  const keep = {};
  keepSelectors.forEach((sel) => {
    const el = form.querySelector(sel);
    keep[sel] = el ? el.value : "";
  });

  form.reset();
  clearAllFieldErrors(form);

  keepSelectors.forEach((sel) => {
    const el = form.querySelector(sel);
    if (el && keep[sel] !== undefined) el.value = keep[sel];
  });

  if (focusSelector) {
    const f = form.querySelector(focusSelector);
    if (f) f.focus();
  }
}

// ======================================================
// UI helpers: submit lock
// ======================================================
function lockSubmit(btn, locked, textWhenLocked = "Verwerken…") {
  if (!btn) return;

  // zet originele tekst slechts 1x
  if (!btn.dataset.originalText) {
    btn.dataset.originalText = (btn.textContent || "").trim();
  }

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


// ======================================================
// DOM Ready
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  // footer year
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // tabs index.html
  const panels = document.querySelectorAll(".tab-panel");
  const toggles = document.querySelectorAll(".tab-toggle");
  if (panels.length) {
    const activate = (target) => {
      panels.forEach((p) => (p.style.display = p.dataset.panel === target ? "block" : "none"));
      toggles.forEach((b) => b.classList.toggle("active", b.dataset.target === target));
    };
    activate("installateur");
    toggles.forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.target)));
  }

  // ref in URL voor EV form (optioneel)
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const evForm = document.querySelector('form[name="evrijder"]');
  if (evForm && ref) {
    const input = evForm.querySelector('input[name="installer_ref"]');
    if (input) input.value = ref.toUpperCase();
  }

  // Bind forms (fail-safe: 1 kapot form mag de rest niet breken)
  try {
    document.querySelector('form[name="evrijder"]')?.addEventListener("submit", handleEvForm);
  } catch (e) {
    console.error("bind evrijder failed", e);
  }

  try {
    document.querySelector('form[name="installateur"]')?.addEventListener("submit", handleInstallateurKlantForm);
  } catch (e) {
    console.error("bind installateur->klant failed", e);
  }

  try {
    document.getElementById("installer-signup-form")?.addEventListener("submit", handleInstallerSignup);
  } catch (e) {
    console.error("bind installer signup failed", e);
  }

  try {
    document.querySelector('form[name="contact"]')?.addEventListener("submit", handleContactForm);
  } catch (e) {
    console.error("bind contact failed", e);
  }
});

// ======================================================
// EV-rijder
// ======================================================
async function handleEvForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const btn = form.querySelector('button[type="submit"]');
  if (btn?.disabled) return;

  const first = form.querySelector('[name="voornaam"]');
  const last = form.querySelector('[name="achternaam"]');
  const email = form.querySelector('[name="email"]');
  const phone = form.querySelector('[name="telefoon"]');
  const chargers = form.querySelector('[name="charger_count"]');
  const terrein = form.querySelector('[name="eigen_terrein"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  let hasError = false;

  const firstNorm = normalizePersonName(first?.value || "");
  const lastNorm = normalizePersonName(last?.value || "");

  if (!firstNorm) {
    showFieldError(first, "Vul uw voornaam in.");
    hasError = true;
  }
  if (!lastNorm) {
    showFieldError(last, "Vul uw achternaam in.");
    hasError = true;
  }

  if (!email?.value?.trim()) {
    showFieldError(email, "Geldig e-mailadres verplicht.");
    hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Controleer uw e-mailadres.");
    hasError = true;
  }

  if (phone?.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316).");
    hasError = true;
  }

  if (!chargers?.value) {
    showFieldError(chargers, "Selecteer het aantal laadpunten.");
    hasError = true;
  }
  if (!terrein?.value) {
    showFieldError(terrein, "Maak een keuze.");
    hasError = true;
  }
  if (!akkoord?.checked) {
    showFieldError(akkoord, "Akkoord is verplicht.");
    hasError = true;
  }

  if (hasError) return;

  // ✅ zet genormaliseerde waarden direct terug in het formulier
  if (first) first.value = firstNorm;
  if (last) last.value = lastNorm;

  lockSubmit(btn, true);

  try {
    const idem = newIdempotencyKey();

    const res = await fetch(`${API_BASE}/api-lead-submit`, {
      method: "POST",
      headers: edgeHeaders(idem),
      body: JSON.stringify({
        flow: "ev_direct",
        first_name: firstNorm,
        last_name: lastNorm,
        email: email.value.trim(),
        phone: phone.value.trim() || null,
        charger_count: parseInt(chargers.value, 10),
        own_premises: terrein.value === "ja",
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      console.error("api-lead-submit ev_direct failed:", json);
      showToast(json.error || "Opslaan mislukt. Probeer later opnieuw.", "error");
      return;
    }

    keepAndReset(form, [], 'input[name="voornaam"]');
    showToast("Aanmelding ontvangen. Je ontvangt e-mail met dossierlink.", "success");
  } catch (err) {
    console.error("ev_direct exception:", err);
    showToast("Er ging iets mis (netwerk). Probeer later opnieuw.", "error");
  } finally {
    lockSubmit(btn, false);
  }
}


// ======================================================
// Installateur → klant
// ======================================================
async function handleInstallateurKlantForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const btn = form.querySelector('button[type="submit"]');
  if (btn?.disabled) return;

  const ref = form.querySelector('[name="installer_ref"]');
  const first = form.querySelector('[name="klant_voornaam"]');
  const last = form.querySelector('[name="klant_achternaam"]');
  const email = form.querySelector('[name="klant_email"]');
  const phone = form.querySelector('[name="klant_telefoon"]');
  const chargers = form.querySelector('[name="charger_count"]');
  const terrein = form.querySelector('[name="eigen_terrein"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  let hasError = false;

  const firstNorm = normalizePersonName(first?.value || "");
  const lastNorm = normalizePersonName(last?.value || "");

  if (!ref?.value?.trim()) {
    showFieldError(ref, "Installateurscode is verplicht.");
    hasError = true;
  }
  if (!firstNorm) {
    showFieldError(first, "Vul de voornaam in.");
    hasError = true;
  }
  if (!lastNorm) {
    showFieldError(last, "Vul de achternaam in.");
    hasError = true;
  }

  if (!email?.value?.trim()) {
    showFieldError(email, "Geldig e-mailadres is verplicht.");
    hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Controleer het e-mailadres.");
    hasError = true;
  }

  if (phone?.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316).");
    hasError = true;
  }

  if (!chargers?.value) {
    showFieldError(chargers, "Selecteer laadpunten.");
    hasError = true;
  }
  if (!terrein?.value) {
    showFieldError(terrein, "Maak een keuze.");
    hasError = true;
  }
  if (!akkoord?.checked) {
    showFieldError(akkoord, "Akkoord is verplicht.");
    hasError = true;
  }

  if (hasError) return;

  // ✅ zet genormaliseerde waarden direct terug in het formulier
  if (first) first.value = firstNorm;
  if (last) last.value = lastNorm;

  lockSubmit(btn, true);

  try {
    const idem = newIdempotencyKey();

    const res = await fetch(`${API_BASE}/api-lead-submit`, {
      method: "POST",
      headers: edgeHeaders(idem),
      body: JSON.stringify({
        flow: "installer_to_customer",
        installer_ref: ref.value.trim().toUpperCase(),
        first_name: firstNorm,
        last_name: lastNorm,
        email: email.value.trim(),
        phone: phone.value.trim() || null,
        charger_count: parseInt(chargers.value, 10),
        own_premises: terrein.value === "ja",
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      const msg = json.error || "Installateurscode niet correct / bekend.";
      showFieldError(ref, msg);
      showToast(msg, "error");
      return;
    }

    keepAndReset(form, ['input[name="installer_ref"]'], 'input[name="klant_voornaam"]');
    showToast("Klant aangemeld. Dossierlink wordt per e-mail verstuurd.", "success");
  } catch (err) {
    console.error("installer_to_customer exception:", err);
    showToast("Er ging iets mis (netwerk). Probeer later opnieuw.", "error");
  } finally {
    lockSubmit(btn, false);
  }
}


// ======================================================
// Installateur signup
// ======================================================
async function handleInstallerSignup(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const btn = form.querySelector('button[type="submit"]');
  if (btn?.disabled) return;

  const company = form.querySelector('[name="company_name"]');
  const first = form.querySelector('[name="contact_first_name"]');
  const last = form.querySelector('[name="contact_last_name"]');
  const email = form.querySelector('[name="email"]');
  const phone = form.querySelector('[name="phone"]');
  const kvk = form.querySelector('[name="kvk"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  let hasError = false;

  const firstNorm = normalizePersonName(first?.value || "");
  const lastNorm = normalizePersonName(last?.value || "");

  if (!company?.value?.trim()) {
    showFieldError(company, "Bedrijfsnaam verplicht.");
    hasError = true;
  }
  if (!firstNorm) {
    showFieldError(first, "Voornaam verplicht.");
    hasError = true;
  }
  if (!lastNorm) {
    showFieldError(last, "Achternaam verplicht.");
    hasError = true;
  }

  if (!email?.value?.trim()) {
    showFieldError(email, "E-mailadres is verplicht.");
    hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Geldig e-mailadres vereist.");
    hasError = true;
  }

  if (!/^[0-9]{8}$/.test((kvk?.value || "").trim())) {
    showFieldError(kvk, "KVK-nummer moet 8 cijfers zijn.");
    hasError = true;
  }

  if (phone?.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Ongeldig mobiel nummer.");
    hasError = true;
  }

  if (!akkoord?.checked) {
    showFieldError(akkoord, "Akkoord is verplicht.");
    hasError = true;
  }

  if (hasError) return;

  // ✅ zet genormaliseerde waarden direct terug in het formulier
  if (first) first.value = firstNorm;
  if (last) last.value = lastNorm;

  lockSubmit(btn, true);

  try {
    const idem = newIdempotencyKey();

    const res = await fetch(`${API_BASE}/api-lead-submit`, {
      method: "POST",
      headers: edgeHeaders(idem),
      body: JSON.stringify({
        flow: "installer_signup",
        company_name: company.value.trim(),
        contact_first_name: firstNorm,
        contact_last_name: lastNorm,
        email: email.value.trim(),
        phone: phone.value.trim() || null,
        kvk: kvk.value.trim(),
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      console.error("installer_signup failed:", json);
      showToast(json.error || "Aanmelding mislukt. Probeer later opnieuw.", "error");
      return;
    }

    keepAndReset(form, [], 'input[name="contact_first_name"]');
    showToast("Aanmelding ontvangen. Je ontvangt e-mail + account activatie (magic link).", "success");
  } catch (err) {
    console.error("installer_signup exception:", err);
    showToast("Er ging iets mis (netwerk). Probeer later opnieuw.", "error");
  } finally {
    lockSubmit(btn, false);
  }
}


// ======================================================
// Contact
// ======================================================
async function handleContactForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const btn = form.querySelector('button[type="submit"]');
  if (btn?.disabled) return;

  const first = form.querySelector('[name="first_name"]');
  const last = form.querySelector('[name="last_name"]');
  const email = form.querySelector('[name="email"]');
  const subject = form.querySelector('[name="onderwerp"]');
  const message = form.querySelector('[name="bericht"]');

  let hasError = false;

  const firstNorm = normalizePersonName(first?.value || "");
  const lastNorm = normalizePersonName(last?.value || ""); // optioneel

  if (!firstNorm) {
    showFieldError(first, "Voornaam is verplicht.");
    hasError = true;
  }

  if (!email?.value?.trim()) {
    showFieldError(email, "E-mailadres is verplicht.");
    hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Vul een geldig e-mailadres in.");
    hasError = true;
  }

  if (!subject?.value) {
    showFieldError(subject, "Kies een onderwerp.");
    hasError = true;
  }
  if (!message?.value?.trim()) {
    showFieldError(message, "Bericht ontbreekt.");
    hasError = true;
  }

  if (hasError) return;

  // ✅ zet genormaliseerde waarden direct terug in het formulier
  if (first) first.value = firstNorm;
  if (last) last.value = lastNorm;

  lockSubmit(btn, true);

  try {
    const idem = newIdempotencyKey();

    const res = await fetch(`${API_BASE}/api-lead-submit`, {
      method: "POST",
      headers: edgeHeaders(idem),
      body: JSON.stringify({
        flow: "contact",
        first_name: firstNorm,
        last_name: lastNorm || null,
        email: email.value.trim(),
        subject: subject.value.trim(),
        message: message.value.trim(),
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      console.error("contact failed:", json);
      showToast(json.error || "Contact versturen mislukt. Probeer later opnieuw.", "error");
      return;
    }

    keepAndReset(form, [], 'input[name="first_name"]');
    showToast("Dank je wel. Je bericht is ontvangen.", "success");
  } catch (err) {
    console.error("contact exception:", err);
    showToast("Er ging iets mis (netwerk). Probeer later opnieuw.", "error");
  } finally {
    lockSubmit(btn, false);
  }
}
