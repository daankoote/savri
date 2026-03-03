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
function ok(req: Request, data: Record<string, unknown> = {}) {
  return json(req, 200, { ok: true, ...data });
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

async function auditReject(
  SB: ReturnType<typeof createClient>,
  dossier_id: string,
  actor_ref: string | null,
  meta: any,
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
    { actor_ref, environment: getEnvironment() },
  );
}

// -------------------- handler --------------------
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

    // Idempotency header verplicht (read-ish maar security sensitive + evidence)
    const idemKey = String(meta.idempotency_key || "").trim();
    if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

    // Parse body vroeg
    const parsed = await req.json().catch(() => ({} as any));
    const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
    const token = parsed?.token ? String(parsed.token) : null;
    const document_id = parsed?.document_id ? String(parsed.document_id) : null;

    // Als dossier_id ontbreekt: geen scope voor audit => direct bad
    if (!dossier_id || !token || !document_id) {
      // Als we wél dossier_id hebben kunnen we reject auditen
      if (dossier_id) {
        const SBtmp = createClient(
          getEnv("SUPABASE_URL"),
          getEnv("SUPABASE_SERVICE_ROLE_KEY"),
          { auth: { persistSession: false } },
        );

        let actor_ref: string | null = null;
        if (token) {
          const tokenHash = await sha256Hex(token);
          actor_ref = actorRefForCustomer(dossier_id, tokenHash);
        }

        await auditReject(
          SBtmp,
          dossier_id,
          actor_ref,
          meta,
          "validate_input",
          400,
          "Missing dossier_id/token/document_id",
          {
            reason: "missing_fields",
            missing: {
              dossier_id: !dossier_id,
              token: !token,
              document_id: !document_id,
            },
          },
        );
      }

      return bad(req, "Missing dossier_id/token/document_id", 400);
    }

    const SB = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const tokenHash = await sha256Hex(token);
    const actor_ref = actorRefForCustomer(dossier_id, tokenHash);

    // -------------------- dossier auth + locked check --------------------
    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .select("id, status, locked_at")
      .eq("id", dossier_id)
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (dErr) {
      await auditReject(SB, dossier_id, actor_ref, meta, "dossier_lookup", 500, dErr.message, { reason: "db_error" });
      return bad(req, dErr.message, 500);
    }

    if (!dossier) {
      await auditReject(
        SB,
        dossier_id,
        `dossier:${dossier_id}|token:invalid`,
        meta,
        "auth",
        401,
        "Unauthorized",
        { reason: "unauthorized", document_id },
      );
      return bad(req, "Unauthorized", 401);
    }

    if (
      !dossier.locked_at &&
      !["in_review", "ready_for_booking"].includes(String(dossier.status))
    ) {
      await auditReject(
        SB,
        dossier_id,
        actor_ref,
        meta,
        "export_gate",
        409,
        "Dossier not locked for review",
        { reason: "not_locked", status: String(dossier.status || ""), locked_at: dossier.locked_at || null, document_id },
      );
      return bad(req, "Dossier not locked for review", 409);
    }

    // -------------------- document: confirmed only --------------------
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
      await auditReject(SB, dossier_id, actor_ref, meta, "doc_lookup", 500, docErr.message, {
        reason: "db_error",
        document_id,
      });
      return bad(req, docErr.message, 500);
    }
    if (!doc) {
      await auditReject(
        SB,
        dossier_id,
        actor_ref,
        meta,
        "doc_lookup",
        404,
        "Confirmed document not found",
        { reason: "not_found", document_id },
      );
      return bad(req, "Confirmed document not found", 404);
    }

    if (!doc.file_sha256 || !doc.confirmed_at) {
      await auditReject(
        SB,
        dossier_id,
        actor_ref,
        meta,
        "integrity_gate",
        409,
        "Document is not evidence-grade",
        { reason: "not_evidence_grade", document_id },
      );
      return bad(req, "Document is not evidence-grade", 409);
    }

    // -------------------- signed url --------------------
    const expiresIn = 120; // seconds (short-lived)
    const { data: signed, error: sErr } = await SB
      .storage
      .from(String(doc.storage_bucket))
      .createSignedUrl(String(doc.storage_path), expiresIn);

    if (sErr || !signed?.signedUrl) {
      await auditReject(
        SB,
        dossier_id,
        actor_ref,
        meta,
        "signed_url",
        500,
        "Signed URL generation failed",
        {
          reason: "storage_error",
          document_id,
          storage_bucket: String(doc.storage_bucket || ""),
          storage_path: String(doc.storage_path || ""),
          storage_error: String((sErr as any)?.message || sErr || ""),
        },
      );
      return bad(req, "Signed URL generation failed", 500);
    }

    // -------------------- audit success --------------------
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
        },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );

    return ok(req, {
      document_id,
      filename: doc.filename,
      expires_in: expiresIn,
      download_url: signed.signedUrl,
    });
  } catch (e) {
    console.error("api-dossier-doc-download-url fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});
