// ========= Supabase configuratie =========
const SUPABASE_URL = "https://yzngrurkpfuqgexbhzgl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bmdydXJrcGZ1cWdleGJoemdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNjYxMjYsImV4cCI6MjA4MDg0MjEyNn0.L7atEcmNvX2Wic0eSM9jWGdFUadIhH21EUFNtzP4YCk";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========= Helper functies =========

function isValidMobile(phone) {
  if (!phone) return false;
  const trimmed = phone.trim();
  const patternLocal = /^0[1-9][0-9]{8}$/;
  const patternIntl = /^\+31[1-9][0-9]{8}$/;
  return patternLocal.test(trimmed) || patternIntl.test(trimmed);
}

function showFormError(form, message) {
  let errorEl = form.querySelector(".form-error");
  if (!errorEl) {
    errorEl = document.createElement("p");
    errorEl.className = "form-error";
    form.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFormError(form) {
  const errorEl = form.querySelector(".form-error");
  if (errorEl) errorEl.textContent = "";
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

  // ==== ref-code uit URL ====
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get("ref");

  const evForm = document.querySelector('form[name="evrijder"]');
  if (evForm) {
    if (refCode) {
      const refInput = evForm.querySelector('input[name="installer_ref"]');
      if (refInput) refInput.value = refCode;
    }
    evForm.addEventListener("submit", handleEvFormSubmit);
  }

  const installateurForm = document.querySelector('form[name="installateur"]');
  if (installateurForm) {
    installateurForm.addEventListener("submit", handleInstallateurFormSubmit);
  }

  const installerSignupForm = document.getElementById("installer-signup-form");
    if (installerSignupForm) {
    installerSignupForm.addEventListener("submit", handleInstallerSignup);
  }


  // laten verdwijenn van de panels? <-- daan invoer
  const panels = document.querySelectorAll(".tab-panel");
  const toggles = document.querySelectorAll(".tab-toggle");

  function activatePanel(target) {
    panels.forEach(p => {
      p.style.display = (p.dataset.panel === target) ? "block" : "none";
    });
    toggles.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.target === target);
    });
  }

  // default: installateur-modus
  activatePanel("installateur");

  toggles.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      activatePanel(target);
    });
  });
});

// ========= EV-rijder formulier =========

async function handleEvFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  clearFormError(form);

  const fullName = form.querySelector('input[name="naam"]')?.value.trim();
  const email = form.querySelector('input[name="email"]')?.value.trim();
  const phone = form.querySelector('input[name="telefoon"]')?.value.trim();
  const address = form.querySelector('input[name="adres"]')?.value.trim();
  const laadpaalStatus = form.querySelector('select[name="laadpaal_status"]')?.value;
  const eigenTerrein = form.querySelector('select[name="eigen_terrein"]')?.value;
  const annualKwhStr = form.querySelector('input[name="kwh_per_jaar"]')?.value.trim();
  const akkoord = form.querySelector('input[name="akkoord"]')?.checked;
  const installerRef = form.querySelector('input[name="installer_ref"]')?.value.trim();

  if (!fullName || !email || !akkoord) {
    showFormError(form, "Naam, e-mail en akkoord zijn verplicht.");
    return;
  }

  if (!email.includes("@")) {
    showFormError(form, "Controleer je e-mailadres.");
    return;
  }

  if (phone && !isValidMobile(phone)) {
    showFormError(form, "Vul een geldig mobiel nummer in (06 of +316).");
    return;
  }

  let annualKwh = null;
  if (annualKwhStr) {
    const n = parseInt(annualKwhStr, 10);
    if (Number.isNaN(n) || n <= 0) {
      showFormError(form, "Geschat kWh moet een positief getal zijn.");
      return;
    }
    annualKwh = n;
  }

  let hasCharger = null;
  if (laadpaalStatus === "ja") hasCharger = "ja";
  else if (laadpaalStatus === "nee") hasCharger = "nee_gepland";
  else if (laadpaalStatus === "onzeker") hasCharger = "onzeker";

  const ownPremises =
    eigenTerrein === "ja" ? true :
    eigenTerrein === "nee" ? false :
    null;

  const payload = {
    source: "ev_direct",
    lead_type: "ev_user",
    full_name: fullName,
    email,
    phone,
    address,
    own_premises: ownPremises,
    has_charger: hasCharger,
    annual_kwh_estimate: annualKwh,
    installer_ref: installerRef || null,
    installer_name: null,
    installer_company: null,
    installer_email: null,
    installer_phone: null,
    consent_terms: !!akkoord,
    notes: null
  };

 const { error } = await supabaseClient.from("leads").insert([payload]);

if (error) {
  console.error("Supabase insert error (ev):", error);
  alert("Supabase EV-fout:\n" + (error.message || JSON.stringify(error, null, 2)));
  showFormError(form, "Er ging iets mis bij het versturen. Probeer het later nog een keer.");
  return;
}


  form.reset();
  alert("Bedankt! Je voorinschrijving is ontvangen.");
}

// ========= Installateur levert klant aan =========

async function handleInstallateurFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  clearFormError(form);

  const installerRef = form.querySelector('input[name="installer_ref"]')?.value.trim();
  const fullName = form.querySelector('input[name="klant_naam"]')?.value.trim();
  const email = form.querySelector('input[name="klant_email"]')?.value.trim();
  const phone = form.querySelector('input[name="klant_telefoon"]')?.value.trim();
  const address = form.querySelector('input[name="klant_adres"]')?.value.trim();
  const laadpaalStatus = form.querySelector('select[name="laadpaal_status"]')?.value;
  const eigenTerrein = form.querySelector('select[name="eigen_terrein"]')?.value;

  const installerCompany = form.querySelector('input[name="installateur_bedrijfsnaam"]')?.value.trim();
  const installerName = form.querySelector('input[name="installateur_contactpersoon"]')?.value.trim();
  const installerEmail = form.querySelector('input[name="installateur_email"]')?.value.trim();
  const installerPhone = form.querySelector('input[name="installateur_telefoon"]')?.value.trim();
  const notes = form.querySelector('textarea[name="opmerking"]')?.value.trim();
  const akkoord = form.querySelector('input[name="akkoord"]')?.checked;

  if (!installerRef || !fullName || !email || !akkoord) {
  showFormError(form, "Code, klantnaam, e-mail en akkoord zijn verplicht.");
  return;
  }

  if (!email.includes("@")) {
    showFormError(form, "Controleer het e-mailadres van de klant.");
    return;
  }

  if (phone && !isValidMobile(phone)) {
    showFormError(form, "Voer een geldig mobiel nummer van de klant in.");
    return;
  }

  let hasCharger = null;
  if (laadpaalStatus === "ja") hasCharger = "ja";
  else if (laadpaalStatus === "nee") hasCharger = "nee_gepland";
  else if (laadpaalStatus === "onzeker") hasCharger = "onzeker";

  const ownPremises =
    eigenTerrein === "ja" ? true :
    eigenTerrein === "nee" ? false :
    null;

  const payload = {
  source: "via_installateur",
  lead_type: "ev_user",
  full_name: fullName,
  email,
  phone,
  address,
  own_premises: ownPremises,
  has_charger: hasCharger,
  annual_kwh_estimate: null,
  installer_ref: installerRef,
  // installer_* kolommen mag je op null laten
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
  alert("Supabase installateur-fout:\n" + (error.message || JSON.stringify(error, null, 2)));
  showFormError(form, "Er ging iets mis bij het versturen. Probeer het later nog een keer.");
  return;
}


  form.reset();
  alert("Klant is succesvol aangemeld.");
}


// ========= Installateur aanmeld form  =========

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
  clearFormError(form);

  const company = form.company_name.value.trim();
  const contact = form.contact_name.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const akkoord = form.akkoord.checked;

  if (!company || !contact || !email || !akkoord) {
    showFormError(form, "Vul alle verplichte velden in.");
    return;
  }

  const refCode = generateRefCode(6);

  const payload = {
    ref_code: refCode,
    company_name: company,
    contact_name: contact,
    email,
    phone,
    active: true,
    notes: null,
  };

  const { error } = await supabaseClient.from("installers").insert([payload]);

  if (error) {
    console.error("Supabase installer-signup error:", error);
    alert("Er ging iets mis bij het opslaan. Probeer het later opnieuw.");
    return;
  }

  // Voor nu: toon de code direct. Later vervang je dit door een nette e-mail.
  form.reset();
  alert(
    "Bedankt voor je aanmelding.\nJe installateurscode is: " +
      refCode +
      "\nBewaar deze code goed, je hebt hem nodig om klanten aan te melden."
  );
}
