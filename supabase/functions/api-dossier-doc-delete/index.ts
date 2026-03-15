// supabase/functions/api-dossier-doc-delete/index.ts

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

function nowIso() {
  return new Date().toISOString();
}

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
    if (req.method !== "POST") return bad(req, "Method not allowed", 405);

    const SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const idemKey = String(meta.idempotency_key || "").trim();
    if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

    const parsed = await req.json().catch(() => ({} as any));
    const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
    const session_token = parsed?.session_token ? String(parsed.session_token) : null;
    const document_id = parsed?.document_id ? String(parsed.document_id) : null;

    if (!dossier_id || !session_token || !document_id) {
      return json(req, 400, { ok: false, error: "Missing dossier_id/session_token/document_id" });
    }

    const auth = await requireCustomerSession(
      SB,
      dossier_id,
      session_token,
      meta,
      "document_delete_rejected",
    );

    if (!auth.ok) {
      return json(req, auth.status, { ok: false, error: auth.error });
    }

    const idemScopedKey = scopedSessionIdemKey(dossier_id, auth.session_token_hash, idemKey);
    const cached = await tryGetIdempotentResponse(SB, idemScopedKey);
    if (cached) return json(req, cached.status, cached.body);

    async function finalize(status: number, body: any) {
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
          event_type: "document_delete_rejected",
          event_data: {
            stage,
            status,
            message,
            ...(extra || {}),
          },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
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
    const locked = Boolean(dossier.locked_at) || st === "in_review" || st === "ready_for_booking";
    if (locked) {
      const msg = "Dossier is vergrendeld en kan niet meer gewijzigd worden.";
      await auditReject("business_rule", 409, msg, {
        document_id,
        reason: "locked",
        dossier_status: st || null,
      });
      return finalize(409, { ok: false, error: msg, reason: "locked" });
    }

    const { data: doc, error: docErr } = await SB
      .from("dossier_documents")
      .select("id, dossier_id, storage_bucket, storage_path, filename")
      .eq("id", document_id)
      .eq("dossier_id", dossier_id)
      .maybeSingle();

    if (docErr) {
      await auditReject("doc_lookup", 500, docErr.message, { reason: "db_error" });
      return finalize(500, { ok: false, error: docErr.message });
    }

    if (!doc) {
      await auditReject("doc_lookup", 200, "Document not found", {
        document_id,
        reason: "not_found",
      });
      return finalize(200, {
        ok: true,
        deleted: false,
        document_id,
        reason: "not_found",
      });
    }

    const { error: delErr } = await SB
      .from("dossier_documents")
      .delete()
      .eq("id", document_id)
      .eq("dossier_id", dossier_id);

    if (delErr) {
      const msg = String(delErr.message || delErr);

      if (/IMMUTABLE_ROW/i.test(msg) || /cannot be deleted/i.test(msg) || /confirmed/i.test(msg)) {
        const emsg = "Document kan nu niet verwijderd worden (DB policy).";
        await auditReject("db_delete", 409, emsg, {
          document_id,
          reason: "db_policy_block",
          db_error: msg,
          dossier_status: st || null,
        });
        return finalize(409, { ok: false, error: emsg, reason: "db_policy_block" });
      }

      await auditReject("db_delete", 500, `DB delete failed: ${msg}`, {
        document_id,
        reason: "db_error",
      });
      return finalize(500, { ok: false, error: `DB delete failed: ${msg}` });
    }

    let storage_deleted = true;
    let storage_error: string | null = null;

    const { error: sDelErr } = await SB.storage
      .from(String(doc.storage_bucket))
      .remove([String(doc.storage_path)]);

    if (sDelErr) {
      storage_deleted = false;
      storage_error = String((sDelErr as any).message || sDelErr);

      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_delete_storage_failed",
          event_data: {
            stage: "storage_delete",
            status: 200,
            message: "Storage delete failed (db already deleted).",
            document_id,
            storage_path: doc.storage_path,
            storage_bucket: doc.storage_bucket,
            error: storage_error,
            reason: "storage_delete_failed",
          },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
    }

    try {
      const ts = nowIso();
      await SB
        .from("dossiers")
        .update({ status: "incomplete", updated_at: ts })
        .eq("id", dossier_id)
        .eq("status", "ready_for_review")
        .is("locked_at", null);
    } catch (_e) {}

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "document_deleted",
        event_data: {
          document_id,
          filename: doc.filename,
          storage_path: doc.storage_path,
          storage_bucket: doc.storage_bucket,
          storage_deleted,
          storage_error,
          invalidated_ready_for_review: st === "ready_for_review",
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    return finalize(200, {
      ok: true,
      deleted: true,
      document_id,
      storage_deleted,
      storage_error,
      invalidated: st === "ready_for_review",
    });
  } catch (e) {
    console.error("api-dossier-doc-delete fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});