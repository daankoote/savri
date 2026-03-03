
// supabase/functions/api-dossier-doc-delete/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";
import { withIdempotencyStrict } from "../_shared/idempotency.ts";

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

// -------------------- ENV --------------------
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

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function actorRefForCustomer(dossierId: string, tokenHash: string): string {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
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

    // STRICT: alleen Idempotency-Key header telt (via reqmeta)
    const idemKey = String(meta.idempotency_key || "").trim();
    if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

    const result = await withIdempotencyStrict(SB, idemKey, async () => {
      // -------------------- parse body --------------------
      const parsed = await req.json().catch(() => ({} as any));
      const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
      const token = parsed?.token ? String(parsed.token) : null;
      const document_id = parsed?.document_id ? String(parsed.document_id) : null;

      let tokenHash: string | null = null;
      let actor_ref: string | null = null;

      if (dossier_id && token) {
        tokenHash = await sha256Hex(token);
        actor_ref = actorRefForCustomer(dossier_id, tokenHash);
      }

      async function auditReject(
        dossierId: string,
        actorRef: string | null,
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
            event_type: "document_delete_rejected",
            event_data: {
              stage,
              status,
              message,
              ...(extra || {}),
            },
          },
          meta,
          { actor_ref: actorRef, environment: ENVIRONMENT },
        );
      }

      // -------------------- validate input --------------------
      if (!dossier_id || !token || !document_id) {
        if (dossier_id) {
          await auditReject(
            dossier_id,
            actor_ref,
            "validate_input",
            400,
            "Missing dossier_id/token/document_id",
            {
              document_id: document_id ?? null,
              reason: "missing_fields",
            },
          );
        }
        return { status: 400, body: { ok: false, error: "Missing dossier_id/token/document_id" } };
      }

      // -------------------- auth --------------------
      const { data: dossier, error: dErr } = await SB
        .from("dossiers")
        .select("id, locked_at, status")
        .eq("id", dossier_id)
        .eq("access_token_hash", tokenHash)
        .maybeSingle();

      if (dErr) {
        await auditReject(dossier_id, actor_ref, "dossier_lookup", 500, dErr.message, { reason: "db_error" });
        return { status: 500, body: { ok: false, error: dErr.message } };
      }

      if (!dossier) {
        await auditReject(
          dossier_id,
          `dossier:${dossier_id}|token:invalid`,
          "auth",
          401,
          "Unauthorized",
          { document_id, reason: "unauthorized" },
        );
        return { status: 401, body: { ok: false, error: "Unauthorized" } };
      }

      // -------------------- business rule: locked ONLY --------------------
      const st = String(dossier.status || "");
      const locked = Boolean(dossier.locked_at) || st === "in_review" || st === "ready_for_booking";
      if (locked) {
        const msg = "Dossier is vergrendeld en kan niet meer gewijzigd worden.";
        await auditReject(dossier_id, actor_ref, "business_rule", 409, msg, {
          document_id,
          reason: "locked",
          dossier_status: st || null,
        });
        return { status: 409, body: { ok: false, error: msg, reason: "locked" } };
      }

      // -------------------- doc lookup --------------------
      const { data: doc, error: docErr } = await SB
        .from("dossier_documents")
        .select("id, dossier_id, storage_bucket, storage_path, filename")
        .eq("id", document_id)
        .eq("dossier_id", dossier_id)
        .maybeSingle();

      if (docErr) {
        await auditReject(dossier_id, actor_ref, "doc_lookup", 500, docErr.message, { reason: "db_error" });
        return { status: 500, body: { ok: false, error: docErr.message } };
      }

      if (!doc) {
        // EXPECTED: return 200 deleted=false + audit reject with status=200 reason=not_found
        await auditReject(dossier_id, actor_ref, "doc_lookup", 200, "Document not found", {
          document_id,
          reason: "not_found",
        });
        return {
          status: 200,
          body: { ok: true, deleted: false, document_id, reason: "not_found" },
        };
      }

      // -------------------- db delete FIRST --------------------
      const { error: delErr } = await SB
        .from("dossier_documents")
        .delete()
        .eq("id", document_id)
        .eq("dossier_id", dossier_id);

      if (delErr) {
        const msg = String(delErr.message || delErr);

        // Policy/immutability → 409 + audit
        if (/IMMUTABLE_ROW/i.test(msg) || /cannot be deleted/i.test(msg) || /confirmed/i.test(msg)) {
          const emsg = "Document kan nu niet verwijderd worden (DB policy).";
          await auditReject(dossier_id, actor_ref, "db_delete", 409, emsg, {
            document_id,
            reason: "db_policy_block",
            db_error: msg,
            dossier_status: st || null,
          });
          return { status: 409, body: { ok: false, error: emsg, reason: "db_policy_block" } };
        }

        await auditReject(dossier_id, actor_ref, "db_delete", 500, `DB delete failed: ${msg}`, {
          document_id,
          reason: "db_error",
        });
        return { status: 500, body: { ok: false, error: `DB delete failed: ${msg}` } };
      }

      // -------------------- storage delete AFTER db delete (fail-open) --------------------
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
          { actor_ref, environment: ENVIRONMENT },
        );
      }

      // invalidate (fail-open)
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
        { actor_ref, environment: ENVIRONMENT },
      );

      return {
        status: 200,
        body: {
          ok: true,
          deleted: true,
          document_id,
          storage_deleted,
          storage_error,
          invalidated: st === "ready_for_review",
        },
      };
    });

    return json(req, result.status, result.body);
  } catch (e) {
    console.error("api-dossier-doc-delete fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});
