// supabase/functions/api-dossier-export/index.ts

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

function bad(
  req: Request,
  msg: string,
  code = 400,
  extra: Record<string, unknown> = {},
) {
  return json(req, code, { ok: false, error: msg, ...extra });
}

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

type ConsentRow = {
  consent_type: string;
  accepted: boolean;
  accepted_at?: string | null;
  created_at?: string | null;
};

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return bad(req, "Method not allowed", 405);
  }

  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  let SB: ReturnType<typeof createClient>;
  try {
    SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  } catch (e) {
    console.error("ENV error:", e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  const parsed = await req.json().catch(() => ({} as Record<string, unknown>));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const session_token = parsed?.session_token ? String(parsed.session_token) : null;

  if (!dossier_id || !session_token) {
    return json(req, 400, { ok: false, error: "Missing dossier_id/session_token" });
  }

  const auth = await requireCustomerSession(
    SB,
    dossier_id,
    session_token,
    meta,
    "dossier_export_rejected",
  );

  if (!auth.ok) {
    return json(req, auth.status, { ok: false, error: auth.error });
  }

  const idemScopedKey = scopedSessionIdemKey(dossier_id, auth.session_token_hash, idemKey);
  const cached = await tryGetIdempotentResponse(SB, idemScopedKey);
  if (cached) return json(req, cached.status, cached.body);

  async function finalize(status: number, body: Record<string, unknown>) {
    await storeIdempotentResponseFailOpen(SB, idemScopedKey, status, body);
    return json(req, status, body);
  }

  async function auditReject(
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
        event_type: "dossier_export_rejected",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );
  }

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select([
      "id",
      "status",
      "locked_at",
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
      "email_verified_at",
      "address_postcode",
      "address_house_number",
      "address_suffix",
      "address_street",
      "address_city",
      "address_bag_id",
      "address_verified_at",
    ].join(","))
    .eq("id", dossier_id)
    .maybeSingle();

  if (dErr) {
    await auditReject("dossier_lookup", 500, dErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: dErr.message });
  }

  if (!dossier) {
    await auditReject("dossier_lookup", 404, "Dossier not found", { reason: "not_found" });
    return finalize(404, { ok: false, error: "Dossier not found" });
  }

  const st = String(dossier.status || "");
  const locked = !!dossier.locked_at;
  const exportAllowed = locked || st === "in_review" || st === "ready_for_booking";

  if (!exportAllowed) {
    await auditReject(
      "export_gate",
      409,
      "Export is alleen toegestaan voor dossiers die zijn ingediend (locked/in_review).",
      { status: st, locked_at: dossier.locked_at || null, reason: "not_locked" },
    );

    return finalize(409, {
      ok: false,
      error: "Export is alleen toegestaan voor dossiers die zijn ingediend (locked/in_review).",
      status: st,
      locked_at: dossier.locked_at || null,
    });
  }

  const [
    { data: chargers, error: chErr },
    { data: docsRaw, error: docErr },
    { data: checks, error: chkErr },
    { data: consentsRaw, error: cErr },
  ] = await Promise.all([
    SB.from("dossier_chargers")
      .select("id, serial_number, mid_number, brand, model, power_kw, notes, created_at, updated_at")
      .eq("dossier_id", dossier_id)
      .order("created_at", { ascending: true }),

    SB.from("dossier_documents")
      .select("id, doc_type, charger_id, status, filename, content_type, size_bytes, storage_bucket, storage_path, file_sha256, confirmed_at, confirmed_request_id, created_at, updated_at")
      .eq("dossier_id", dossier_id)
      .order("created_at", { ascending: true }),

    SB.from("dossier_checks")
      .select("check_code, status, details, updated_at")
      .eq("dossier_id", dossier_id)
      .order("check_code", { ascending: true }),

    SB.from("dossier_consents")
      .select("consent_type, accepted, accepted_at, created_at")
      .eq("dossier_id", dossier_id)
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false }),
  ]);

  if (chErr) {
    await auditReject("chargers_read", 500, chErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: `Chargers read failed: ${chErr.message}` });
  }
  if (docErr) {
    await auditReject("documents_read", 500, docErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: `Documents read failed: ${docErr.message}` });
  }
  if (chkErr) {
    await auditReject("checks_read", 500, chkErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: `Checks read failed: ${chkErr.message}` });
  }
  if (cErr) {
    await auditReject("consents_read", 500, cErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: `Consents read failed: ${cErr.message}` });
  }

  const consent_snapshot: Record<string, boolean> = {};
  const seen = new Set<string>();
  for (const row of (consentsRaw || []) as ConsentRow[]) {
    const t = String(row.consent_type || "").trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    consent_snapshot[t] = row.accepted === true;
  }

  const documents_confirmed = (docsRaw || [])
    .filter((d: Record<string, unknown>) => String(d.status || "") === "confirmed")
    .map((d: Record<string, unknown>) => ({
      document_id: String(d.id),
      doc_type: d.doc_type || null,
      charger_id: d.charger_id || null,
      status: d.status || null,
      filename: d.filename || null,
      content_type: d.content_type || null,
      size_bytes: d.size_bytes || null,
      storage_bucket: d.storage_bucket || null,
      storage_path: d.storage_path || null,
      file_sha256: d.file_sha256 || null,
      confirmed_at: d.confirmed_at || null,
      confirmed_request_id: d.confirmed_request_id || null,
      created_at: d.created_at || null,
      updated_at: d.updated_at || null,
    }));

  const missingSha = documents_confirmed.filter((d) => !d.file_sha256);
  if (missingSha.length) {
    await auditReject(
      "export_integrity",
      409,
      "Confirmed documents without file_sha256 found.",
      {
        reason: "confirmed_without_sha",
        missing_sha_document_ids: missingSha.map((x) => x.document_id),
      },
    );

    return finalize(409, {
      ok: false,
      error: "Confirmed documents zonder file_sha256 — export geblokkeerd.",
    });
  }

  const body = {
    ok: true,
    schema_version: "enval-dossier-export.v4",
    generated_at: new Date().toISOString(),
    environment: ENVIRONMENT,

    dossier,
    chargers: chargers || [],
    checks: checks || [],
    consents_latest: consent_snapshot,
    documents_confirmed,
  };

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "dossier_export_generated",
      event_data: {
        charger_count: Array.isArray(chargers) ? chargers.length : 0,
        document_confirmed_count: documents_confirmed.length,
        check_count: Array.isArray(checks) ? checks.length : 0,
      },
    },
    meta,
    { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, body);
});