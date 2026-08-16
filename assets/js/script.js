// assets/js/script.js

// ======================================================
// 0) Config (komt uit /assets/js/config.js)
// ======================================================
const SUPABASE_URL = window.ENVAL?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.ENVAL?.SUPABASE_ANON_KEY;
const API_BASE = window.ENVAL?.API_BASE;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !API_BASE) {
  console.error("ENVAL config ontbreekt. Laad eerst /assets/js/config.runtime.js + /assets/js/config.js vóór script.js");
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

    // reset dropdown state when closing
    if (!open) {
      const dd = nav.querySelector(".nav-dd");
      const ddBtn = nav.querySelector(".nav-dd-btn");
      dd?.classList.remove("is-open");
      ddBtn?.setAttribute("aria-expanded", "false");
    }
  };

  btn.addEventListener("click", () => {
    const open = document.body.classList.contains("nav-open");
    setOpen(!open);
  });

  // Mobile: toggle "Informatie" dropdown within open nav
  const ddBtn = nav.querySelector(".nav-dd-btn");
  if (ddBtn) {
    ddBtn.addEventListener("click", (e) => {
      // only behave like dropdown in mobile mode when nav is open
      if (window.innerWidth >= 768) return;
      if (!document.body.classList.contains("nav-open")) return;

      e.preventDefault();
      const dd = ddBtn.closest(".nav-dd");
      if (!dd) return;

      const isOpen = dd.classList.contains("is-open");
      dd.classList.toggle("is-open", !isOpen);
      ddBtn.setAttribute("aria-expanded", !isOpen ? "true" : "false");
    });
  }

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
    activate("ev");
    toggles.forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.target)));
  }

  // Bind forms (fail-safe: 1 kapot form mag de rest niet breken)
  try { document.querySelector('form[name="contact"]')?.addEventListener("submit", handleContactForm); }
  catch (e) { console.error("bind contact failed", e); }
});

// ======================================================
// 7) Handlers
// ======================================================

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
    showToast("Dank je wel. Uw bericht is ontvangen.", "success");
  } catch (err) {
    console.error("contact exception:", err);
    showToast("Er ging iets mis (netwerk). Probeer later opnieuw.", "error");
  } finally {
    lockSubmit(btn, false);
  }
}
