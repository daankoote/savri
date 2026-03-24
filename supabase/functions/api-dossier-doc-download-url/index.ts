// supabase/functions/api-dossier-doc-download-url/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";
import {
  requireCustomerSession,
  scopedSessionIdemKey,
} from "../_shared/customer_auth.ts";
import {
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

// -------------------- helpers --------------------
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

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeadersFor(req) });
    }
    if (req.method !== "POST") {
      return bad(req, "Method not allowed", 405);
    }

    const idemKey = String(meta.idempotency_key || "").trim();
    if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

    const parsed = await req.json().catch(() => ({} as Record<string, unknown>));
    const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
    const session_token = parsed?.session_token ? String(parsed.session_token) : null;
    const document_id = parsed?.document_id ? String(parsed.document_id) : null;

    if (!dossier_id || !session_token || !document_id) {
      return bad(req, "Missing dossier_id/session_token/document_id", 400);
    }

    const SB = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const auth = await requireCustomerSession(
      SB,
      dossier_id,
      session_token,
      meta,
      "document_download_url_rejected",
    );

    if (!auth.ok) {
      return bad(req, auth.error, auth.status);
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
          event_type: "document_download_url_rejected",
          event_data: { stage, status, message, ...(extra || {}) },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
    }

    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .select("id, status, locked_at")
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

    const { data: doc, error: docErr } = await SB
      .from("dossier_documents")
      .select([
        "id",
        "doc_type",
        "status",
        "file_sha256",
        "storage_bucket",
        "storage_path",
        "filename",
        "confirmed_at",
      ].join(","))
      .eq("id", document_id)
      .eq("dossier_id", dossier_id)
      .eq("status", "confirmed")
      .maybeSingle();

    if (docErr) {
      await auditReject("doc_lookup", 500, docErr.message, {
        reason: "db_error",
        document_id,
      });
      return finalize(500, { ok: false, error: docErr.message });
    }
    if (!doc) {
      await auditReject("doc_lookup", 404, "Confirmed document not found", {
        reason: "not_found",
        document_id,
      });
      return finalize(404, { ok: false, error: "Confirmed document not found" });
    }

    if (!doc.file_sha256 || !doc.confirmed_at) {
      await auditReject(
        "integrity_gate",
        409,
        "Document is not evidence-grade",
        { reason: "not_evidence_grade", document_id },
      );
      return finalize(409, { ok: false, error: "Document is not evidence-grade" });
    }

    const expiresIn = 120;
    const { data: signed, error: sErr } = await SB
      .storage
      .from(String(doc.storage_bucket))
      .createSignedUrl(String(doc.storage_path), expiresIn);

    if (sErr || !signed?.signedUrl) {
      await auditReject(
        "signed_url",
        500,
        "Signed URL generation failed",
        {
          reason: "storage_error",
          document_id,
          storage_bucket: String(doc.storage_bucket || ""),
          storage_path: String(doc.storage_path || ""),
          storage_error: String((sErr as Error | null)?.message || sErr || ""),
        },
      );
      return finalize(500, { ok: false, error: "Signed URL generation failed" });
    }

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "document_download_url_issued",
        event_data: {
          document_id,
          doc_type: doc.doc_type,
          expires_in_seconds: expiresIn,
          dossier_status: String(dossier.status || ""),
          dossier_locked_at: dossier.locked_at || null,
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    return finalize(200, {
      ok: true,
      document_id,
      filename: doc.filename,
      expires_in: expiresIn,
      signed_url: signed.signedUrl,
    });
  } catch (e) {
    console.error("api-dossier-doc-download-url fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});