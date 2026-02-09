//supabase/functions/api-dossier-address-save/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import {
  insertAuditFailOpen,
  tryGetIdempotentResponse,
  storeIdempotentResponseFailOpen,
} from "../_shared/audit.ts";

// -------------------- CORS (strict allowlist) --------------------
function parseAllowedOrigins(): string[] {
  const raw =
    Deno.env.get("ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_ORIGIN") ??
    "https://www.enval.nl,https://enval.nl";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : (ALLOWED_ORIGINS[0] || "https://www.enval.nl");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, Idempotency-Key, x-request-id, X-Request-Id",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeadersFor(req) },
  });
}

function bad(req: Request, msg: string, code = 400) {
  return json(req, code, { ok: false, error: msg });
}

// -------------------- ENV / helpers --------------------
function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getEnvironment(): string {
  return (
    Deno.env.get("ENVIRONMENT") ||
    Deno.env.get("ENV") ||
    Deno.env.get("APP_ENV") ||
    "unknown"
  ).toLowerCase();
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function nowIso() {
  return new Date().toISOString();
}

function actorRefForCustomer(dossierId: string, tokenHash: string): string {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

// -------------------- Address helpers --------------------
function normalizePostcode(pc: string) {
  return (pc || "").toUpperCase().replace(/\s+/g, "").trim();
}
function isValidPostcode(pc: string) {
  return /^[0-9]{4}[A-Z]{2}$/.test(normalizePostcode(pc));
}
function isValidHouseNumber(v: string) {
  return /^[1-9][0-9]{0,4}$/.test((v || "").trim());
}
function normalizeSuffix(v: string) {
  const t = (v || "").trim();
  if (!t) return null;
  return t.slice(0, 12);
}

// -------------------- PDOK lookup (Locatieserver) --------------------
const PDOK_FREE_URL =
  Deno.env.get("PDOK_FREE_URL") ??
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

type PdokDoc = {
  straatnaam?: string;
  woonplaatsnaam?: string;
  postcode?: string;
  huisnummer?: string | number;
  huisletter?: string;
  huisnummertoevoeging?: string;
  weergavenaam?: string;
  id?: string;
};

function norm(s: unknown) {
  return String(s ?? "").trim();
}

function suffixMatches(doc: PdokDoc, suf: string | null) {
  if (!suf) return true;

  const s = String(suf).toUpperCase().replace(/[\s\-]/g, "");
  const hl = norm((doc as any).huisletter).toUpperCase().replace(/[\s\-]/g, "");
  const ht = norm((doc as any).huisnummertoevoeging).toUpperCase().replace(/[\s\-]/g, "");

  if (hl && hl === s) return true;
  if (ht && ht === s) return true;

  if (hl && ht) {
    if ((hl + ht) === s) return true;
    if ((ht + hl) === s) return true;
  }

  return false;
}

function extractSuffixFromWeergave(weergave: string, hn: string) {
  const w = String(weergave || "").toUpperCase().replace(/\s+/g, " ").trim();
  const hnClean = String(hn || "").trim();

  const re1 = new RegExp(`\\b${hnClean}\\s*[-\\s]\\s*([0-9A-Z]+)\\b`, "i");
  const m1 = w.match(re1);
  if (m1 && m1[1]) return String(m1[1]).toUpperCase().replace(/[\s\-]/g, "");

  return null;
}

function normalizeUserSuffix(suf: string | null) {
  if (!suf) return null;
  return String(suf).toUpperCase().replace(/[\s\-]/g, "").trim() || null;
}

function splitAlphaNumSuffix(s: string) {
  const t = String(s || "").toUpperCase().replace(/[\s\-]/g, "");
  const num = (t.match(/[0-9]+/g) || []).join("") || null;
  const alpha = (t.match(/[A-Z]+/g) || []).join("") || null;
  return { num, alpha };
}

async function pdokLookupAddress(pc: string, hn: string, suf: string | null) {
  const userSuf = normalizeUserSuffix(suf);

  const qBase = `${pc} ${hn}`;
  const url = new URL(PDOK_FREE_URL);
  url.searchParams.set("q", qBase);
  url.searchParams.set("rows", "20");
  url.searchParams.set(
    "fl",
    [
      "weergavenaam",
      "straatnaam",
      "woonplaatsnaam",
      "postcode",
      "huisnummer",
      "huisletter",
      "huisnummertoevoeging",
      "id",
    ].join(","),
  );

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6500);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`PDOK lookup failed (${res.status}) ${txt.slice(0, 120)}`);
    }

    const js = await res.json().catch(() => null);
    const docs: PdokDoc[] = js?.response?.docs || [];

    const candidates = docs.filter((d) => {
      const dpc = normalizePostcode(norm((d as any).postcode));
      const dhn = norm((d as any).huisnummer);
      if (dpc !== pc) return false;
      if (dhn !== hn) return false;
      return true;
    });

    if (!candidates.length) return null;
    if (!userSuf) return candidates[0];

    const strict = candidates.find((d) => suffixMatches(d, userSuf));
    if (strict) return strict;

    const byWeergave = candidates.find((d) => {
      const w = norm((d as any).weergavenaam);
      const extracted = extractSuffixFromWeergave(w, hn);
      return extracted && extracted === userSuf;
    });
    if (byWeergave) return byWeergave;

    const parts = splitAlphaNumSuffix(userSuf);
    if (parts.num) {
      const byNum = candidates.find((d) => {
        const ht = norm((d as any).huisnummertoevoeging).toUpperCase().replace(/[\s\-]/g, "");
        return ht && ht === parts.num;
      });
      if (byNum) return byNum;
    }
    if (parts.alpha) {
      const byAlpha = candidates.find((d) => {
        const hl = norm((d as any).huisletter).toUpperCase().replace(/[\s\-]/g, "");
        return hl && hl === parts.alpha;
      });
      if (byAlpha) return byAlpha;
    }

    return null;
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "Method not allowed" });

  // Idempotency verplicht voor write endpoint
  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) {
    // Geen audit: request is niet veilig te replayen/duiden als write
    return bad(req, "Missing Idempotency-Key", 400);
  }

  const SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => ({} as any));
  const dossierId = body?.dossier_id ? String(body.dossier_id) : null;
  const tokenStr = body?.token ? String(body.token) : null;

  // Replay zodra we dossier scope hebben
  if (dossierId) {
    const cached = await tryGetIdempotentResponse(SB, idemKey);
    if (cached) return json(req, cached.status, cached.body);
  }

  async function finalize(status: number, payload: any) {
    await storeIdempotentResponseFailOpen(SB, idemKey, status, payload);
    return json(req, status, payload);
  }

  if (!dossierId || !tokenStr) {
    return finalize(400, { ok: false, error: "Missing dossier_id/token" });
  }

  const tokenHash = await sha256Hex(tokenStr);
  const actor_ref = actorRefForCustomer(dossierId, tokenHash);

  async function reject(stage: string, status: number, message: string, extra?: Record<string, unknown>) {
        await insertAuditFailOpen(
        SB,
        {
            dossier_id: dossierId,
            actor_type: "customer",
            event_type: "address_save_rejected",
            event_data: { stage, status, message, ...(extra || {}) },
        },
        meta,
        { actor_ref, environment: ENVIRONMENT },
        );
        return finalize(status, { ok: false, error: message });
    }

    // accepteer meerdere key-varianten (UI mismatch killers)
    const postcodeRaw = body?.postcode;
    const houseNumberRaw = body?.house_number ?? body?.houseNumber ?? body?.housenumber ?? body?.number;
    const suffixRaw = body?.suffix ?? body?.addition ?? body?.house_suffix ?? body?.houseSuffix ?? null;

    const pc = normalizePostcode(String(postcodeRaw || ""));
    const hn = String(houseNumberRaw || "").trim();

    // voorkom "null" / "undefined" als string
    const suf = normalizeSuffix(suffixRaw == null ? "" : String(suffixRaw),);


  if (!pc || !isValidPostcode(pc)) {
    return reject("validate", 400, "Postcode is ongeldig (format: 1234AB).", { input: { postcode: pc } });

  }
  if (!hn || !isValidHouseNumber(hn)) {
    return reject("validate", 400, "Huisnummer is ongeldig.", { input: { house_number: hn } });
  }

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id, locked_at, status")
    .eq("id", dossierId)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (dErr) return reject("db_read", 500, dErr.message);

  if (!dossier) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id: dossierId,
        actor_type: "customer",
        event_type: "address_save_rejected",
        event_data: { stage: "auth", status: 401, message: "Unauthorized", reason: "unauthorized" },
      },
      meta,
      { actor_ref: `dossier:${dossierId}|token:invalid`, environment: ENVIRONMENT },
    );
    return finalize(401, { ok: false, error: "Unauthorized" });
  }

  const st = String(dossier.status || "");
  if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
    return reject("dossier_locked", 409, "Dossier is vergrendeld en kan niet meer gewijzigd worden.");
  }

  let resolved: PdokDoc | null = null;
  try {
    resolved = await pdokLookupAddress(pc, hn, suf);
  } catch (e) {
    console.error("PDOK lookup error:", e);
    return reject("external_lookup", 502, "Adres kon niet gecontroleerd worden (lookup error).", { reason: "pdok_error" });
  }

  if (!resolved) {
    return reject("validate", 400, "Adres niet gevonden of toevoeging klopt niet.", {
      input: { postcode: pc, house_number: hn, suffix: suf },
      reason: "not_found",
    });
  }

  const street = norm(resolved.straatnaam) || null;
  const city = norm(resolved.woonplaatsnaam) || null;
  const bag_id = norm(resolved.id) || null;
  const display = norm(resolved.weergavenaam) || null;

  if (!street || !city) {
    return reject("external_lookup", 502, "Adres gevonden, maar straat/stad ontbreken.", {
      resolved: { street, city, bag_id, display },
      reason: "pdok_incomplete",
    });
  }

  const ts = nowIso();

  const patch: Record<string, unknown> = {
    address_postcode: pc,
    address_house_number: hn,
    address_suffix: suf,
    address_street: street,
    address_city: city,
    address_bag_id: bag_id,
    address_verified_at: ts,
    updated_at: ts,
  };

  if (st === "ready_for_review") patch.status = "incomplete";

  const { error: uErr } = await SB
    .from("dossiers")
    .update(patch)
    .eq("id", dossierId)
    .is("locked_at", null)
    .neq("status", "in_review")
    .neq("status", "ready_for_booking");

  if (uErr) return reject("db_write", 500, `Address update failed: ${uErr.message}`);

  await insertAuditFailOpen(
    SB,
    {
      dossier_id: dossierId,
      actor_type: "customer",
      event_type: "address_saved_verified",
      event_data: {
        input: { postcode: pc, house_number: hn, suffix: suf },
        resolved: { street, city, bag_id, display },
        source: "pdok_locatieserver_v3_1_free",
        invalidated_ready_for_review: st === "ready_for_review",
      },
    },
    meta,
    { actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, {
    ok: true,
    saved: true,
    verified: true,
    postcode: pc,
    house_number: hn,
    suffix: suf,
    street,
    city,
    bag_id,
    display,
    verified_at: ts,
    invalidated: st === "ready_for_review",
  });
});
