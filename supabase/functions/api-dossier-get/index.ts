// supabase/functions/api-dossier-get/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";
import { randToken, sha256Hex, authSession, auditSessionRejectFailOpen } from "../_shared/sessions.ts";

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

function nowIso() {
  return new Date().toISOString();
}

function actorRefForToken(dossierId: string, tokenHash: string) {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return bad(req, "Method not allowed", 405);

  const parsed = await req.json().catch(() => ({} as any));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;

  const token = parsed?.token ? String(parsed.token) : null; // link-token (one-time exchange)
  const session_token = parsed?.session_token ? String(parsed.session_token) : null; // short-lived

  if (!dossier_id || (!token && !session_token)) {
    return bad(req, "Missing dossier_id + (token or session_token)", 400);
  }

  let SB: ReturnType<typeof createClient>;
  try {
    SB = sb();
  } catch (e) {
    console.error("ENV/Client init error:", e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  const now = nowIso();

  // -------------------- AUTH --------------------
  // Mode A: session_token (normal)
  // Mode B: token (link-token exchange; one-time + expirable)
  let issued_session_token: string | null = null;

  if (session_token) {
    const r = await authSession(SB, dossier_id, session_token, meta);
    if (!r.ok) {
      await auditSessionRejectFailOpen(SB, dossier_id, meta, "dossier_get_rejected", r.reason, r.error);
      return bad(req, "Unauthorized", 401);
    }
  } else {
    // link-token exchange
    const tokenHash = await sha256Hex(token!);
    const actor_ref = actorRefForToken(dossier_id, tokenHash);

    const { data: d, error: dErr } = await SB
      .from("dossiers")
      .select("id,email_verified_at,locked_at,access_token_expires_at,access_token_consumed_at")
      .eq("id", dossier_id)
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (dErr) return bad(req, dErr.message, 500);

    if (!d) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "dossier_get_rejected",
          event_data: { stage: "auth", status: 401, message: "Unauthorized", reason: "unauthorized" },
        },
        meta,
        { actor_ref: `dossier:${dossier_id}|token:invalid`, environment: ENVIRONMENT },
      );
      return bad(req, "Unauthorized", 401);
    }

    if (d.access_token_expires_at && String(d.access_token_expires_at) <= now) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "link_token_rejected",
          event_data: { stage: "auth", status: 410, message: "Link expired", reason: "link_expired" },
        },
        meta,
        { actor_ref, environment: ENVIRONMENT },
      );
      return bad(req, "Link expired", 410);
    }

    if (d.access_token_consumed_at) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "link_token_rejected",
          event_data: { stage: "auth", status: 410, message: "Link already used", reason: "link_consumed" },
        },
        meta,
        { actor_ref, environment: ENVIRONMENT },
      );
      return bad(req, "Link already used", 410);
    }

    // consume + email verify (MVP)
    const { data: consumed, error: cErr } = await SB
      .from("dossiers")
      .update({
        access_token_consumed_at: now,
        access_token_consumed_ip: meta.ip ?? null,
        access_token_consumed_ua: meta.ua ?? null,
        access_token_consumed_request_id: meta.request_id,
        email_verified_at: d.email_verified_at ? d.email_verified_at : now,
        updated_at: now,
      })
      .eq("id", dossier_id)
      .eq("access_token_hash", tokenHash)
      .is("access_token_consumed_at", null)
      .select("id")
      .maybeSingle();

    if (cErr) return bad(req, cErr.message, 500);
    if (!consumed) return bad(req, "Link already used", 410);

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "system",
        event_type: "link_token_consumed",
        event_data: { reason: "one_time_exchange" },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );

    // mint session
    const sessionToken = randToken(24);
    const sessionHash = await sha256Hex(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { error: sErr } = await SB.from("dossier_sessions").insert([{
      dossier_id,
      session_token_hash: sessionHash,
      expires_at: sessionExpiresAt,
      created_ip: meta.ip ?? null,
      created_ua: meta.ua ?? null,
      created_request_id: meta.request_id,
    }]);

    if (sErr) return bad(req, `Session create failed: ${sErr.message}`, 500);

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "system",
        event_type: "session_created",
        event_data: { expires_at: sessionExpiresAt },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );

    issued_session_token = sessionToken;
  }

  // -------------------- Load dossier (by id only) --------------------
  const { data: dossier, error: dossierErr } = await SB
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
      "access_token_expires_at",
      "access_token_consumed_at",
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
      "in_nl",
    ].join(","))
    .eq("id", dossier_id)
    .maybeSingle();

  if (dossierErr) return bad(req, dossierErr.message, 500);
  if (!dossier) return bad(req, "Not found", 404);

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

  if (docsRes?.error) console.error("docsRes error:", docsRes.error);
  if (consRes?.error) console.error("consRes error:", consRes.error);
  if (auditRes?.error) console.error("auditRes error:", auditRes.error);
  if (chargersRes?.error) console.error("chargersRes error:", chargersRes.error);
  if (checksRes?.error) console.error("checksRes error:", checksRes.error);

  const documents = docsRes?.error ? [] : (docsRes.data || []);
  const consents = consRes?.error ? [] : (consRes.data || []);
  const audit = auditRes?.error ? [] : (auditRes.data || []);
  const chargers = chargersRes?.error ? [] : (chargersRes.data || []);
  const checks = checksRes?.error ? [] : (checksRes.data || []);

  return ok(req, {
    dossier,
    documents,
    consents,
    audit,
    chargers,
    checks,
    ...(issued_session_token ? { session_token: issued_session_token } : {}),
  });
});