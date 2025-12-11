// ========= Supabase configuratie =========
const SUPABASE_URL = "https://yzngrurkpfuqgexbhzgl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bmdydXJrcGZ1cWdleGJoemdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNjYxMjYsImV4cCI6MjA4MDg0MjEyNn0.L7atEcmNvX2Wic0eSM9jWGdFUadIhH21EUFNtzP4YCk";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========= Helpers =========

function isValidMobile(phone) {
  if (!phone) return false;
  const trimmed = phone.trim();
  const patternLocal = /^0[1-9][0-9]{8}$/; // 06xxxxxxxx
  const patternIntl = /^\+31[1-9][0-9]{8}$/; // +316xxxxxxxx
  return patternLocal.test(trimmed) || patternIntl.test(trimmed);
}

function isValidEmail(email) {
  if (!email) return false;
  const trimmed = email.trim();
  return trimmed.includes("@") && trimmed.includes(".");
}

function markFieldError(field) {
  if (!field) return;
  field.classList.add("input-error");
}

function clearFieldError(field) {
  if (!field) return;
  field.classList.remove("input-error");
}

function clearAllFieldErrors(formElement) {
  if (!formElement) return;
  const errored = formElement.querySelectorAll(".input-error");
  errored.forEach((el) => el.classList.remove("input-error"));
}

function showFormError(formElement, message) {
  if (!formElement) return;

  // Verwijder bestaande status-banners rond dit formulier
  const existing = formElement.parentElement.querySelector(".form-status");
  if (existing) {
    existing.remove();
  }

  const div = document.createElement("div");
  div.className = "form-status form-status--error";
  div.textContent = message;

  formElement.parentElement.insertBefore(div, formElement);
  formElement.parentElement.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function showSuccessMessage(formElement, message) {
  if (!formElement) return;

  // Verwijder bestaande status-banners rond dit formulier
  const existing = formElement.parentElement.querySelector(".form-status");
  if (existing) {
    existing.remove();
  }

  const div = document.createElement("div");
  div.className = "form-status form-status--success";
  div.textContent = message;

  formElement.parentElement.insertBefore(div, formElement);
  formElement.parentElement.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function clearFormStatus(formElement) {
  if (!formElement) return;
  const existing = formElement.parentElement.querySelector(".form-status");
  if (existing) {
    existing.remove();
  }
}

function getValue(form, selector) {
  const el = form.querySelector(selector);
  return el ? el.value.trim() : "";
}

// ========= DOM Loaded =========

document.addEventListener("DOMContentLoaded", () => {
  // footer-year
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href").substring(1);
      const el = document.getElementById(targetId);
      if (el) {
        event.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // ref-code uit URL
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get("ref");

  // EV-rijder formulier
  const evForm = document.querySelector('form[name="evrijder"]');
  if (evForm) {
    if (refCode) {
      const refInput = evForm.querySelector('input[name="installer_ref"]');
      if (refInput) refInput.value = refCode.toUpperCase();
    }
    evForm.addEventListener("submit", handleEvFormSubmit);
  }

  // Installateur meldt klant aan
  const installateurForm = document.querySelector('form[name="installateur"]');
  if (installateurForm) {
    installateurForm.addEventListener("submit", handleInstallateurFormSubmit);
  }

  // Installateur signup (eigen pagina)
  const installerSignupForm = document.getElementById("installer-signup-form");
  if (installerSignupForm) {
    installerSignupForm.addEventListener("submit", handleInstallerSignup);
  }

  // Contactformulier (Netlify)
  const contactForm = document.querySelector('form[name="contact"]');
  if (contactForm) {
    contactForm.addEventListener("submit", handleContactFormSubmit);
  }

  // tab-panels (installateur / ev / anders) alleen op index.html
  const panels = document.querySelectorAll(".tab-panel");
  const toggles = document.querySelectorAll(".tab-toggle");

  function activatePanel(target) {
    panels.forEach((p) => {
      p.style.display = p.dataset.panel === target ? "block" : "none";
    });
    toggles.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.target === target);
    });
  }

  if (panels.length) {
    // default: installateur zichtbaar
    activatePanel("installateur");
    toggles.forEach((btn) => {
      btn.addEventListener("click", () => {
        activatePanel(btn.dataset.target);
      });
    });
  }
});

// ========= EV-rijder formulier (index.html) =========

async function handleEvFormSubmit(event) {
  event.preventDefault();
  const form = event.target;

  clearFormStatus(form);
  clearAllFieldErrors(form);

  const firstName = getValue(form, 'input[name="voornaam"]');
  const lastName = getValue(form, 'input[name="achternaam"]');
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const email = getValue(form, 'input[name="email"]');
  const phone = getValue(form, 'input[name="telefoon"]');

  // LET OP: charger_count is nu een <select>
  const chargerCountStr = getValue(form, 'select[name="charger_count"]');
  const eigenTerrein = getValue(form, 'select[name="eigen_terrein"]');
  const akkoord = form.querySelector('input[name="akkoord"]')?.checked;
  const installerRefRaw = getValue(form, 'input[name="installer_ref"]');
  const installerRef = installerRefRaw ? installerRefRaw.toUpperCase() : null;

  // velden pakken voor error-styling
  const firstNameInput = form.querySelector('input[name="voornaam"]');
  const lastNameInput = form.querySelector('input[name="achternaam"]');
  const emailInput = form.querySelector('input[name="email"]');
  const phoneInput = form.querySelector('input[name="telefoon"]');
  const chargerSelect = form.querySelector('select[name="charger_count"]');
  const eigenTerreinSelect = form.querySelector('select[name="eigen_terrein"]');
  const akkoordCheckbox = form.querySelector('input[name="akkoord"]');

  // 1. Verplichte velden

  if (!firstName) {
    markFieldError(firstNameInput);
    showFormError(form, "Vul je voornaam in.");
    return;
  }

  if (!lastName) {
    markFieldError(lastNameInput);
    showFormError(form, "Vul je achternaam in.");
    return;
  }

  if (!email) {
    markFieldError(emailInput);
    showFormError(form, "Vul je e-mailadres in.");
    return;
  }

  if (!chargerCountStr) {
    markFieldError(chargerSelect);
    showFormError(form, "Selecteer het aantal laadpunten.");
    return;
  }

  if (!eigenTerrein) {
    markFieldError(eigenTerreinSelect);
    showFormError(form, "Geef aan of het om eigen terrein gaat.");
    return;
  }

  if (!akkoord) {
    markFieldError(akkoordCheckbox);
    showFormError(
      form,
      "Bevestig dat je akkoord gaat met de voorwaarden."
    );
    return;
  }

  // 2. E-mailadres inhoudelijk controleren
  if (!isValidEmail(email)) {
    markFieldError(emailInput);
    showFormError(form, "Vul een geldig e-mailadres in.");
    return;
  }

  // 3. Aantal laadpunten valideren (1–10)
  let chargerCount = null;
  const n = parseInt(chargerCountStr, 10);
  if (Number.isNaN(n) || n < 1 || n > 10) {
    markFieldError(chargerSelect);
    showFormError(form, "Selecteer het aantal laadpunten.");
    return;
  }
  chargerCount = n;

  // 4. ownPremises bepalen
  const ownPremises =
    eigenTerrein === "ja" ? true : eigenTerrein === "nee" ? false : null;

  // Payload voor leads
  const payload = {
    source: "ev_direct",
    lead_type: "ev_user",
    full_name: fullName,
    email,
    phone: phone || null,
    address: null, // veld bestaat nog in DB, maar niet meer in formulier
    own_premises: ownPremises,
    has_charger: null, // idem
    annual_kwh_estimate: null,
    installer_ref: installerRef,
    installer_name: null,
    installer_company: null,
    installer_email: null,
    installer_phone: null,
    consent_terms: !!akkoord,
    notes: null,
    charger_count: chargerCount,
  };

  const { error } = await supabaseClient.from("leads").insert([payload]);

  if (error) {
    console.error("Supabase insert error (ev):", error);
    showFormError(
      form,
      "Er ging iets mis bij het versturen. Probeer het later nog een keer."
    );
    alert(
      "Supabase EV-fout:\n" +
        (error.message || JSON.stringify(error, null, 2))
    );
    return;
  }

  // outbound email loggen
  const displayName = firstName || fullName || "EV-rijder";

  const emailPayload = {
    to_email: email,
    subject: "Je aanmelding voor je laadpaal via Savri is gelukt",
    body:
      "Beste " +
      displayName +
      ",\n\n" +
      "Bedankt voor je aanmelding bij Savri.\n\n" +
      "Je voorinschrijving is ontvangen. We nemen contact met je op zodra de NEa " +
      "haar definitieve regels en planning bekendmaakt.\n\n" +
      "Met vriendelijke groet,\nSavri",
  };

  const { error: emailErr } = await supabaseClient
    .from("outbound_emails")
    .insert([emailPayload]);

  if (emailErr) {
    console.error("Kon outbound email niet wegschrijven (ev):", emailErr);
  }

  form.reset();
  clearAllFieldErrors(form);
  showSuccessMessage(
    form,
    "Bedankt voor je aanmelding. Je ontvangt een bevestiging per e-mail zodra we je inschrijving hebben verwerkt."
  );
}

// ========= Installateur → klant (index.html) =========

async function handleInstallateurFormSubmit(event) {
  event.preventDefault();
  const form = event.target;

  clearFormStatus(form);
  clearAllFieldErrors(form);

  const installerRefRaw = getValue(form, 'input[name="installer_ref"]');
  const installerRef = installerRefRaw ? installerRefRaw.toUpperCase() : "";

  const firstName = getValue(form, 'input[name="klant_voornaam"]');
  const lastName = getValue(form, 'input[name="klant_achternaam"]');
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  const email = getValue(form, 'input[name="klant_email"]');
  const phone = getValue(form, 'input[name="klant_telefoon"]');

  const chargerCountStr = getValue(form, 'select[name="charger_count"]');
  const laadpaalStatus = getValue(form, 'select[name="laadpaal_status"]');
  const eigenTerrein = getValue(form, 'select[name="eigen_terrein"]');
  const notes = getValue(form, 'textarea[name="opmerking"]');
  const akkoord = form.querySelector('input[name="akkoord"]')?.checked;

  // velden voor styling
  const installerRefInput = form.querySelector('input[name="installer_ref"]');
  const firstNameInput = form.querySelector('input[name="klant_voornaam"]');
  const lastNameInput = form.querySelector('input[name="klant_achternaam"]');
  const emailInput = form.querySelector('input[name="klant_email"]');
  const phoneInput = form.querySelector('input[name="klant_telefoon"]');
  const chargerSelect = form.querySelector('select[name="charger_count"]');
  const laadpaalStatusSelect = form.querySelector(
    'select[name="laadpaal_status"]'
  );
  const eigenTerreinSelect = form.querySelector('select[name="eigen_terrein"]');
  const akkoordCheckbox = form.querySelector('input[name="akkoord"]');

  // 1. Verplichte velden

  if (!installerRef) {
    markFieldError(installerRefInput);
    showFormError(form, "Vul je installateurscode in.");
    return;
  }

  if (!firstName) {
    markFieldError(firstNameInput);
    showFormError(form, "Vul de voornaam van de klant in.");
    return;
  }

  if (!lastName) {
    markFieldError(lastNameInput);
    showFormError(form, "Vul de achternaam van de klant in.");
    return;
  }

  if (!email) {
    markFieldError(emailInput);
    showFormError(form, "Vul het e-mailadres van de klant in.");
    return;
  }

  if (!chargerCountStr) {
    markFieldError(chargerSelect);
    showFormError(form, "Selecteer het aantal laadpunten.");
    return;
  }

  if (!laadpaalStatus) {
    markFieldError(laadpaalStatusSelect);
    showFormError(form, "Geef de status van de laadpaal op.");
    return;
  }

  if (!eigenTerrein) {
    markFieldError(eigenTerreinSelect);
    showFormError(form, "Geef aan of het om eigen terrein gaat.");
    return;
  }

  if (!akkoord) {
    markFieldError(akkoordCheckbox);
    showFormError(
      form,
      "Bevestig dat je akkoord gaat met de voorwaarden."
    );
    return;
  }

  // 2. E-mail
  if (!isValidEmail(email)) {
    markFieldError(emailInput);
    showFormError(form, "Vul een geldig e-mailadres in van de klant.");
    return;
  }

  // 3. Telefoon (optioneel)
  if (phone && !isValidMobile(phone)) {
    markFieldError(phoneInput);
    showFormError(
      form,
      "Vul een geldig mobiel nummer in (06 of +316) van de klant."
    );
    return;
  }

  // 4. Laadpaal-status en ownPremises afleiden
  let hasCharger = null;
  if (laadpaalStatus === "ja") hasCharger = "ja";
  else if (laadpaalStatus === "nee") hasCharger = "nee_gepland";
  else if (laadpaalStatus === "onzeker") hasCharger = "onzeker";

  const ownPremises =
    eigenTerrein === "ja" ? true : eigenTerrein === "nee" ? false : null;

  // 5. Aantal laadpunten (1–10)
  let chargerCount = null;
  const n = parseInt(chargerCountStr, 10);
  if (Number.isNaN(n) || n < 1 || n > 10) {
    markFieldError(chargerSelect);
    showFormError(form, "Selecteer het aantal laadpunten.");
    return;
  }
  chargerCount = n;

  const payload = {
    source: "via_installateur",
    lead_type: "ev_user",
    full_name: fullName,
    email,
    phone: phone || null,
    address: null,
    own_premises: ownPremises,
    has_charger: hasCharger,
    annual_kwh_estimate: null,
    charger_count: chargerCount,
    installer_ref: installerRef,
    installer_name: null,
    installer_company: null,
    installer_email: null,
    installer_phone: null,
    consent_terms: !!akkoord,
    notes: notes || null,
  };

  const { error } = await supabaseClient.from("leads").insert([payload]);

  if (error) {
    console.error("Supabase insert error (installateur):", error);
    showFormError(
      form,
      "Er ging iets mis bij het versturen. Probeer het later nog een keer."
    );
    alert(
      "Supabase installateur-fout:\n" +
        (error.message || JSON.stringify(error, null, 2))
    );
    return;
  }

  // outbound email loggen naar eindklant
  const displayName = firstName || fullName || "klant";

  const emailPayload = {
    to_email: email,
    subject: "Je laadpaal-aanmelding via je installateur is ontvangen",
    body:
      "Beste " +
      displayName +
      ",\n\n" +
      "Je installateur heeft je aangemeld bij Savri voor de voorbereiding op mogelijke ERE’s.\n\n" +
      "We nemen contact met je op zodra er concrete vervolgstappen zijn en de NEa haar regels heeft gepubliceerd.\n\n" +
      "Met vriendelijke groet,\nSavri",
  };

  const { error: emailErr } = await supabaseClient
    .from("outbound_emails")
    .insert([emailPayload]);

  if (emailErr) {
    console.error(
      "Kon outbound email niet wegschrijven (via installateur):",
      emailErr
    );
  }

  form.reset();
  clearAllFieldErrors(form);
  showSuccessMessage(
    form,
    "De klant is succesvol aangemeld. De klant ontvangt een bevestiging per e-mail."
  );
}

// ========= Installateur signup (installateur.html) =========

function generateRefCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

async function handleInstallerSignup(event) {
  event.preventDefault();
  const form = event.target;

  clearFormStatus(form);
  clearAllFieldErrors(form);

  const company = getValue(form, 'input[name="company_name"]');
  const firstName = getValue(form, 'input[name="contact_first_name"]');
  const lastName = getValue(form, 'input[name="contact_last_name"]');
  const contact = [firstName, lastName].filter(Boolean).join(" ");
  const email = getValue(form, 'input[name="email"]');
  const phone = getValue(form, 'input[name="phone"]');
  const kvk = getValue(form, 'input[name="kvk"]');
  const akkoord = form.querySelector('input[name="akkoord"]')?.checked;

  const companyInput = form.querySelector('input[name="company_name"]');
  const contactFirstInput = form.querySelector(
    'input[name="contact_first_name"]'
  );
  const contactLastInput = form.querySelector(
    'input[name="contact_last_name"]'
  );
  const emailInput = form.querySelector('input[name="email"]');
  const phoneInput = form.querySelector('input[name="phone"]');
  const akkoordCheckbox = form.querySelector('input[name="akkoord"]');

  // 1. Verplichte velden

  if (!company) {
    markFieldError(companyInput);
    showFormError(form, "Vul de bedrijfsnaam in.");
    return;
  }

  if (!firstName) {
    markFieldError(contactFirstInput);
    showFormError(form, "Vul de voornaam van de contactpersoon in.");
    return;
  }

  if (!lastName) {
    markFieldError(contactLastInput);
    showFormError(form, "Vul de achternaam van de contactpersoon in.");
    return;
  }

  if (!email) {
    markFieldError(emailInput);
    showFormError(form, "Vul je e-mailadres in.");
    return;
  }

  if (!akkoord) {
    markFieldError(akkoordCheckbox);
    showFormError(
      form,
      "Bevestig dat je akkoord gaat met de voorwaarden."
    );
    return;
  }

  // 2. E-mail
  if (!isValidEmail(email)) {
    markFieldError(emailInput);
    showFormError(form, "Vul een geldig e-mailadres in.");
    return;
  }

  // 3. Telefoon (optioneel)
  if (phone && !isValidMobile(phone)) {
    markFieldError(phoneInput);
    showFormError(
      form,
      "Vul een geldig mobiel nummer in (06 of +316)."
    );
    return;
  }

  const refCode = generateRefCode(6);

  const payload = {
    ref_code: refCode,
    company_name: company,
    contact_name: contact,
    email,
    phone: phone || null,
    kvk: kvk || null,
    active: true,
    notes: null,
  };

  const { error } = await supabaseClient.from("installers").insert([payload]);

  if (error) {
    console.error("Supabase installer-signup error:", error);
    showFormError(
      form,
      "Er ging iets mis bij het opslaan. Probeer het later opnieuw."
    );
    alert(
      "Supabase installateur-signup-fout:\n" +
        (error.message || JSON.stringify(error, null, 2))
    );
    return;
  }

  const emailPayload = {
    to_email: email,
    subject: "Je installateurscode voor Savri",
    body:
      "Beste " +
      contact +
      ",\n\n" +
      "Bedankt voor je aanmelding bij Savri.\n\n" +
      "Je persoonlijke installateurscode is: " +
      refCode +
      ".\n\n" +
      "Gebruik deze code bij het aanmelden van laadpalen op savri.nl.\n\n" +
      "Met vriendelijke groet,\nSavri",
  };

  const { error: emailErr } = await supabaseClient
    .from("outbound_emails")
    .insert([emailPayload]);

  if (emailErr) {
    console.error(
      "Kon outbound email niet wegschrijven (installer signup):",
      emailErr
    );
  }

  form.reset();
  clearAllFieldErrors(form);
  showSuccessMessage(
    form,
    "Je aanmelding als installateur is ontvangen. Je ontvangt zo je persoonlijke installateurscode per e-mail."
  );
}

// ========= Contactformulier (Netlify) =========

async function handleContactFormSubmit(event) {
  event.preventDefault();
  const form = event.target;

  clearFormStatus(form);
  clearAllFieldErrors(form);

  const nameValue = getValue(form, 'input[name="naam"]');
  const emailValue = getValue(form, 'input[name="email"]');
  const subjectValue = getValue(form, 'input[name="onderwerp"]');
  const messageValue = getValue(form, 'textarea[name="bericht"]');

  const nameInput = form.querySelector('input[name="naam"]');
  const emailInput = form.querySelector('input[name="email"]');
  const subjectInput = form.querySelector('input[name="onderwerp"]');
  const messageInput = form.querySelector('textarea[name="bericht"]');

  // Verplichte velden
  if (!nameValue) {
    markFieldError(nameInput);
    showFormError(form, "Vul je naam in.");
    return;
  }

  if (!emailValue) {
    markFieldError(emailInput);
    showFormError(form, "Vul je e-mailadres in.");
    return;
  }

  if (!subjectValue) {
    markFieldError(subjectInput);
    showFormError(form, "Vul het onderwerp in.");
    return;
  }

  if (!messageValue) {
    markFieldError(messageInput);
    showFormError(form, "Vul je bericht in.");
    return;
  }

  if (!isValidEmail(emailValue)) {
    markFieldError(emailInput);
    showFormError(form, "Vul een geldig e-mailadres in.");
    return;
  }

  // Als alles goed is, mag Netlify het formulier verder afhandelen
  // door het alsnog "normaal" te submitten.
  form.submit();
}
