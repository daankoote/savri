// supabase/functions/api-dossier-charger-save/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import {
  insertAuditFailOpen,
  tryGetIdempotentResponse,
  storeIdempotentResponseFailOpen,
} from "../_shared/audit.ts";
import {
  requireCustomerSession,
  scopedSessionIdemKey,
} from "../_shared/customer_auth.ts";

// -------------------- ENV --------------------
function getEnvironment(): string {
  return (
    Deno.env.get("ENVIRONMENT") ||
    Deno.env.get("ENV") ||
    Deno.env.get("APP_ENV") ||
    Deno.env.get("SUPABASE_ENV") ||
    "unknown"
  ).toLowerCase();
}

// -------------------- CORS --------------------
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

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sb() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function normStr(v: unknown, max = 200) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return bad(req, "Method not allowed", 405);

  let SB: ReturnType<typeof createClient>;
  try {
    SB = sb();
  } catch (e) {
    console.error(e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  const parsed = await req.json().catch(() => ({} as Record<string, unknown>));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const session_token = parsed?.session_token ? String(parsed.session_token).trim() : null;

  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  if (!dossier_id || !session_token) {
    return json(req, 400, { ok: false, error: "Missing dossier_id/session_token" });
  }

  const auth = await requireCustomerSession(
    SB,
    dossier_id,
    session_token,
    meta,
    "charger_save_rejected",
  );

  if (!auth.ok) {
    return json(req, auth.status, { ok: false, error: auth.error });
  }

  const idemScopedKey = scopedSessionIdemKey(dossier_id, auth.session_token_hash, idemKey);

  async function finalize(status: number, body: Record<string, unknown>) {
    await storeIdempotentResponseFailOpen(SB, idemScopedKey, status, body);
    return json(req, status, body);
  }

  async function reject(
    stage: string,
    status: number,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "charger_save_rejected",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );
    return finalize(status, { ok: false, error: message });
  }

  async function fail(
    stage: string,
    status: number,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "charger_save_failed",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );
    return finalize(status, { ok: false, error: message });
  }

  const cached = await tryGetIdempotentResponse(SB, idemScopedKey);
  if (cached) return json(req, cached.status, cached.body);

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id, locked_at, status, charger_count")
    .eq("id", dossier_id)
    .maybeSingle();

  if (dErr) {
    return fail("dossier_lookup", 500, dErr.message, {
      reason: "dossier_lookup_failed",
      error: dErr.message,
    });
  }
  if (!dossier) {
    return reject("dossier_missing", 404, "Dossier niet gevonden.");
  }

  const charger_id = parsed?.charger_id ? String(parsed.charger_id) : null;
  const serial = normStr(parsed?.serial_number, 80);
  const mid = normStr(parsed?.mid_number ?? parsed?.meter_id, 80);
  const b = normStr(parsed?.brand, 80);
  const m = normStr(parsed?.model, 120);
  const n = normStr(parsed?.notes, 240) || null;

  if (!serial) {
    return reject("validate_input", 400, "Serienummer verplicht.", {
      reason: "serial_required",
      charger_id,
    });
  }
  if (!mid || mid.length < 4) {
    return reject("validate_input", 400, "MID-nummer ongeldig.", {
      reason: "mid_invalid",
      mid_number: mid,
    });
  }
  if (!b) {
    return reject("validate_input", 400, "Merk verplicht.", {
      reason: "brand_required",
      charger_id,
    });
  }
  if (!m) {
    return reject("validate_input", 400, "Model verplicht.", {
      reason: "model_required",
      charger_id,
    });
  }

  const st = String(dossier.status || "");
  if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
    return reject("validate_lock", 409, "Dossier is definitief ingediend en kan niet meer gewijzigd worden.", {
      reason: "dossier_locked",
      status: st,
    });
  }

  const required = Number(dossier.charger_count || 0) || 0;
  if (required <= 0) {
    return reject("validate_charger_count", 409, "Kies eerst het aantal laadpunten in stap 1.", {
      reason: "charger_count_missing",
    });
  }

  const { data: existingChargers, error: cErr } = await SB
    .from("dossier_chargers")
    .select("id, serial_number, mid_number")
    .eq("dossier_id", dossier_id);

  if (cErr) {
    return fail("chargers_read", 500, `Chargers read failed: ${cErr.message}`, {
      reason: "chargers_read_failed",
      error: cErr.message,
    });
  }

  const have = (existingChargers || []).length;
  const isUpdate = !!charger_id;

  if (!isUpdate && have >= required) {
    return reject(
      "validate_max_chargers",
      409,
      `Maximaal aantal laadpalen bereikt (${required}). Verwijder eerst een laadpaal of verhoog het aantal in stap 1.`,
      {
        reason: "max_chargers_reached",
        required,
        have,
      },
    );
  }



  const sameDossierDuplicateMid = (existingChargers || []).some((x: Record<string, unknown>) => {
    if (String(x.id || "") === String(charger_id || "")) return false;
    return String(x.mid_number || "") === mid;
  });

  if (sameDossierDuplicateMid) {
    return reject("validate_duplicate", 409, "Dit MID-nummer is al toegevoegd in dit dossier.", {
      reason: "duplicate_mid_same_dossier",
      mid_number: mid,
    });
  }

  let midGlobalQuery = SB
    .from("dossier_chargers")
    .select("id, dossier_id")
    .eq("mid_number", mid);

  if (charger_id) {
    midGlobalQuery = midGlobalQuery.neq("id", charger_id);
  }

  const { data: anyMid, error: mErr } = await midGlobalQuery
    .limit(1)
    .maybeSingle();

  if (mErr) {
    return fail("validate_duplicate_mid_global", 500, `MID check failed: ${mErr.message}`, {
      reason: "mid_check_failed",
      error: mErr.message,
    });
  }

  if (anyMid && String(anyMid.dossier_id) !== String(dossier_id)) {
    return reject("validate_duplicate", 409, "Dit MID-nummer is al gebruikt in een ander dossier. Controleer het MID-nummer.", {
      reason: "duplicate_mid_other_dossier",
      mid_number: mid,
    });
  }

  const ts = nowIso();

  async function invalidateIfNeeded(): Promise<boolean> {
    if (String(dossier.status || "") !== "ready_for_review") return false;

    const { error: sErr } = await SB
      .from("dossiers")
      .update({ status: "incomplete", updated_at: ts })
      .eq("id", dossier_id)
      .eq("status", "ready_for_review")
      .is("locked_at", null);

    if (sErr) throw new Error(`Status invalidation failed: ${sErr.message}`);
    return true;
  }

  if (isUpdate) {
    const { error: upErr } = await SB
      .from("dossier_chargers")
      .update({
        serial_number: serial,
        mid_number: mid,
        brand: b,
        model: m,
        notes: n,
        updated_at: ts,
      })
      .eq("id", charger_id)
      .eq("dossier_id", dossier_id);

    if (upErr) {
      const pgCode = (upErr as { code?: string })?.code || "";
      if (pgCode === "23505") {
        return reject("db_update", 409, "Dit MID-nummer is al gebruikt. Controleer het MID-nummer.", {
          reason: "unique_violation",
          code: "23505",
          charger_id,
        });
      }
      return fail("db_update", 500, `Update failed: ${upErr.message}`, {
        reason: "update_failed",
        error: upErr.message,
        charger_id,
      });
    }

    const invalidated = await invalidateIfNeeded().catch(() => false);

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "charger_updated",
        event_data: {
          charger_id,
          serial_number: serial,
          mid_number: mid,
          brand: b,
          model: m,
          notes: n,
          invalidated_ready_for_review: invalidated,
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    return finalize(200, { ok: true, saved: true, charger_id, invalidated });
  }

  const { data: ins, error: insErr } = await SB
    .from("dossier_chargers")
    .insert([{
      dossier_id,
      serial_number: serial,
      mid_number: mid,
      brand: b,
      model: m,
      notes: n,
      created_at: ts,
      updated_at: ts,
    }])
    .select("id")
    .maybeSingle();

  if (insErr) {
    const pgCode = (insErr as { code?: string })?.code || "";
    if (pgCode === "23505") {
      return reject("db_insert", 409, "Dit MID-nummer is al gebruikt. Controleer het MID-nummer.", {
        reason: "unique_violation",
        code: "23505",
        serial_number: serial,
        mid_number: mid,
      });
    }
    return fail("db_insert", 500, `Insert failed: ${insErr.message}`, {
      reason: "insert_failed",
      error: insErr.message,
    });
  }

  const invalidated = await invalidateIfNeeded().catch(() => false);

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "charger_added",
      event_data: {
        charger_id: ins?.id || null,
        serial_number: serial,
        mid_number: mid,
        brand: b,
        model: m,
        notes: n,
        invalidated_ready_for_review: invalidated,
      },
    },
    meta,
    { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, {
    ok: true,
    saved: true,
    charger_id: ins?.id || null,
    invalidated,
  });
});