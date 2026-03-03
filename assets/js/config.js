// versie 260219_10 (NO-SECRETS)
//
// /assets/js/config.js
// Enige bron van waarheid voor frontend config helpers (GEEN modules, GEEN exports)
// Wordt gebruikt door: script.js en dossier.js (window.ENVAL.*)
//
// BELANGRIJK:
// - Deze file bevat GEEN secrets.
// - Runtime secrets komen uit: /assets/js/config.runtime.js (generated, gitignored)

console.log("ENVAL config.js versie 260219_10 (no-secrets)");

window.ENVAL = window.ENVAL || {};

// ======================================================
// 0) UI caps (must match backend)
// ======================================================
window.ENVAL.UI_MAX_CHARGERS = 4;

// ======================================================
// 1) Supabase config (runtime injected)
// ======================================================
// Verwacht dat /assets/js/config.runtime.js deze 2 velden vult.
// Deze placeholders zijn bewust "kapot" zodat je het meteen ziet als runtime injectie mist.
window.ENVAL.SUPABASE_URL = window.ENVAL.SUPABASE_URL || "SUPABASE_URL__MISSING_RUNTIME_INJECT";
window.ENVAL.SUPABASE_ANON_KEY = window.ENVAL.SUPABASE_ANON_KEY || "SUPABASE_ANON_KEY__MISSING_RUNTIME_INJECT";

// Edge functions base
window.ENVAL.API_BASE = `${window.ENVAL.SUPABASE_URL}/functions/v1`;

/**
 * edgeHeaders(extraHeaders)
 * Doel:
 * - Standaard headers voor Supabase Edge Functions
 * - Voeg optionele headers toe (bv. Idempotency-Key)
 */
window.ENVAL.edgeHeaders = function edgeHeaders(extraHeaders) {
  const key = window.ENVAL.SUPABASE_ANON_KEY;

  const h = {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  if (extraHeaders && typeof extraHeaders === "object") {
    Object.assign(h, extraHeaders);
  }
  return h;
};

// Debug helper (optioneel)
window.ENVAL.debugAnonIss = function () {
  try {
    return JSON.parse(atob(window.ENVAL.SUPABASE_ANON_KEY.split(".")[1])).iss;
  } catch (e) {
    return "decode_failed";
  }
};
