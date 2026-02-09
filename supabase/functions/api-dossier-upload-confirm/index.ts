// supabase/functions/api-dossier-upload-confirm/index.ts

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

function getEnvironment(): string {
  return (
    Deno.env.get("ENVIRONMENT") ||
    Deno.env.get("ENV") ||
    Deno.env.get("APP_ENV") ||
    "unknown"
  ).toLowerCase();
}

function sb() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function sha256HexFromString(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexFromBytes(buf: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buf);
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

function isSha256Hex(v: string) {
  return /^[0-9a-f]{64}$/.test(v);
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

  // Parse body
  const parsed = await req.json().catch(() => ({} as any));

  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const token = parsed?.token ? String(parsed.token) : "";
  const document_id = parsed?.document_id ? String(parsed.document_id) : "";

  const file_sha256_client_raw = parsed?.file_sha256 ? String(parsed.file_sha256) : "";
  const file_sha256_client = file_sha256_client_raw.trim().toLowerCase();

  // Idempotency required (HEADER ONLY)
  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  if (dossier_id) {
    const cached = await tryGetIdempotentResponse(SB, idemKey);
    if (cached) return json(req, cached.status, cached.body);
  }

  async function finalize(status: number, body: any) {
    await storeIdempotentResponseFailOpen(SB, idemKey, status, body);
    return json(req, status, body);
  }

  async function auditReject(
    dossierId: string,
    actor_ref: string | null,
    stage: string,
    status: number,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id: dossierId,
        actor_type: "customer",
        event_type: "document_upload_confirm_rejected",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );
  }

  // validate input
  if (!dossier_id || !token || !document_id) {
    if (dossier_id && token) {
      const tokenHash = await sha256HexFromString(token);
      const actor_ref = actorRefForCustomer(String(dossier_id), tokenHash);
      await auditReject(
        String(dossier_id),
        actor_ref,
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

    return finalize(400, { ok: false, error: "Missing dossier_id/token/document_id" });
  }

  if (!file_sha256_client) {
    const tokenHash = await sha256HexFromString(token);
    const actor_ref = actorRefForCustomer(String(dossier_id), tokenHash);
    await auditReject(String(dossier_id), actor_ref, "validate_sha256", 400, "Missing file_sha256", {
      reason: "missing_sha",
    });
    return finalize(400, { ok: false, error: "Missing file_sha256" });
  }

  if (!isSha256Hex(file_sha256_client)) {
    const tokenHash = await sha256HexFromString(token);
    const actor_ref = actorRefForCustomer(String(dossier_id), tokenHash);
    await auditReject(
      String(dossier_id),
      actor_ref,
      "validate_sha256",
      400,
      "Invalid file_sha256 (must be 64 hex chars)",
      { reason: "bad_sha_format" },
    );
    return finalize(400, { ok: false, error: "Invalid file_sha256 (must be 64 hex chars)" });
  }

  const tokenHash = await sha256HexFromString(token);
  const actor_ref = actorRefForCustomer(String(dossier_id), tokenHash);

  // dossier auth + lock
  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id, locked_at, status")
    .eq("id", dossier_id)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (dErr) {
    await auditReject(String(dossier_id), actor_ref, "dossier_lookup", 500, dErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: dErr.message });
  }

  if (!dossier) {
    await auditReject(
      String(dossier_id),
      `dossier:${dossier_id}|token:invalid`,
      "auth",
      401,
      "Unauthorized",
      { reason: "unauthorized" },
    );
    return finalize(401, { ok: false, error: "Unauthorized" });
  }

  const st = String(dossier.status || "");
  if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
    await auditReject(
      String(dossier_id),
      actor_ref,
      "dossier_locked",
      409,
      "Dossier is vergrendeld en kan niet meer gewijzigd worden.",
      { status: st, reason: "locked" },
    );
    return finalize(409, { ok: false, error: "Dossier is vergrendeld en kan niet meer gewijzigd worden." });
  }

  // doc lookup
  const { data: doc, error: docErr } = await SB
    .from("dossier_documents")
    .select(
      "id, dossier_id, status, storage_bucket, storage_path, doc_type, charger_id, filename, content_type, size_bytes, file_sha256, confirmed_request_id, confirmed_at",
    )
    .eq("id", document_id)
    .eq("dossier_id", dossier_id)
    .maybeSingle();

  if (docErr) {
    await auditReject(String(dossier_id), actor_ref, "doc_lookup", 500, docErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: docErr.message });
  }

  if (!doc) {
    await auditReject(String(dossier_id), actor_ref, "doc_lookup", 404, "Document not found", {
      document_id,
      reason: "not_found",
    });
    return finalize(404, { ok: false, error: "Document not found" });
  }

  const currentStatus = String(doc.status || "");
  if (currentStatus === "confirmed") {
    const body = {
      ok: true,
      document_id,
      status: "confirmed",
      already_confirmed: true,
      file_sha256: doc.file_sha256 || null,
      confirmed_request_id: doc.confirmed_request_id || null,
      confirmed_at: doc.confirmed_at || null,
    };
    return finalize(200, body);
  }

  if (currentStatus !== "issued") {
    await auditReject(
      String(dossier_id),
      actor_ref,
      "doc_state",
      409,
      "Document status is not 'issued' (cannot confirm).",
      { status: currentStatus, reason: "bad_state" },
    );
    return finalize(409, { ok: false, error: "Document status is not 'issued' (cannot confirm)." });
  }

  const bucket = String(doc.storage_bucket || "");
  const path = String(doc.storage_path || "");
  if (!bucket || !path) {
    await auditReject(String(dossier_id), actor_ref, "doc_metadata", 500, "Document storage metadata missing (bucket/path).", {
      reason: "missing_storage_meta",
    });
    return finalize(500, { ok: false, error: "Document storage metadata missing (bucket/path)." });
  }

  // server-side download + sha256
  const { data: blob, error: dlErr } = await SB.storage.from(bucket).download(path);

  if (dlErr) {
    const msg = String((dlErr as any)?.message || dlErr);
    await auditReject(
      String(dossier_id),
      actor_ref,
      "storage_download",
      409,
      "Upload not found in storage (download failed).",
      { bucket, path, storage_error: msg, reason: "storage_missing" },
    );
    return finalize(409, { ok: false, error: "Upload not found in storage (download failed)." });
  }

  let serverSha = "";
  try {
    const ab = await blob.arrayBuffer();
    serverSha = await sha256HexFromBytes(ab);
  } catch (e: any) {
    await auditReject(
      String(dossier_id),
      actor_ref,
      "hash_compute",
      500,
      "Failed to compute server-side sha256.",
      { bucket, path, error: String(e?.message || e), reason: "hash_compute_failed" },
    );
    return finalize(500, { ok: false, error: "Failed to compute server-side sha256." });
  }

  if (serverSha !== file_sha256_client) {
    await auditReject(
      String(dossier_id),
      actor_ref,
      "hash_mismatch",
      409,
      "file_sha256 mismatch (client != server).",
      {
        bucket,
        path,
        file_sha256_client,
        file_sha256_server: serverSha,
        reason: "hash_mismatch",
      },
    );
    return finalize(409, { ok: false, error: "file_sha256 mismatch (client != server)." });
  }

  const ts = nowIso();

  const { error: upErr } = await SB
    .from("dossier_documents")
    .update({
      status: "confirmed",
      confirmed_at: ts,
      confirmed_by: "customer",
      confirmed_ip: meta.ip || null,
      confirmed_ua: meta.ua || null,
      confirmed_request_id: meta.request_id,
      file_sha256: serverSha,
      updated_at: ts,
    })
    .eq("id", document_id)
    .eq("dossier_id", dossier_id)
    .eq("status", "issued");

  if (upErr) {
    await auditReject(String(dossier_id), actor_ref, "doc_update", 500, upErr.message, { reason: "db_error" });
    return finalize(500, { ok: false, error: upErr.message });
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id: String(dossier_id),
      actor_type: "customer",
      event_type: "document_upload_confirmed",
      event_data: {
        document_id,
        doc_type: doc.doc_type,
        charger_id: doc.charger_id,
        filename: doc.filename,
        storage_bucket: bucket,
        storage_path: path,
        content_type: doc.content_type,
        size_bytes: doc.size_bytes,
        file_sha256_client,
        file_sha256_server: serverSha,
        file_sha256: serverSha,
        verified_server_side: true,
      },
    },
    meta,
    { actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, { ok: true, document_id, status: "confirmed" });
});
