// supabase/functions/api-dossier-observed-source-upsert/index.ts

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
import { type InvoiceObservedFields } from "../_shared/analysis.ts";

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeInvoiceObservedFields(raw: unknown): InvoiceObservedFields {
  const obj = asRecord(raw);

  return {
    customer_name: asStringOrNull(obj.customer_name),
    address_line: asStringOrNull(obj.address_line),
    house_number: asStringOrNull(obj.house_number),
    postcode_line: asStringOrNull(obj.postcode_line),
    city_line: asStringOrNull(obj.city_line),
    country_line: asStringOrNull(obj.country_line),
    brand: asStringOrNull(obj.brand),
    model: asStringOrNull(obj.model),
    serial_number: asStringOrNull(obj.serial_number),
    serial_candidate_raw: asStringOrNull(obj.serial_candidate_raw),
    mid_number: asStringOrNull(obj.mid_number),
    mid_candidate_raw: asStringOrNull(obj.mid_candidate_raw),
  };
}

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
  const document_id = parsed?.document_id ? String(parsed.document_id) : null;

  const producer_kind = asStringOrNull(parsed?.producer_kind);
  const producer_version = asStringOrNull(parsed?.producer_version);
  const source_kind = asStringOrNull(parsed?.source_kind) || "unknown";
  const status = asStringOrNull(parsed?.status) || "completed";

  const observed_fields = normalizeInvoiceObservedFields(parsed?.observed_fields);
  const confidence = asRecord(parsed?.confidence);
  const limitations = asStringArray(parsed?.limitations);
  const summary = asRecord(parsed?.summary);

  const field_sources = (() => {
    const v = parsed?.field_sources;
    return v && typeof v === "object" && !Array.isArray(v)
      ? v as Record<string, unknown>
      : {};
  })();

  const pages = Array.isArray(parsed?.pages) ? parsed.pages : [];

  if (!dossier_id || !session_token) {
    return json(req, 400, { ok: false, error: "Missing dossier_id/session_token" });
  }

  const auth = await requireCustomerSession(
    SB,
    dossier_id,
    session_token,
    meta,
    "document_observed_source_upsert_rejected",
  );

  if (!auth.ok) {
    return json(req, auth.status, { ok: false, error: auth.error });
  }

  const idemScopedKey = scopedSessionIdemKey(dossier_id, auth.session_token_hash, idemKey);
  const cached = await tryGetIdempotentResponse(SB, idemScopedKey);
  if (cached) return json(req, cached.status, cached.body);

  async function finalize(statusCode: number, body: Record<string, unknown>) {
    await storeIdempotentResponseFailOpen(SB, idemScopedKey, statusCode, body);
    return json(req, statusCode, body);
  }

  async function auditReject(
    stage: string,
    statusCode: number,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "document_observed_source_upsert_rejected",
        event_data: {
          stage,
          status: statusCode,
          message,
          document_id,
          producer_kind,
          producer_version,
          source_kind,
          ...(extra || {}),
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );
  }

  if (!document_id) {
    await auditReject("validate_input", 400, "Missing document_id", {
      reason: "missing_document_id",
    });
    return finalize(400, { ok: false, error: "Missing document_id" });
  }

  if (!producer_kind || !producer_version) {
    await auditReject("validate_input", 400, "Missing producer_kind/producer_version", {
      reason: "missing_producer_meta",
    });
    return finalize(400, { ok: false, error: "Missing producer_kind/producer_version" });
  }

  if (!["completed", "failed"].includes(status)) {
    await auditReject("validate_input", 400, "Invalid status", {
      reason: "bad_status",
      status_value: status,
    });
    return finalize(400, { ok: false, error: "Invalid status" });
  }

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id, locked_at, status")
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
  if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
    await auditReject(
      "dossier_locked",
      409,
      "Dossier is vergrendeld en kan niet meer gewijzigd worden.",
      { reason: "locked", status: st },
    );
    return finalize(409, { ok: false, error: "Dossier is vergrendeld en kan niet meer gewijzigd worden." });
  }

  const { data: doc, error: docErr } = await SB
    .from("dossier_documents")
    .select("id,dossier_id,charger_id,doc_type,status,filename,content_type,file_sha256,confirmed_at")
    .eq("id", document_id)
    .eq("dossier_id", dossier_id)
    .maybeSingle();

  if (docErr) {
    await auditReject("document_lookup", 500, docErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: docErr.message });
  }

  if (!doc) {
    await auditReject("document_lookup", 404, "Document not found", {
      reason: "not_found",
    });
    return finalize(404, { ok: false, error: "Document not found" });
  }

  if (String(doc.status || "") !== "confirmed") {
    await auditReject("document_state", 409, "Document must be confirmed before observed-source upsert.", {
      reason: "document_not_confirmed",
      document_status: doc.status || null,
    });
    return finalize(409, { ok: false, error: "Document must be confirmed before observed-source upsert." });
  }

  if (String(doc.doc_type || "") !== "factuur") {
    await auditReject("document_type", 409, "Observed-source upsert is current alleen toegestaan voor factuur.", {
      reason: "unsupported_doc_type",
      doc_type: doc.doc_type || null,
    });
    return finalize(409, { ok: false, error: "Observed-source upsert is current alleen toegestaan voor factuur." });
  }

  const row = {
    dossier_id,
    document_id,
    charger_id: doc.charger_id || null,
    doc_type: String(doc.doc_type || "factuur"),
    source_kind,
    producer_kind,
    producer_version,
    status,
    observed_fields,
    confidence,
    limitations,
    summary,
    field_sources,
    pages,
  };

  const { error: upsertErr } = await SB
    .from("dossier_document_observed_sources")
    .upsert(row, { onConflict: "document_id" });

  if (upsertErr) {
    await auditReject("observed_source_upsert", 500, upsertErr.message, {
      reason: "db_error",
    });
    return finalize(500, { ok: false, error: upsertErr.message });
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "document_observed_source_upserted",
      event_data: {
        document_id,
        charger_id: doc.charger_id || null,
        doc_type: doc.doc_type || null,
        filename: doc.filename || null,
        content_type: doc.content_type || null,
        file_sha256: doc.file_sha256 || null,
        confirmed_at: doc.confirmed_at || null,
        producer_kind,
        producer_version,
        source_kind,
        status,
        limitations_count: limitations.length,
      },
    },
    meta,
    { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, {
    ok: true,
    dossier_id,
    document_id,
    charger_id: doc.charger_id || null,
    doc_type: doc.doc_type || null,
    producer_kind,
    producer_version,
    source_kind,
    status,
  });
});