// ========= Supabase configuratie =========
// LET OP: vervang deze twee waarden door je echte values uit Supabase.
const SUPABASE_URL = "https://yzngrurkpfuqgexbhzgl.supabase.co";  // Project URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bmdydXJrcGZ1cWdleGJoemdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNjYxMjYsImV4cCI6MjA4MDg0MjEyNn0.L7atEcmNvX2Wic0eSM9jWGdFUadIhH21EUFNtzP4YCk";             // anon public key

// Supabase-client maken waarmee we naar de database praten.
// Deze client wordt gebruikt in de submit-handlers van de formulieren.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Savri - basis JavaScript //
// Doel 1: automatisch het juiste jaartal in de footer zetten. //
// Doel 2 (optioneel): smooth scrolling voor interne links. //

document.addEventListener("DOMContentLoaded", function () {
    // // 1) Dynamisch jaartal in de footer zetten //
    var yearSpan = document.getElementById("year");
    if (yearSpan) {
        var currentYear = new Date().getFullYear();
        yearSpan.textContent = currentYear;
    }

    // // 2) Smooth scroll voor navigatielinks die naar een ID verwijzen (bijv. #installateurs) //
    var links = document.querySelectorAll('a[href^="#"]');

    links.forEach(function (link) {
        link.addEventListener("click", function (event) {
            var targetId = this.getAttribute("href").substring(1); // haalt de tekst na het # teken op
            var targetElement = document.getElementById(targetId);

            if (targetElement) {
                event.preventDefault(); // voorkomt de standaard "direct naar sectie springen"

                // Scrollt soepel naar de gekozen sectie //
                targetElement.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    });
});

// ========= Formulier handlers koppelen na het laden van de pagina =========
document.addEventListener("DOMContentLoaded", () => {
  // Formulier voor EV-rijders (directe leads)
  const evForm = document.querySelector('form[name="evrijder"]');
  if (evForm) {
    evForm.addEventListener("submit", handleEvFormSubmit);
  }

  // Formulier voor installateurs die een klant aanleveren
  const installateurForm = document.querySelector('form[name="installateur"]');
  if (installateurForm) {
    installateurForm.addEventListener("submit", handleInstallateurFormSubmit);
  }
});

// ========= Validatie helpers =========

// Eenvoudige NL-mobiel check: 06xxxxxxxx of +316xxxxxxxx
function isValidMobile(phone) {
  if (!phone) return false;

  const trimmed = phone.trim();
  const patternLocal = /^0[1-9][0-9]{8}$/;     // 10 cijfers, begint met 0
  const patternIntl  = /^\+31[1-9][0-9]{8}$/;  // +31...
  return patternLocal.test(trimmed) || patternIntl.test(trimmed);
}

function showFormError(form, message) {
  // // Toon foutmelding onderaan het formulier. //
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


// ========= EV-rijder formulier submit =========
async function handleEvFormSubmit(event) {
  event.preventDefault(); // // Voorkom standaard form submit (page reload / Netlify). //

  const form = event.target;
  clearFormError(form);

  // // Velden ophalen uit het formulier. //
  const fullName = form.querySelector('input[name="naam"]')?.value.trim();
  const email = form.querySelector('input[name="email"]')?.value.trim();
  const phone = form.querySelector('input[name="telefoon"]')?.value.trim();  // voeg dit input-veld toe in HTML
  const address = form.querySelector('input[name="adres"]')?.value.trim();
  const laadpaalStatus = form.querySelector('select[name="laadpaal_status"]')?.value;
  const eigenTerrein = form.querySelector('select[name="eigen_terrein"]')?.value;
  const installerName = form.querySelector('input[name="installateur"]')?.value.trim();
  const annualKwhStr = form.querySelector('input[name="kwh_per_jaar"]')?.value.trim(); // nieuw veld in HTML
  const akkoord = form.querySelector('input[name="akkoord"]')?.checked;

  // // Basis sanity checks. //
  if (!fullName || !email || !akkoord) {
    showFormError(form, "Vul in ieder geval naam, e-mailadres in en bevestig de voorwaarden.");
    return;
  }

  // // E-mail wordt al deels door type="email" gevalideerd, dit is extra defensief. //
  if (!email.includes("@") || !email.includes(".")) {
    showFormError(form, "Controleer je e-mailadres.");
    return;
  }

  if (phone && !isValidMobile(phone)) {
    showFormError(form, "Vul een geldig mobiel nummer in (06 of +316).");
    return;
  }

  let annualKwh = null;
  if (annualKwhStr) {
    const parsed = parseInt(annualKwhStr, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      showFormError(form, "Geschat verbruik (kWh) moet een positief getal zijn.");
      return;
    }
    annualKwh = parsed;
  }

  // // Map laadpaalStatus naar een vaste value voor de database. //
  let hasCharger = null;
  if (laadpaalStatus === "ja") hasCharger = "ja";
  else if (laadpaalStatus === "nee") hasCharger = "nee_gepland";
  else if (laadpaalStatus === "onzeker") hasCharger = "onzeker";

  const ownPremises =
    eigenTerrein === "ja" ? true : eigenTerrein === "nee" ? false : null;

  // // Payload opbouwen voor Supabase. //
  const payload = {
    source: "ev_direct",          // dit is een directe lead via de site
    lead_type: "ev_user",
    full_name: fullName,
    email,
    phone,
    address,
    own_premises: ownPremises,
    has_charger: hasCharger,
    annual_kwh_estimate: annualKwh,
    installer_name: installerName || null,
    consent_terms: !!akkoord,
    notes: null
  };

  // // Insert naar Supabase. //
  const { error } = await supabaseClient.from("leads").insert([payload]);

  if (error) {
    console.error("Supabase insert error (ev):", error);
    showFormError(form, "Er ging iets mis bij het versturen. Probeer het later nog een keer.");
    return;
  }

  // // Succes: formulier leegmaken en simpele bedankmelding tonen. //
  form.reset();
  alert("Bedankt voor je aanmelding. We houden je op de hoogte zodra er meer duidelijk is over ERE’s.");
}


// ========= Installateur levert klant aan =========
async function handleInstallateurFormSubmit(event) {
  event.preventDefault();

  const form = event.target;
  clearFormError(form);

  // // Klantgegevens. //
  const fullName = form.querySelector('input[name="klant_naam"]')?.value.trim();
  const email = form.querySelector('input[name="klant_email"]')?.value.trim();
  const phone = form.querySelector('input[name="klant_telefoon"]')?.value.trim();
  const address = form.querySelector('input[name="klant_adres"]')?.value.trim();
  const laadpaalStatus = form.querySelector('select[name="laadpaal_status"]')?.value;
  const eigenTerrein = form.querySelector('select[name="eigen_terrein"]')?.value;

  // // Installateurgegevens. //
  const installerCompany = form.querySelector('input[name="installateur_bedrijfsnaam"]')?.value.trim();
  const installerName = form.querySelector('input[name="installateur_contactpersoon"]')?.value.trim();
  const installerEmail = form.querySelector('input[name="installateur_email"]')?.value.trim();
  const installerPhone = form.querySelector('input[name="installateur_telefoon"]')?.value.trim();
  const notes = form.querySelector('textarea[name="opmerking"]')?.value.trim();

  const akkoord = form.querySelector('input[name="akkoord"]')?.checked;

  // // Validatie. //
  if (!fullName || !email || !installerCompany || !akkoord) {
    showFormError(form, "Vul minimaal klantnaam, klant-e-mail, bedrijfsnaam en akkoord in.");
    return;
  }

  if (!email.includes("@") || !email.includes(".")) {
    showFormError(form, "Controleer het e-mailadres van de klant.");
    return;
  }

  if (phone && !isValidMobile(phone)) {
    showFormError(form, "Vul een geldig mobiel nummer van de klant in.");
    return;
  }

  let hasCharger = null;
  if (laadpaalStatus === "ja") hasCharger = "ja";
  else if (laadpaalStatus === "nee") hasCharger = "nee_gepland";
  else if (laadpaalStatus === "onzeker") hasCharger = "onzeker";

  const ownPremises =
    eigenTerrein === "ja" ? true : eigenTerrein === "nee" ? false : null;

  const payload = {
    source: "via_installateur",
    lead_type: "ev_user",
    full_name: fullName,
    email,
    phone,
    address,
    own_premises: ownPremises,
    has_charger: hasCharger,
    annual_kwh_estimate: null,   // kun je later toevoegen als veld
    installer_name: installerName || null,
    installer_company: installerCompany || null,
    installer_email: installerEmail || null,
    installer_phone: installerPhone || null,
    consent_terms: !!akkoord,
    notes: notes || null
  };

  const { error } = await supabaseClient.from("leads").insert([payload]);

  if (error) {
    console.error("Supabase insert error (installateur):", error);
    showFormError(form, "Er ging iets mis bij het versturen. Probeer het later nog een keer.");
    return;
  }

  form.reset();
  alert("Lead is succesvol aangemeld. De eindgebruiker ontvangt later bericht van Savri over het vervolg.");
}
