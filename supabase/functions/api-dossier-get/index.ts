import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";

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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, Idempotency-Key, x-request-id, X-Request-Id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeadersFor(req) },
  });
}

function ok(req: Request, data: Record<string, unknown> = {}) {
  return json(req, 200, { ok: true, ...data });
}

function bad(req: Request, msg: string, code = 400) {
  return json(req, code, { ok: false, error: msg });
}

// -------------------- ENV + Client --------------------
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

function actorRefForCustomer(dossierId: string, tokenHash: string) {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return bad(req, "Method not allowed", 405);

  const parsed = await req.json().catch(() => ({} as any));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const token = parsed?.token ? String(parsed.token) : null;

  if (!dossier_id || !token) {
    // Geen audit zonder betrouwbare scope
    return bad(req, "Missing dossier_id/token", 400);
  }

  let SB: ReturnType<typeof createClient>;
  try {
    SB = sb();
  } catch (e) {
    console.error("ENV/Client init error:", e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  const tokenHash = await sha256Hex(token);
  const actor_ref = actorRefForCustomer(dossier_id, tokenHash);

  // -------------------- dossier auth via token hash --------------------
  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select([
      "id",
      "created_at",
      "updated_at",
      "lead_id",
      "source",
      "lead_type",
      "installer_ref",
      "installer_id",
      "customer_first_name",
      "customer_last_name",
      "customer_email",
      "customer_phone",
      "charger_count",
      "own_premises",
      "status",
      "access_token_created_at",
      "email_verified_at",
      "email_verification_sent_at",
      "address_postcode",
      "address_house_number",
      "address_suffix",
      "address_street",
      "address_city",
      "address_bag_id",
      "address_verified_at",
      "locked_at",
    ].join(","))
    .eq("id", dossier_id)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (dErr) return bad(req, dErr.message, 500);

  if (!dossier) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_get_rejected",
        event_data: {
          stage: "auth",
          status: 401,
          message: "Unauthorized",
          reason: "unauthorized",
        },
      },
      meta,
      { actor_ref: `dossier:${dossier_id}|token:invalid`, environment: ENVIRONMENT },
    );

    return bad(req, "Unauthorized", 401);
  }

  // --------------------
  // MVP decision (RISK): possession of dossier link == email verified
  // NOTE: Phase-2: replace by explicit verification flow/token
  // --------------------
  if (!dossier.email_verified_at) {
    const ts = nowIso();

    const { error: upErr } = await SB
      .from("dossiers")
      .update({ email_verified_at: ts, updated_at: ts })
      .eq("id", dossier_id)
      .is("locked_at", null);

    if (upErr) {
      console.error("auto email verify update failed:", upErr);
    } else {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "system",
          event_type: "email_verified_by_link",
          event_data: {
            assumption: "possession_of_link_equals_verified",
          },
        },
        meta,
        { actor_ref, environment: ENVIRONMENT },
      );

      (dossier as any).email_verified_at = ts;
    }
  }

  // -------------------- related state (fail-open) --------------------
  const LIMIT = 200;

  const [docsRes, consRes, auditRes, chargersRes, checksRes] = await Promise.all([
    SB.from("dossier_documents")
      .select([
        "id",
        "dossier_id",
        "charger_id",
        "doc_type",
        "filename",
        "storage_bucket",
        "storage_path",
        "content_type",
        "size_bytes",
        "uploaded_by",
        "status",
        "confirmed_at",
        "confirmed_by",
        "confirmed_ip",
        "confirmed_ua",
        "confirmed_request_id",
        "updated_at",
        "file_sha256",
        "created_at",
      ].join(","))
      .eq("dossier_id", dossier_id)
      .order("created_at", { ascending: false })
      .limit(LIMIT),

    SB.from("dossier_consents")
      .select([
        "id",
        "created_at",
        "dossier_id",
        "consent_type",
        "version",
        "accepted",
        "accepted_at",
        "actor_name",
        "actor_email",
        "user_agent",
        "ip",
      ].join(","))
      .eq("dossier_id", dossier_id)
      .order("created_at", { ascending: false })
      .limit(LIMIT),

    SB.from("dossier_audit_events")
      .select([
        "id",
        "created_at",
        "dossier_id",
        "actor_type",
        "actor_label",
        "event_type",
        "event_data",
      ].join(","))
      .eq("dossier_id", dossier_id)
      .order("created_at", { ascending: false })
      .limit(LIMIT),

    SB.from("dossier_chargers")
      .select([
        "id",
        "dossier_id",
        "brand",
        "model",
        "serial_number",
        "install_year",
        "connector_type",
        "meter_id",
        "notes",
        "power_kw",
        "created_at",
        "updated_at",
      ].join(","))
      .eq("dossier_id", dossier_id)
      .order("created_at", { ascending: false })
      .limit(LIMIT),

    SB.from("dossier_checks")
      .select([
        "id",
        "dossier_id",
        "check_code",
        "status",
        "details",
        "created_at",
        "updated_at",
      ].join(","))
      .eq("dossier_id", dossier_id)
      .order("updated_at", { ascending: false })
      .limit(LIMIT),
  ]);

  // Debug: laat fouten zien (anders blijf je blind door fail-open)
  if (docsRes?.error) console.error("docsRes error:", docsRes.error);
  if (consRes?.error) console.error("consRes error:", consRes.error);
  if (auditRes?.error) console.error("auditRes error:", auditRes.error);
  if (chargersRes?.error) console.error("chargersRes error:", chargersRes.error);
  if (checksRes?.error) console.error("checksRes error:", checksRes.error);

  // Fail-open op deelqueries
  const documents = docsRes?.error ? [] : (docsRes.data || []);
  const consents = consRes?.error ? [] : (consRes.data || []);
  const audit = auditRes?.error ? [] : (auditRes.data || []);
  const chargers = chargersRes?.error ? [] : (chargersRes.data || []);
  const checks = checksRes?.error ? [] : (checksRes.data || []);

  return ok(req, { dossier, documents, consents, audit, chargers, checks });
});
