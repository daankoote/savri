// assets/js/api.js

export function getDossierIdFromUrl() {
  const u = new URL(window.location.href);
  return u.searchParams.get("d");
}

export function getLinkTokenFromUrl() {
  const u = new URL(window.location.href);
  return u.searchParams.get("t");
}

const SESSION_TOKEN_PREFIX = "enval_session_token:";

function sessionKeyForDossier(dossierId) {
  if (!dossierId) return null;
  return `${SESSION_TOKEN_PREFIX}${String(dossierId)}`;
}

export function getSessionToken(dossierId) {
  const k = sessionKeyForDossier(dossierId);
  if (!k) return null;
  return localStorage.getItem(k);
}

export function setSessionToken(dossierId, tok) {
  if (!tok) return;
  const k = sessionKeyForDossier(dossierId);
  if (!k) return;
  localStorage.setItem(k, String(tok));
}

export function clearSessionToken(dossierId) {
  const k = sessionKeyForDossier(dossierId);
  if (!k) return;
  localStorage.removeItem(k);
}

// optional legacy cleanup
export function cleanupLegacySessionKey() {
  try {
    if (localStorage.getItem("enval_session_token")) {
      localStorage.removeItem("enval_session_token");
    }
  } catch (_) {}
}

export async function apiPost(functionName, body, { idempotencyKey } = {}) {
  const url = `/.netlify/functions/${functionName}`;

  const headers = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}