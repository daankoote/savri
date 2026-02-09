// supabase/functions/api-dossier-access-save/index.ts

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

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function nowIso() {
  return new Date().toISOString();
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateNlMobile(phone: string) {
  const p = String(phone || "").trim().replace(/[\s\-().]/g, "");
  return /^06\d{8}$/.test(p) || /^\+316\d{8}$/.test(p);
}

function asStringOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function actorRefForCustomer(dossierId: string, tokenHash: string): string {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

serve(async (req) => {
  const meta = getReqMeta(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "Method not allowed" });

  // Idempotency verplicht voor write endpoint
  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) {
    // IMPORTANT: geen audit zonder betrouwbare scope (dossier_id kan nog ontbreken)
    return json(req, 400, { ok: false, error: "Missing Idempotency-Key" });
  }

  const SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => ({} as any));
  const dossier_id = body?.dossier_id ? String(body.dossier_id) : null;
  const token = body?.token ? String(body.token) : null;

  // Replay zodra we dossier scope hebben
  if (dossier_id) {
    const cached = await tryGetIdempotentResponse(SB, idemKey);
    if (cached) return json(req, cached.status, cached.body);
  }

  async function finalize(status: number, payload: any) {
    await storeIdempotentResponseFailOpen(SB, idemKey, status, payload);
    return json(req, status, payload);
  }

  if (!dossier_id || !token) {
    return finalize(400, { ok: false, error: "Missing dossier_id/token" });
  }

  const tokenHash = await sha256Hex(token);
  const actor_ref = actorRefForCustomer(dossier_id, tokenHash);

  async function reject(
    stage: string,
    status: number,
    message: string,
    extra?: Record<string, unknown>,
    actorRefOverride?: string,
  ) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "access_save_rejected",
        event_data: {
          stage,
          status,
          message,
          ...(extra || {}),
        },
      },
      meta,
      { actor_ref: actorRefOverride ?? actor_ref },
    );
    return finalize(status, { ok: false, error: message });
  }

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id, locked_at, status")
    .eq("id", dossier_id)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (dErr) return reject("db_read", 500, dErr.message);

  if (!dossier) {
    // Unauthorized: audit wél, maar actor_ref = invalid token
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "access_save_rejected",
        event_data: { stage: "auth", status: 401, message: "Unauthorized", reason: "unauthorized" },
      },
      meta,
      { actor_ref: `dossier:${dossier_id}|token:invalid` },
    );
    return finalize(401, { ok: false, error: "Unauthorized" });
  }

  const st = String(dossier.status || "");
  if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
    return reject("dossier_locked", 409, "Dossier is vergrendeld en kan niet meer gewijzigd worden.");
  }

  // -------------------- Input --------------------
  // first_name REQUIRED
  const fn = asStringOrNull(body?.first_name);
  if (!fn) return reject("validate", 400, "Voornaam is verplicht.");
  if (fn.length > 80) return reject("validate", 400, "Voornaam is te lang.");

  // last_name OPTIONAL (empty -> null)
  const ln = asStringOrNull(body?.last_name);
  if (ln && ln.length > 120) return reject("validate", 400, "Achternaam is te lang.");

  const customer_phone_raw = body?.customer_phone;
  const charger_count = body?.charger_count;
  const own_premises = body?.own_premises;

  // charger_count (optional)
  let cc: number | null = null;
  if (charger_count !== null && charger_count !== undefined && String(charger_count).trim() !== "") {
    cc = Number(charger_count);
    if (!Number.isFinite(cc) || cc < 1 || cc > 10) {
      return reject("validate", 400, "Aantal laadpunten is ongeldig (1-10).", { input: { charger_count } });
    }
    cc = Math.trunc(cc);
  }

  // phone (optional) + NL mobile check
  let phone: string | null = asStringOrNull(customer_phone_raw);
  if (phone && phone.length > 24) return reject("validate", 400, "Mobiel nummer is te lang.");
  if (phone && !validateNlMobile(phone)) {
    return reject("validate", 400, "Mobiel nummer is ongeldig. Gebruik 06xxxxxxxx of +316xxxxxxxx.");
  }

  // own_premises (optional; must be boolean if provided)
  let op: boolean | null = null;
  if (own_premises !== undefined && own_premises !== null) {
    if (typeof own_premises !== "boolean") return reject("validate", 400, "own_premises moet true/false zijn.");
    op = own_premises;
  }

  // business rule: charger_count cannot be lower than existing chargers
  if (cc !== null) {
    const { count: chargersCount, error: cErr } = await SB
      .from("dossier_chargers")
      .select("id", { count: "exact", head: true })
      .eq("dossier_id", dossier_id);

    if (cErr) return reject("db_read", 500, cErr.message);

    const have = Number(chargersCount || 0) || 0;
    if (have > cc) {
      const msg =
        `Je hebt al ${have} laadpaal(en) toegevoegd. Verwijder eerst ${have - cc} laadpaal(en) in stap 3 voordat je het aantal laadpunten kunt verlagen.`;
      return reject("business_rule", 409, msg, { data: { have, requested: cc } });
    }
  }

  // -------------------- Write --------------------
  const ts = nowIso();
  const patch: Record<string, unknown> = {
    updated_at: ts,
    customer_first_name: fn,
    customer_last_name: ln,
  };

  if (customer_phone_raw !== undefined) patch.customer_phone = phone;
  if (charger_count !== undefined) patch.charger_count = cc;
  if (own_premises !== undefined) patch.own_premises = op;

  // Invalidate ready_for_review if user changes step 1 fields
  if (st === "ready_for_review") patch.status = "incomplete";

  const { error: upErr } = await SB
    .from("dossiers")
    .update(patch)
    .eq("id", dossier_id)
    .is("locked_at", null)
    .neq("status", "in_review")
    .neq("status", "ready_for_booking");

  if (upErr) return reject("db_write", 500, upErr.message);

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "access_updated",
      event_data: {
        changes: {
          customer_first_name: fn,
          customer_last_name: ln,
          ...(customer_phone_raw !== undefined ? { customer_phone: phone } : {}),
          ...(charger_count !== undefined ? { charger_count: cc } : {}),
          ...(own_premises !== undefined ? { own_premises: op } : {}),
        },
        invalidated_ready_for_review: st === "ready_for_review",
      },
    },
    meta,
    { actor_ref },
  );

  return finalize(200, { ok: true, saved: true, invalidated: st === "ready_for_review" });
});
