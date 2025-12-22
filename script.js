// ======================================================
// Config
// ======================================================
const SUPABASE_URL = "https://yzngrurkpfuqgexbhzgl.supabase.co";
const API_BASE = `${SUPABASE_URL}/functions/v1`;



// ======================================================
// Validatie helpers
// ======================================================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

function isValidMobile(phone) {
  if (!phone) return true;
  const trimmed = phone.trim();
  return /^0[1-9][0-9]{8}$|^\+31[1-9][0-9]{8}$/.test(trimmed);
}

// ======================================================
// UI helpers: inline errors
// ======================================================
function showFieldError(field, message) {
  if (!field) return;
  field.classList.add("input-error");

  const existing = field.parentElement.querySelector(".field-error");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = "field-error";
  el.textContent = message;
  field.parentElement.appendChild(el);
}

function clearFieldError(field) {
  if (!field) return;
  field.classList.remove("input-error");
  const el = field.parentElement.querySelector(".field-error");
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

// ======================================================
// Misc
// ======================================================
function generateRefCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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
// Email queue
// - Eerst Edge Function proberen (als jij die later wil gebruiken)
// - Anders direct insert in outbound_emails (jouw huidige werkende route)
// ======================================================
//async function tryEdgeFunctionEmail(payload) {
//  const url = `${SUPABASE_URL}/functions/v1/enqueue-email`;
//  const res = await fetch(url, {
//    method: "POST",
//    headers: {
//      "Content-Type": "application/json",
//      apikey: SUPABASE_ANON_KEY,
//      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
//    },
//    body: JSON.stringify(payload),
//  });

//  if (!res.ok) {
//    const txt = await res.text().catch(() => "");
//    return { ok: false, error: txt || `HTTP ${res.status}` };
//  }
//  return { ok: true };
//}

//async function queueEmail({ to_email, subject, body, message_type = "generic", priority = 10 }) {
//  const payload = { to_email, subject, body, message_type, priority };

 // // 1) Edge Function (optioneel)
 // try {
 //   const edge = await tryEdgeFunctionEmail(payload);
 //   if (edge.ok) return { ok: true, via: "edge" };
 // } catch (_) {
 //   // negeren → fallback
 // }

 // // 2) Fallback: direct insert in outbound_emails
  //const { error } = await supabaseClient.from("outbound_emails").insert([payload]);
 // if (error) return { ok: false, error: error.message || String(error) };

//  return { ok: true, via: "table" };
//}

//// ======================================================
//// Installer ref validation via RPC
//// ======================================================
//async function validateInstallerRef(ref) {
//  const code = (ref || "").trim().toUpperCase();
//  if (!code) return false;

//  const { data, error } = await supabaseClient.rpc("validate_installer_ref", { p_ref: code });
//  if (error) {
//    console.error("validate_installer_ref RPC error:", error);
//    return false;
//  }
//  return !!data;
//}

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

  // ref in URL voor EV form
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const evForm = document.querySelector('form[name="evrijder"]');
  if (evForm && ref) {
    const input = evForm.querySelector('input[name="installer_ref"]');
    if (input) input.value = ref.toUpperCase();
  }

  // Bind forms
  document.querySelector('form[name="evrijder"]')?.addEventListener("submit", handleEvForm);
  document.querySelector('form[name="installateur"]')?.addEventListener("submit", handleInstallateurKlantForm);
  document.getElementById("installer-signup-form")?.addEventListener("submit", handleInstallerSignup);
  document.querySelector('form[name="contact"]')?.addEventListener("submit", handleContactForm);
});

// ======================================================
// EV-rijder
// ======================================================
async function handleEvForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const first = form.querySelector('[name="voornaam"]');
  const last = form.querySelector('[name="achternaam"]');
  const email = form.querySelector('[name="email"]');
  const phone = form.querySelector('[name="telefoon"]');
  const chargers = form.querySelector('[name="charger_count"]');
  const terrein = form.querySelector('[name="eigen_terrein"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  let hasError = false;

  if (!first.value.trim()) { showFieldError(first, "Vul uw voornaam in."); hasError = true; }
  if (!last.value.trim()) { showFieldError(last, "Vul uw achternaam in."); hasError = true; }

  if (!email.value.trim()) {
    showFieldError(email, "Geldig e-mailadres verplicht."); hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Controleer uw e-mailadres."); hasError = true;
  }

  if (phone.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316)."); hasError = true;
  }

  if (!chargers.value) { showFieldError(chargers, "Selecteer het aantal laadpunten."); hasError = true; }
  if (!terrein.value) { showFieldError(terrein, "Maak een keuze."); hasError = true; }
  if (!akkoord.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (hasError) return;

  const payload = {
    source: "ev_direct",
    lead_type: "ev_user",
    first_name: first.value.trim(),
    last_name: last.value.trim(),
    full_name: `${first.value.trim()} ${last.value.trim()}`.trim(), // tijdelijk laten staan
    email: email.value.trim(),
    phone: phone.value.trim() || null,
    charger_count: parseInt(chargers.value, 10),
    own_premises: terrein.value === "ja",
    consent_terms: true,
  };


  const res = await fetch(`${API_BASE}/api-lead-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flow: "ev_direct",
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email,
      phone: payload.phone,
      charger_count: payload.charger_count,
      own_premises: payload.own_premises
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

}

// ======================================================
// Installateur → klant
// ======================================================
async function handleInstallateurKlantForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const ref = form.querySelector('[name="installer_ref"]');
  const first = form.querySelector('[name="klant_voornaam"]');
  const last = form.querySelector('[name="klant_achternaam"]');
  const email = form.querySelector('[name="klant_email"]');
  const phone = form.querySelector('[name="klant_telefoon"]');
  const chargers = form.querySelector('[name="charger_count"]');
  const terrein = form.querySelector('[name="eigen_terrein"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  let hasError = false;

  if (!ref.value.trim()) { showFieldError(ref, "Installateurscode is verplicht."); hasError = true; }
  if (!first.value.trim()) { showFieldError(first, "Vul uw voornaam in."); hasError = true; }
  if (!last.value.trim()) { showFieldError(last, "Vul uw achternaam in."); hasError = true; }

  if (!email.value.trim()) {
    showFieldError(email, "Geldig e-mailadres is verplicht."); hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Controleer uw e-mailadres."); hasError = true;
  }

  if (phone.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316)."); hasError = true;
  }

  if (!chargers.value) { showFieldError(chargers, "Selecteer laadpunten."); hasError = true; }
  if (!terrein.value) { showFieldError(terrein, "Maak een keuze."); hasError = true; }
  if (!akkoord.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (hasError) return;

  //// installer code check (RPC)
  //const ok = await validateInstallerRef(ref.value);
  //if (!ok) {
  //  showFieldError(ref, "Installateurscode niet correct / bekend.");
  //  return;
  //}

  const payload = {
    source: "via_installateur",
    lead_type: "ev_user",
    first_name: first.value.trim(),
    last_name: last.value.trim(),
    full_name: `${first.value.trim()} ${last.value.trim()}`.trim(), // tijdelijk laten staan
    email: email.value.trim(),
    phone: phone.value.trim() || null,
    charger_count: parseInt(chargers.value, 10),
    own_premises: terrein.value === "ja",
    installer_ref: ref.value.trim().toUpperCase(),
    consent_terms: true,
  };

 const res = await fetch(`${API_BASE}/api-lead-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flow: "installer_to_customer",
      installer_ref: ref.value.trim().toUpperCase(),
      first_name: first.value.trim(),
      last_name: last.value.trim(),
      email: email.value.trim(),
      phone: phone.value.trim() || null,
      charger_count: parseInt(chargers.value, 10),
      own_premises: terrein.value === "ja",
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    showFieldError(ref, json.error || "Installateurscode niet correct / bekend.");
    return;
  }

  keepAndReset(form, ['input[name="installer_ref"]'], 'input[name="klant_voornaam"]');
  showToast("Klant aangemeld. Dossierlink wordt per e-mail verstuurd.", "success");

}

// ======================================================
// Installateur signup
// ======================================================
async function handleInstallerSignup(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const company = form.querySelector('[name="company_name"]');
  const first = form.querySelector('[name="contact_first_name"]');
  const last = form.querySelector('[name="contact_last_name"]');
  const email = form.querySelector('[name="email"]');
  const phone = form.querySelector('[name="phone"]');
  const kvk = form.querySelector('[name="kvk"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  let hasError = false;

  if (!company.value.trim()) { showFieldError(company, "Bedrijfsnaam verplicht."); hasError = true; }
  if (!first.value.trim()) { showFieldError(first, "Voornaam verplicht."); hasError = true; }
  if (!last.value.trim()) { showFieldError(last, "Achternaam verplicht."); hasError = true; }

  if (!email.value.trim()) {
    showFieldError(email, "E-mailadres is verplicht."); hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Geldig e-mailadres vereist."); hasError = true;
  }

  if (!/^[0-9]{8}$/.test((kvk.value || "").trim())) {
    showFieldError(kvk, "KVK-nummer moet 8 cijfers zijn."); hasError = true;
  }

  if (phone.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Ongeldig mobiel nummer."); hasError = true;
  }

  if (!akkoord.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (hasError) return;

  const refCode = generateRefCode(6);

  const payload = {
    ref_code: refCode,
    company_name: company.value.trim(),
    // tijdelijk: bestaande kolom contact_name blijft gevuld,
    // later kun je deze droppen als je wil
    contact_first_name: first.value.trim(),
    contact_last_name: last.value.trim(),
    contact_name: `${first.value.trim()} ${last.value.trim()}`.trim(), // tijdelijk laten staan als je legacy wil
    email: email.value.trim(),
    phone: phone.value.trim() || null,
    kvk: kvk.value.trim(),
    active: true,
  };

  const res = await fetch(`${API_BASE}/api-lead-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flow: "installer_signup",
      company_name: company.value.trim(),
      contact_first_name: first.value.trim(),
      contact_last_name: last.value.trim(),
      email: email.value.trim(),
      phone: phone.value.trim() || null,
      kvk: kvk.value.trim(),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    showToast(json.error || "Aanmelding mislukt. Probeer later opnieuw.", "error");
    return;
  }

  keepAndReset(form, [], 'input[name="contact_first_name"]');
  showToast("Aanmelding ontvangen. Je ontvangt e-mail + account activatie (magic link).", "success");
}

// ======================================================
// Contact
// ======================================================
async function handleContactForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const first = form.querySelector('[name="first_name"]');
  const last = form.querySelector('[name="last_name"]');
  const email = form.querySelector('[name="email"]');
  const subject = form.querySelector('[name="onderwerp"]');
  const message = form.querySelector('[name="bericht"]');
  const confirmationBody =
  `Dank voor uw bericht.\n` +
  `We hebben uw onderstaande bericht ontvangen en zullen zo snel mogelijk reageren.\n\n` +
  `----------------------------------------\n\n`;

  let hasError = false;

  if (!first.value.trim()) { showFieldError(first, "Voornaam is verplicht."); hasError = true; }

  if (!email.value.trim()) {
    showFieldError(email, "E-mailadres is verplicht."); hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Vul een geldig e-mailadres in."); hasError = true;
  }

  if (!subject.value) { showFieldError(subject, "Kies een onderwerp."); hasError = true; }
  if (!message.value.trim()) { showFieldError(message, "Bericht ontbreekt."); hasError = true; }

  if (hasError) return;

  const payload = {
    first_name: first.value.trim(),
    last_name: last.value.trim() || null,
    name: `${first.value.trim()} ${last.value.trim()}`.trim(), // backward compat met je huidige kolom
    email: email.value.trim(),
    subject: subject.value.trim(),
    message: message.value.trim(),
  };

  const res = await fetch(`${API_BASE}/api-lead-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flow: "contact",
      first_name: first.value.trim(),
      last_name: last.value.trim() || null,
      email: email.value.trim(),
      subject: subject.value.trim(),
      message: message.value.trim(),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    showToast(json.error || "Contact versturen mislukt. Probeer later opnieuw.", "error");
    return;
  }

  keepAndReset(form, [], 'input[name="first_name"]');
  showToast("Dank je wel. Je bericht is ontvangen.", "success");

}