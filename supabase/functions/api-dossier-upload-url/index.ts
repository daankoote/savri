// supabase/functions/api-dossier-upload-url/index.ts

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

// -------------------- ENV + client --------------------
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

// -------------------- helpers --------------------
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeFilename(name: string) {
  return String(name || "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

function getExt(name: string) {
  const s = String(name || "").trim().toLowerCase();
  const parts = s.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function nowIso() {
  return new Date().toISOString();
}

function actorRefForCustomer(dossierId: string, tokenHash: string) {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

// -------------------- allowlists --------------------
const VALID_DOC_TYPES = new Set(["factuur", "foto_laadpunt", "mandaat", "id", "kvk", "overig"]);
const DOC_TYPES_REQUIRE_CHARGER = new Set(["factuur", "foto_laadpunt"]);

const ALLOWED_EXT = new Set(["pdf", "png", "jpg", "jpeg", "doc", "docx"]);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_PER_CHARGER_DOC_TYPE = 1;

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

  // -------------------- parse body early --------------------
  const parsed = await req.json().catch(() => ({} as any));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const token = parsed?.token ? String(parsed.token) : "";
  const doc_type = parsed?.doc_type;
  const filename = parsed?.filename;
  const content_type = parsed?.content_type;
  const size_bytes = parsed?.size_bytes;
  const charger_id = parsed?.charger_id;

  // -------------------- Idempotency (required) --------------------
  // LET OP: request_id is GEEN idempotency-key.
  // Alleen de Idempotency-Key header telt. (Test A verwacht 400 zonder die header.)
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

  // tokenHash/actor_ref pas nadat we zeker weten dat dossier_id + token er zijn
  let tokenHash = "";
  let actor_ref = "";


  async function reject(stage: string, status: number, message: string, extra?: Record<string, unknown>) {
    if (dossier_id) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_upload_url_rejected",
          event_data: {
            stage,
            status,
            message,
            ...(extra || {}),
          },
        },
        meta,
        { actor_ref, environment: ENVIRONMENT },
      );
    }
    return finalize(status, { ok: false, error: message });
  }

  // -------------------- validate input --------------------
  if (!dossier_id || !token || !doc_type || !filename) {
    return reject("validate_input", 400, "Missing dossier_id/token/doc_type/filename", {
      reason: "missing_fields",
      dossier_id_present: !!dossier_id,
      token_present: !!token,
      doc_type_present: !!doc_type,
      filename_present: !!filename,
    });
  }

  tokenHash = await sha256Hex(token);
  actor_ref = actorRefForCustomer(dossier_id, tokenHash);


  const dt = String(doc_type).trim().toLowerCase();
  if (!VALID_DOC_TYPES.has(dt)) {
    return reject("validate_doc_type", 400, "Invalid doc_type", { doc_type: dt, reason: "invalid_doc_type" });
  }

  const requiresCharger = DOC_TYPES_REQUIRE_CHARGER.has(dt);
  const chId = charger_id ? String(charger_id).trim() : "";

  if (requiresCharger && !chId) {
    return reject("validate_charger_id", 400, "charger_id is verplicht voor dit documenttype.", {
      doc_type: dt,
      reason: "charger_required",
    });
  }

  const clean = safeFilename(filename);
  const ext = getExt(clean);
  const mime = String(content_type || "").trim().toLowerCase();
  const bytes = size_bytes === null || size_bytes === undefined ? null : Number(size_bytes);

  if (!ALLOWED_EXT.has(ext)) {
    return reject(
      "validate_file_ext",
      400,
      "Ongeldig bestandstype. Alleen: PDF, PNG, JPG/JPEG, DOC, DOCX.",
      { ext, filename: clean, reason: "bad_extension" },
    );
  }

  if (mime && !ALLOWED_MIME.has(mime)) {
    return reject(
      "validate_mime",
      400,
      "Ongeldig bestandstype (content-type). Alleen: PDF/PNG/JPEG/DOC/DOCX.",
      { mime, reason: "bad_mime" },
    );
  }

  if (bytes !== null) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return reject("validate_size", 400, "Ongeldige bestandsgrootte.", {
        size_bytes: bytes,
        reason: "bad_size",
      });
    }
    if (bytes > MAX_BYTES) {
      return reject("validate_size", 400, "Bestand te groot. Max 15MB.", {
        size_bytes: bytes,
        reason: "too_large",
        max_bytes: MAX_BYTES,
      });
    }
  }

  // -------------------- auth + lock --------------------
  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id, locked_at, status")
    .eq("id", dossier_id)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (dErr) return reject("dossier_lookup", 500, dErr.message, { reason: "db_error" });

  if (!dossier) {
    // actor_ref bij unauthorized: expliciet invalid token
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "document_upload_url_rejected",
        event_data: { stage: "auth", status: 401, message: "Unauthorized", reason: "unauthorized" },
      },
      meta,
      { actor_ref: `dossier:${dossier_id}|token:invalid`, environment: ENVIRONMENT },
    );
    return finalize(401, { ok: false, error: "Unauthorized" });
  }


  const st = String(dossier.status || "");
  if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
    return reject("dossier_locked", 409, "Dossier is vergrendeld en kan niet meer gewijzigd worden.", {
      status: st,
      reason: "locked",
    });
  }

  const ts = nowIso();

  async function invalidateIfNeeded() {
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

  // -------------------- optional charger validation --------------------
  let chargerIdToStore: string | null = null;
  if (chId) {
    const { data: ch, error: chErr } = await SB
      .from("dossier_chargers")
      .select("id")
      .eq("id", chId)
      .eq("dossier_id", dossier_id)
      .maybeSingle();

    if (chErr) return reject("charger_lookup", 500, `Charger lookup failed: ${chErr.message}`, { reason: "db_error" });
    if (!ch) return reject("charger_lookup", 400, "Ongeldige charger_id (niet gevonden in dit dossier).", {
      reason: "charger_not_found",
    });

    chargerIdToStore = chId;
  }

  // -------------------- per-charger doc limit (confirmed + issued should block; current rule blocks non-rejected) --------------------
  if (chargerIdToStore && (dt === "factuur" || dt === "foto_laadpunt")) {
    const { count, error: cntErr } = await SB
      .from("dossier_documents")
      .select("id", { count: "exact", head: true })
      .eq("dossier_id", dossier_id)
      .eq("charger_id", chargerIdToStore)
      .eq("doc_type", dt)
      .neq("status", "rejected"); // defensive

    if (cntErr) return reject("doc_count", 500, `Doc count failed: ${cntErr.message}`, { reason: "db_error" });

    const have = Number(count || 0) || 0;
    if (have >= MAX_PER_CHARGER_DOC_TYPE) {
      return reject(
        "doc_limit",
        409,
        `Er is al een ${dt === "factuur" ? "factuur" : "foto"} toegevoegd voor deze laadpaal. Verwijder eerst het bestaande document.`,
        { have, limit: MAX_PER_CHARGER_DOC_TYPE, doc_type: dt, reason: "doc_limit" },
      );
    }
  }

  // -------------------- issue signed upload + insert metadata --------------------
  const docId = crypto.randomUUID();
  const path = `dossiers/${dossier_id}/${docId}_${clean}`;
  const bucket = "enval-dossiers";

  const { data: signed, error: sErr } = await SB.storage.from(bucket).createSignedUploadUrl(path);
  if (sErr || !signed) return reject("signed_upload_url", 500, sErr?.message || "Signed upload failed", { reason: "storage_error" });

  const { error: mErr } = await SB.from("dossier_documents").insert([
    {
      id: docId,
      dossier_id,
      charger_id: chargerIdToStore,
      doc_type: dt,
      filename: clean,
      storage_bucket: bucket,
      storage_path: path,
      content_type: mime || null,
      size_bytes: bytes,
      uploaded_by: "customer",
      status: "issued",
    },
  ]);

  if (mErr) {
    const pgCode = (mErr as any)?.code || "";
    const msg = String((mErr as any)?.message || "");

    if (pgCode === "23505" && chargerIdToStore && (dt === "factuur" || dt === "foto_laadpunt")) {
      return reject(
        "metadata_insert_unique",
        409,
        `Er is al een ${dt === "factuur" ? "factuur" : "foto"} toegevoegd voor deze laadpaal. Verwijder eerst het bestaande document.`,
        { reason: "unique_violation", code: "23505" },
      );
    }

    return reject("metadata_insert", 500, `Metadata insert failed: ${msg}`, { reason: "db_error" });
  }

  let invalidated = false;
  try {
    invalidated = await invalidateIfNeeded();
  } catch (e: any) {
    return reject("status_invalidation", 500, e?.message || "Status invalidation failed", { reason: "db_error" });
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "document_upload_url_issued",
      event_data: {
        document_id: docId,
        doc_type: dt,
        charger_id: chargerIdToStore,
        storage_bucket: bucket,
        storage_path: path,
        filename: clean,
        content_type: mime || null,
        size_bytes: bytes,
        invalidated_ready_for_review: invalidated,
      },
    },
    meta,
    { actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, {
    ok: true,
    document_id: docId,
    bucket,
    path,
    charger_id: chargerIdToStore,
    signed_url: signed.signedUrl,
    token: signed.token,
    invalidated,
  });
});
