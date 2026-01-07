// versie 260105_18 oclock
console.log("ENVAL SCRIPT.JS versie 260105_18 oclock");

// ======================================================
// 0) Config (komt uit /config.js)
// ======================================================
const SUPABASE_URL = window.ENVAL?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.ENVAL?.SUPABASE_ANON_KEY;
const API_BASE = window.ENVAL?.API_BASE;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !API_BASE) {
  console.error("ENVAL config ontbreekt. Laad eerst /config.js vóór script.js");
}

// ======================================================
// 1) Network helpers
// ======================================================

/**
 * edgeHeaders(idempotencyKey)
 * Doel: headers voor edge calls + optionele idempotency key
 */
function edgeHeaders(idempotencyKey) {
  const extra = {};
  if (idempotencyKey) extra["Idempotency-Key"] = idempotencyKey;
  return window.ENVAL.edgeHeaders(extra);
}

/**
 * newIdempotencyKey()
 * Doel: unieke key om double submits veilig te maken
 */
function newIdempotencyKey() {
  if (crypto?.randomUUID) return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ======================================================
// 2) Validatie helpers
// ======================================================

/**
 * isValidEmail(email)
 * Simpele, pragmatische email check voor frontend.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

/**
 * isValidMobile(phone)
 * Doel: NL mobiel (06xxxxxxxx / +316xxxxxxxx). Leeg = ok (optioneel veld).
 */
function isValidMobile(phone) {
  if (!phone) return true;

  const p = String(phone).trim().replace(/[\s\-().]/g, "");
  return /^06\d{8}$/.test(p) || /^\+316\d{8}$/.test(p);
}

/**
 * normalizePersonName(input)
 * Doel: nette naam-weergave en consistente opslag.
 * Bewust simpel gehouden: title-case per woord, behoud van ' en -.
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

// ======================================================
// 3) UI helpers: inline errors (per field)
// ======================================================

/**
 * showFieldError(field, message)
 * Doel: markeer veld rood + toon message onder het veld/label.
 */
function showFieldError(field, message) {
  if (!field) return;

  field.classList.add("input-error");

  const parent = field.parentElement || field.closest("label") || field;
  const existing = parent.querySelector?.(".field-error");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = "field-error";
  el.textContent = message;

  if (parent.appendChild) parent.appendChild(el);
}

/**
 * clearFieldError(field)
 * Doel: remove styling + error message voor één veld.
 */
function clearFieldError(field) {
  if (!field) return;
  field.classList.remove("input-error");

  const parent = field.parentElement || field.closest("label") || field;
  const el = parent.querySelector?.(".field-error");
  if (el) el.remove();
}

/**
 * clearAllFieldErrors(form)
 * Doel: reset errors voor hele form.
 */
function clearAllFieldErrors(form) {
  if (!form) return;
  form.querySelectorAll(".input-error").forEach(clearFieldError);
}



// ======================================================
// 4) UI helpers: Toast + form reset behavior
// ======================================================

/**
 * showToast(message, type)
 * Doel: tijdelijke feedback (success/error) onderin beeld.
 */
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

/**
 * keepAndReset(form, keepSelectors, focusSelector)
 * Doel: reset form, maar behoud bepaalde velden (bv installer_ref) en zet focus.
 */
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
// 5) UI helpers: submit lock (anti double-click)
// ======================================================

/**
 * lockSubmit(btn, locked, textWhenLocked)
 * Doel: disable submit + visueel loading state.
 * Werkt samen met CSS: button.is-loading::after.
 */
function lockSubmit(btn, locked, textWhenLocked = "Verwerken…") {
  if (!btn) return;

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
// 6) UI helpers: Mobile Hamburger menu
// ======================================================

function initMobileNav() {
  const btn = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (!btn || !nav) return;

  const setOpen = (open) => {
    document.body.classList.toggle("nav-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  btn.addEventListener("click", () => {
    const open = document.body.classList.contains("nav-open");
    setOpen(!open);
  });

  // klik op link => menu sluiten
  nav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => setOpen(false));
  });

  // klik buiten menu => sluiten
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("nav-open")) return;
    const t = e.target;
    if (t === btn || btn.contains(t) || nav.contains(t)) return;
    setOpen(false);
  });

  // resize naar desktop => reset
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 768) setOpen(false);
  });
}



// ======================================================
// 6) DOM Ready: bind events
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  // footer year
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // tabs index.html (progressive enhancement: zonder JS blijven panels zichtbaar)
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
  try { document.querySelector('form[name="evrijder"]')?.addEventListener("submit", handleEvForm); }
  catch (e) { console.error("bind evrijder failed", e); }

  try { document.querySelector('form[name="installateur"]')?.addEventListener("submit", handleInstallateurKlantForm); }
  catch (e) { console.error("bind installateur->klant failed", e); }

  try { document.getElementById("installer-signup-form")?.addEventListener("submit", handleInstallerSignup); }
  catch (e) { console.error("bind installer signup failed", e); }

  try { document.querySelector('form[name="contact"]')?.addEventListener("submit", handleContactForm); }
  catch (e) { console.error("bind contact failed", e); }
});

// ======================================================
// 7) Handlers
// ======================================================

/**
 * handleEvForm(e)
 * Flow: ev_direct → api-lead-submit
 */
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

  if (!firstNorm) { showFieldError(first, "Vul uw voornaam in."); hasError = true; }
  if (!lastNorm) { showFieldError(last, "Vul uw achternaam in."); hasError = true; }

  if (!email?.value?.trim()) { showFieldError(email, "Geldig e-mailadres verplicht."); hasError = true; }
  else if (!isValidEmail(email.value)) { showFieldError(email, "Controleer uw e-mailadres."); hasError = true; }

  if (phone?.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316).");
    hasError = true;
  }

  if (!chargers?.value) { showFieldError(chargers, "Selecteer het aantal laadpunten."); hasError = true; }
  if (!terrein?.value) { showFieldError(terrein, "Maak een keuze."); hasError = true; }
  if (!akkoord?.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (hasError) return;

  // normalize terugzetten (UX)
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

/**
 * handleInstallateurKlantForm(e)
 * Flow: installer_to_customer → api-lead-submit
 */
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

  if (!ref?.value?.trim()) { showFieldError(ref, "Installateurscode is verplicht."); hasError = true; }
  if (!firstNorm) { showFieldError(first, "Vul de voornaam in."); hasError = true; }
  if (!lastNorm) { showFieldError(last, "Vul de achternaam in."); hasError = true; }

  if (!email?.value?.trim()) { showFieldError(email, "Geldig e-mailadres is verplicht."); hasError = true; }
  else if (!isValidEmail(email.value)) { showFieldError(email, "Controleer het e-mailadres."); hasError = true; }

  if (phone?.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316).");
    hasError = true;
  }

  if (!chargers?.value) { showFieldError(chargers, "Selecteer laadpunten."); hasError = true; }
  if (!terrein?.value) { showFieldError(terrein, "Maak een keuze."); hasError = true; }
  if (!akkoord?.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (hasError) return;

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

/**
 * handleInstallerSignup(e)
 * Flow: installer_signup → api-lead-submit
 */
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

  if (!company?.value?.trim()) { showFieldError(company, "Bedrijfsnaam verplicht."); hasError = true; }
  if (!firstNorm) { showFieldError(first, "Voornaam verplicht."); hasError = true; }
  if (!lastNorm) { showFieldError(last, "Achternaam verplicht."); hasError = true; }

  if (!email?.value?.trim()) { showFieldError(email, "E-mailadres is verplicht."); hasError = true; }
  else if (!isValidEmail(email.value)) { showFieldError(email, "Geldig e-mailadres vereist."); hasError = true; }

  if (!/^[0-9]{8}$/.test((kvk?.value || "").trim())) {
    showFieldError(kvk, "KVK-nummer moet 8 cijfers zijn.");
    hasError = true;
  }

  if (phone?.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316).");
    hasError = true;
  }

  if (!akkoord?.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (hasError) return;

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

/**
 * handleContactForm(e)
 * Flow: contact → api-lead-submit
 */
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
  const lastNorm = normalizePersonName(last?.value || "");

  if (!firstNorm) { showFieldError(first, "Voornaam is verplicht."); hasError = true; }

  if (!email?.value?.trim()) { showFieldError(email, "E-mailadres is verplicht."); hasError = true; }
  else if (!isValidEmail(email.value)) { showFieldError(email, "Vul een geldig e-mailadres in."); hasError = true; }

  if (!subject?.value) { showFieldError(subject, "Kies een onderwerp."); hasError = true; }
  if (!message?.value?.trim()) { showFieldError(message, "Bericht ontbreekt."); hasError = true; }

  if (hasError) return;

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
