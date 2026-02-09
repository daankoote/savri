// supabase/functions/api-dossier-charger-delete/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import {
  insertAuditFailOpen,
  tryGetIdempotentResponse,
  storeIdempotentResponseFailOpen,
} from "../_shared/audit.ts";

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

function getEnvironment(): string {
  return (
    Deno.env.get("ENVIRONMENT") ||
    Deno.env.get("ENV") ||
    Deno.env.get("APP_ENV") ||
    "unknown"
  ).toLowerCase();
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

function actorRefForCustomer(dossierId: string, tokenHash: string) {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

function isDbPolicyImmutableError(msg: string) {
  const m = (msg || "").toLowerCase();
  return m.includes("immutable_row") ||
    m.includes("cannot be deleted") ||
    m.includes("db policy") ||
    m.includes("policy") ||
    m.includes("confirmed");
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

  // -------------------- Idempotency (required, header only) --------------------
  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  // -------------------- parse body --------------------
  const parsed = await req.json().catch(() => ({} as any));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const token = parsed?.token ? String(parsed.token) : null;
  const charger_id = parsed?.charger_id ? String(parsed.charger_id) : null;

  if (dossier_id) {
    const cached = await tryGetIdempotentResponse(SB, idemKey);
    if (cached) return json(req, cached.status, cached.body);
  }

  async function finalize(status: number, body: any) {
    await storeIdempotentResponseFailOpen(SB, idemKey, status, body);
    return json(req, status, body);
  }

  if (!dossier_id || !token || !charger_id) {
    // IMPORTANT: als dossier_id ontbreekt => geen audit (scope ontbreekt)
    if (dossier_id) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "charger_delete_rejected",
          event_data: {
            stage: "validate_input",
            status: 400,
            message: "Missing dossier_id/token/charger_id",
            reason: "missing_fields",
            charger_id: charger_id ?? null,
          },
        },
        meta,
        { environment: ENVIRONMENT },
      );
    }
    return finalize(400, { ok: false, error: "Missing dossier_id/token/charger_id" });
  }

  const tokenHash = await sha256Hex(String(token));
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
        event_type: "charger_delete_rejected",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref: actorRefOverride ?? actor_ref, environment: ENVIRONMENT },
    );
    return finalize(status, { ok: false, error: message, ...(extra || {}) });
  }

  async function fail(stage: string, status: number, message: string, extra?: Record<string, unknown>) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "charger_delete_failed",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );
    return finalize(status, { ok: false, error: message, ...(extra || {}) });
  }

  // -------------------- dossier auth + lock --------------------
  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id, locked_at, status")
    .eq("id", dossier_id)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (dErr) return fail("dossier_lookup", 500, dErr.message, { reason: "db_error", charger_id });

  if (!dossier) {
    // Unauthorized: actor_ref moet token:invalid zijn
    return reject(
      "auth",
      401,
      "Unauthorized",
      { reason: "unauthorized", charger_id },
      `dossier:${dossier_id}|token:invalid`,
    );
  }

  const st = String(dossier.status || "");
  if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
    return reject("dossier_locked", 409, "Dossier is vergrendeld en kan niet meer gewijzigd worden.", {
      reason: "locked",
      status: st,
      charger_id,
    });
  }

  // -------------------- charger exists? --------------------
  const { data: ch, error: chErr } = await SB
    .from("dossier_chargers")
    .select("id")
    .eq("id", charger_id)
    .eq("dossier_id", dossier_id)
    .maybeSingle();

  if (chErr) return fail("charger_lookup", 500, `Charger lookup failed: ${chErr.message}`, { reason: "db_error", charger_id });
  if (!ch) return reject("charger_lookup", 404, "Laadpaal niet gevonden in dit dossier.", { reason: "not_found", charger_id });

  const ts = nowIso();

  async function invalidateIfNeeded(): Promise<boolean> {
    if (st !== "ready_for_review") return false;

    const { error: sErr } = await SB
      .from("dossiers")
      .update({ status: "incomplete", updated_at: ts })
      .eq("id", dossier_id)
      .eq("status", "ready_for_review")
      .is("locked_at", null);

    if (sErr) throw new Error(`Status invalidation failed: ${sErr.message}`);
    return true;
  }

  // -------------------- read docs list (for reporting + storage delete) --------------------
  const { data: docs, error: docErr } = await SB
    .from("dossier_documents")
    .select("id, storage_bucket, storage_path, filename")
    .eq("dossier_id", dossier_id)
    .eq("charger_id", charger_id);

  if (docErr) return fail("docs_read", 500, `Docs read failed: ${docErr.message}`, { reason: "db_error", charger_id });

  // -------------------- 1) DB delete docs FIRST --------------------
  const { error: dbDocDelErr } = await SB
    .from("dossier_documents")
    .delete()
    .eq("dossier_id", dossier_id)
    .eq("charger_id", charger_id);

  if (dbDocDelErr) {
    const msg = String(dbDocDelErr.message || dbDocDelErr);
    if (isDbPolicyImmutableError(msg)) {
      return reject("db_delete_docs", 409, "Laadpaal kan nu niet verwijderd worden (DB policy op documenten).", {
        reason: "db_policy_block",
        charger_id,
        db_error: msg,
        dossier_status: st || null,
        docs_count: (docs || []).length,
      });
    }
    return fail("db_delete_docs", 500, `Document delete failed: ${msg}`, { reason: "db_error", charger_id });
  }

  // -------------------- 2) Storage delete AFTER db delete (fail-open) --------------------
  let storageDeleted = 0;
  let storageFailed = 0;

  const byBucket: Record<string, string[]> = {};
  for (const d of (docs || [])) {
    const b = String((d as any).storage_bucket || "").trim();
    const p = String((d as any).storage_path || "").trim();
    if (!b || !p) continue;
    if (!byBucket[b]) byBucket[b] = [];
    byBucket[b].push(p);
  }

  for (const b of Object.keys(byBucket)) {
    const paths = byBucket[b];
    if (!paths.length) continue;

    const { error: sDelErr } = await SB.storage.from(b).remove(paths);
    if (sDelErr) {
      storageFailed += paths.length;

      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "charger_delete_storage_failed",
          event_data: {
            stage: "storage_delete",
            status: 200,
            message: "Storage delete failed (db already deleted).",
            reason: "storage_delete_failed",
            error: String((sDelErr as any)?.message || sDelErr),
            bucket: b,
            charger_id,
            paths_count: paths.length,
          },
        },
        meta,
        { actor_ref, environment: ENVIRONMENT },
      );
    } else {
      storageDeleted += paths.length;
    }
  }

  // -------------------- 3) Delete charger AFTER docs removed --------------------
  const { error: delErr } = await SB
    .from("dossier_chargers")
    .delete()
    .eq("id", charger_id)
    .eq("dossier_id", dossier_id);

  if (delErr) return fail("db_delete_charger", 500, `Charger delete failed: ${delErr.message}`, { reason: "db_error", charger_id });

  let invalidated = false;
  try {
    invalidated = await invalidateIfNeeded();
  } catch (e: any) {
    return fail("status_invalidation", 500, e?.message || "Status invalidation failed", { reason: "db_error", charger_id });
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "charger_deleted",
      event_data: {
        charger_id,
        deleted_documents: (docs || []).length,
        deleted_storage_objects: storageDeleted,
        storage_delete_failed_objects: storageFailed,
        invalidated_ready_for_review: invalidated,
      },
    },
    meta,
    { actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, {
    ok: true,
    deleted: true,
    charger_id,
    deleted_documents: (docs || []).length,
    deleted_storage_objects: storageDeleted,
    storage_delete_failed_objects: storageFailed,
    invalidated,
  });
});
