// assets/js/api.js
// versie 260312_01
//
// Frontend shared API helpers (NON-module, GEEN exports)
// Wordt gebruikt door: dossier.js (en later andere pages)
// Vereist: assets/js/config.js vooraf geladen

console.log("ENVAL api.js versie 260312_01");

window.ENVAL = window.ENVAL || {};
window.ENVAL.api = window.ENVAL.api || {};

const SESSION_TOKEN_PREFIX = "enval_session_token:";

function sessionKeyForDossier(dossierId) {
  if (!dossierId) return null;
  return `${SESSION_TOKEN_PREFIX}${String(dossierId)}`;
}

window.ENVAL.api.getDossierIdFromUrl = function getDossierIdFromUrl() {
  const u = new URL(window.location.href);
  return u.searchParams.get("d");
};

window.ENVAL.api.getLinkTokenFromUrl = function getLinkTokenFromUrl() {
  const u = new URL(window.location.href);
  return u.searchParams.get("t");
};

window.ENVAL.api.getSessionToken = function getSessionToken(dossierId) {
  const k = sessionKeyForDossier(dossierId);
  if (!k) return null;
  return localStorage.getItem(k);
};

window.ENVAL.api.setSessionToken = function setSessionToken(dossierId, tok) {
  if (!tok) return;
  const k = sessionKeyForDossier(dossierId);
  if (!k) return;
  localStorage.setItem(k, String(tok));
};

window.ENVAL.api.clearSessionToken = function clearSessionToken(dossierId) {
  const k = sessionKeyForDossier(dossierId);
  if (!k) return;
  localStorage.removeItem(k);
};

window.ENVAL.api.cleanupLegacySessionKey = function cleanupLegacySessionKey() {
  try {
    if (localStorage.getItem("enval_session_token")) {
      localStorage.removeItem("enval_session_token");
    }
  } catch (_) {}
};

window.ENVAL.api.newIdempotencyKey = function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

window.ENVAL.api.apiPost = async function apiPost(functionName, body, options = {}) {
  const url = `${window.ENVAL.API_BASE}/${functionName}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const idem =
    options.idempotencyKey ||
    window.ENVAL.api.newIdempotencyKey();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: window.ENVAL.edgeHeaders({ "Idempotency-Key": idem }),
        body: JSON.stringify(body || {}),
      });

      if (attempt === 1 && (res.status === 502 || res.status === 503 || res.status === 504)) {
        await sleep(450);
        continue;
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        const msg = json?.error || json?.message || `Request failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.body = json;
        throw err;
      }

      return json;
    } catch (e) {
      const msg = String(e?.message || e);
      const isNetwork =
        /NetworkError/i.test(msg) ||
        /Failed to fetch/i.test(msg) ||
        /fetch/i.test(msg);

      if (attempt === 1 && isNetwork) {
        await sleep(450);
        continue;
      }

      throw e;
    }
  }
};
