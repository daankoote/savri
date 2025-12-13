// ======================================================
// Supabase configuratie
// ======================================================
const SUPABASE_URL = "https://yzngrurkpfuqgexbhzgl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bmdydXJrcGZ1cWdleGJoemdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNjYxMjYsImV4cCI6MjA4MDg0MjEyNn0.L7atEcmNvX2Wic0eSM9jWGdFUadIhH21EUFNtzP4YCk";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ======================================================
// Helpers – validatie
// ======================================================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function isValidMobile(phone) {
  if (!phone) return true;
  return /^0[1-9][0-9]{8}$|^\+31[1-9][0-9]{8}$/.test(phone.trim());
}

// ======================================================
// Helpers – UI errors / success
// ======================================================
function showFieldError(field, message) {
  if (!field) return;

  field.classList.add("input-error");

  let el = field.parentElement.querySelector(".field-error");
  if (el) el.remove();

  el = document.createElement("div");
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
  form.querySelectorAll(".input-error").forEach(clearFieldError);
}

function showSuccessMessage(form, message) {
  const existing = form.querySelector(".form-status");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.className = "form-status form-status--success";
  div.textContent = message;

  form.appendChild(div);
}

// ======================================================
// Helpers – misc
// ======================================================
function getValue(form, selector) {
  const el = form.querySelector(selector);
  return el ? el.value.trim() : "";
}

function generateRefCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// ======================================================
// Email queue (Route A) – via Supabase Edge Function
// ======================================================
async function enqueueEmail({ to_email, subject, body, message_type = "generic", priority = 10 }) {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/enqueue-email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email, subject, body, message_type, priority }),
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    console.error("enqueue-email failed:", txt);
    // Belangrijk: we laten de form flow niet falen op mail-problemen,
    // behalve bij installer_code (daar kun je ervoor kiezen wél hard te falen).
    return { ok: false, error: txt };
  }

  return { ok: true };
}

// ======================================================
// DOM Ready
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  // jaar in footer
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // tabs (alleen index.html)
  const panels = document.querySelectorAll(".tab-panel");
  const toggles = document.querySelectorAll(".tab-toggle");

  if (panels.length) {
    const activate = (target) => {
      panels.forEach((p) => (p.style.display = p.dataset.panel === target ? "block" : "none"));
      toggles.forEach((b) => b.classList.toggle("active", b.dataset.target === target));
    };

    activate("installateur");
    toggles.forEach((btn) =>
      btn.addEventListener("click", () => activate(btn.dataset.target))
    );
  }

  // ref-code uit URL voor EV-form
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const evForm = document.querySelector('form[name="evrijder"]');
  if (evForm && ref) {
    const input = evForm.querySelector('input[name="installer_ref"]');
    if (input) input.value = ref.toUpperCase();
  }

  // forms koppelen
  document
    .querySelector('form[name="evrijder"]')
    ?.addEventListener("submit", handleEvForm);

  document
    .querySelector('form[name="installateur"]')
    ?.addEventListener("submit", handleInstallateurKlantForm);

  document
    .getElementById("installer-signup-form")
    ?.addEventListener("submit", handleInstallerSignup);

  document
    .querySelector('form[name="contact"]')
    ?.addEventListener("submit", handleContactForm);
});

// ======================================================
// EV-rijder
// ======================================================
async function handleEvForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  let hasError = false;

  const first = form.querySelector('[name="voornaam"]');
  const last = form.querySelector('[name="achternaam"]');
  const email = form.querySelector('[name="email"]');
  const phone = form.querySelector('[name="telefoon"]');
  const chargers = form.querySelector('[name="charger_count"]');
  const terrein = form.querySelector('[name="eigen_terrein"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  if (!first.value) { showFieldError(first, "Vul je voornaam in."); hasError = true; }
  if (!last.value) { showFieldError(last, "Vul je achternaam in."); hasError = true; }
  if (!email.value) {
    showFieldError(email, "Vul je e-mailadres in."); hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Vul een geldig e-mailadres in."); hasError = true;
  }
  if (phone.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Vul een geldig mobiel nummer in (06 of +316).");
    hasError = true;
  }
  if (!chargers.value) { showFieldError(chargers, "Selecteer het aantal laadpunten."); hasError = true; }
  if (!terrein.value) { showFieldError(terrein, "Maak een keuze."); hasError = true; }
  if (!akkoord.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (hasError) return;

  const payload = {
    source: "ev_direct",
    lead_type: "ev_user",
    full_name: `${first.value} ${last.value}`,
    email: email.value,
    phone: phone.value || null,
    charger_count: parseInt(chargers.value, 10),
    own_premises: terrein.value === "ja",
    consent_terms: true,
  };

  const { error } = await supabaseClient.from("leads").insert([payload]);
  if (error) {
    alert("Opslaan mislukt. Probeer later opnieuw.");
    return;
  }

  const mailBody =
  `Beste ${first.value.trim()},\n\n` +
  `Bedankt voor je aanmelding bij Savri.\n\n` +
  `Je voorinschrijving is ontvangen. We nemen contact met je op zodra er meer duidelijkheid is.\n\n` +
  `Met vriendelijke groet,\nSavri`;

  await enqueueEmail({
    to_email: email.value.trim(),
    subject: "Je aanmelding via Savri is ontvangen",
    body: mailBody,
    message_type: "lead_confirmation",
    priority: 10,
  });

  form.reset();
  showSuccessMessage(form, "Bedankt voor je aanmelding. We houden je op de hoogte.");
}

// ======================================================
// Installateur → klant
// ======================================================
async function handleInstallateurKlantForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  let hasError = false;

  const ref = form.querySelector('[name="installer_ref"]');
  const first = form.querySelector('[name="klant_voornaam"]');
  const last = form.querySelector('[name="klant_achternaam"]');
  const email = form.querySelector('[name="klant_email"]');
  const phone = form.querySelector('[name="klant_telefoon"]');
  const chargers = form.querySelector('[name="charger_count"]');
  const terrein = form.querySelector('[name="eigen_terrein"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  if (!ref.value) { showFieldError(ref, "Installateurscode is verplicht."); hasError = true; }
  if (!first.value) { showFieldError(first, "Voornaam ontbreekt."); hasError = true; }
  if (!last.value) { showFieldError(last, "Achternaam ontbreekt."); hasError = true; }
  if (!email.value || !isValidEmail(email.value)) {
    showFieldError(email, "Geldig e-mailadres vereist."); hasError = true;
  }
  if (!chargers.value) { showFieldError(chargers, "Selecteer laadpunten."); hasError = true; }
  if (!terrein.value) { showFieldError(terrein, "Maak een keuze."); hasError = true; }
  if (!akkoord.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (phone.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Ongeldig mobiel nummer."); hasError = true;
  }

  if (hasError) return;

  const payload = {
    source: "via_installateur",
    lead_type: "ev_user",
    full_name: `${first.value} ${last.value}`,
    email: email.value,
    phone: phone.value || null,
    charger_count: parseInt(chargers.value, 10),
    own_premises: terrein.value === "ja",
    installer_ref: ref.value.toUpperCase(),
    consent_terms: true,
  };

  const { error } = await supabaseClient.from("leads").insert([payload]);
  if (error) {
    alert("Opslaan mislukt. Probeer later opnieuw.");
    return;
  }

  showSuccessMessage(
    form,
    `Dank je wel ${first.value} ${last.value} voor het aanmelden van de klant.`
  );

  const mailBody =
  `Beste ${first.value.trim()},\n\n` +
  `Je aanmelding via Savri is ontvangen.\n\n` +
  `We nemen contact met je op zodra er vervolgstappen zijn.\n\n` +
  `Met vriendelijke groet,\nSavri`;

  await enqueueEmail({
    to_email: email.value.trim(),
    subject: "Je aanmelding via Savri is ontvangen",
    body: mailBody,
    message_type: "lead_confirmation",
    priority: 10,
  });

 form.reset();

}

// ======================================================
// Installateur signup
// ======================================================
async function handleInstallerSignup(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  let hasError = false;

  const company = form.querySelector('[name="company_name"]');
  const first = form.querySelector('[name="contact_first_name"]');
  const last = form.querySelector('[name="contact_last_name"]');
  const email = form.querySelector('[name="email"]');
  const phone = form.querySelector('[name="phone"]');
  const kvk = form.querySelector('[name="kvk"]');
  const akkoord = form.querySelector('[name="akkoord"]');

  if (!company.value) { showFieldError(company, "Bedrijfsnaam verplicht."); hasError = true; }
  if (!first.value) { showFieldError(first, "Voornaam verplicht."); hasError = true; }
  if (!last.value) { showFieldError(last, "Achternaam verplicht."); hasError = true; }
  if (!email.value || !isValidEmail(email.value)) {
    showFieldError(email, "Geldig e-mailadres vereist."); hasError = true;
  }
  if (!/^[0-9]{8}$/.test(kvk.value)) {
    showFieldError(kvk, "KVK-nummer moet 8 cijfers zijn."); hasError = true;
  }
  if (!akkoord.checked) { showFieldError(akkoord, "Akkoord is verplicht."); hasError = true; }

  if (phone.value && !isValidMobile(phone.value)) {
    showFieldError(phone, "Ongeldig mobiel nummer."); hasError = true;
  }

  if (hasError) return;

  const refCode = generateRefCode();

  const payload = {
    ref_code: refCode,
    company_name: company.value,
    contact_name: `${first.value} ${last.value}`,
    email: email.value,
    phone: phone.value || null,
    kvk: kvk.value,
    active: true,
  };

  const { error } = await supabaseClient.from("installers").insert([payload]);
  if (error) {
    alert("Aanmelding mislukt. Probeer later opnieuw.");
    return;
  }

  showSuccessMessage(
  form,
  "Aanmelding ontvangen. Je ontvangt je installateurscode per e-mail."
  );

  const mailBody =
  `Beste ${first.value.trim()} ${last.value.trim()},\n\n` +
  `Bedankt voor je aanmelding bij Savri.\n\n` +
  `Je persoonlijke installateurscode is: ${refCode}\n\n` +
  `Gebruik deze code bij het aanmelden van klanten.\n\n` +
  `Met vriendelijke groet,\nSavri`;

  const mailResult = await enqueueEmail({
    to_email: email.value.trim(),
    subject: "Je installateurscode voor Savri",
    body: mailBody,
    message_type: "installer_code",
    priority: 1,
  });

  // Optioneel: als installer-code mail faalt, wil je dat de gebruiker dat ziet:
  if (!mailResult.ok) {
    alert("Aanmelding opgeslagen, maar e-mail kon niet worden verstuurd. Neem contact op.");
  }
  
  form.reset();
}

// ======================================================
// Contact form
// ======================================================
async function handleContactForm(e) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  let hasError = false;

  const name = form.querySelector('[name="naam"]');
  const email = form.querySelector('[name="email"]');
  const subject = form.querySelector('[name="onderwerp"]');
  const message = form.querySelector('[name="bericht"]');

  if (!name.value) { showFieldError(name, "Naam is verplicht."); hasError = true; }
  if (!email.value) {
    showFieldError(email, "E-mailadres is verplicht."); hasError = true;
  } else if (!isValidEmail(email.value)) {
    showFieldError(email, "Vul een geldig e-mailadres in."); hasError = true;
  }
  if (!subject.value) { showFieldError(subject, "Kies een onderwerp."); hasError = true; }
  if (!message.value) { showFieldError(message, "Bericht ontbreekt."); hasError = true; }

  if (hasError) return;

  const payload = {
    name: name.value.trim(),
    email: email.value.trim(),
    subject: subject.value.trim(),
    message: message.value.trim(),
  };

  const { error } = await supabaseClient.from("contact_messages").insert([payload]);

  if (error) {
    alert("Contact versturen mislukt. Probeer later opnieuw.");
    return;
  }

  form.reset();
  showSuccessMessage(form, "Dank je wel. Je bericht is verzonden. We nemen contact met je op.");
}

