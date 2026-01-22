import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";

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
      "authorization, x-client-info, apikey, content-type, idempotency-key, Idempotency-Key",
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
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function nowIso() {
  return new Date().toISOString();
}

// -------------------- Idempotency --------------------
async function reserveIdempotencyKey(SB: any, key: string) {
  const { error } = await SB.from("idempotency_keys").insert([{ key }]);
  return error;
}
async function replayIdempotencyKey(SB: any, key: string) {
  const { data, error } = await SB
    .from("idempotency_keys")
    .select("response_status,response_body")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Idempotency lookup failed: ${error.message}`);
  return data;
}
async function finalizeIdempotency(SB: any, key: string, status: number, body: any) {
  const { error } = await SB
    .from("idempotency_keys")
    .update({ response_status: status, response_body: body })
    .eq("key", key);
  if (error) console.error("Idempotency finalize failed:", error);
}

serve(async (req) => {
  console.log("[REQ]", {
    fn: "api-dossier-doc-delete",
    method: req.method,
    path: new URL(req.url).pathname,
    request_id: req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || null,
  });

  const meta = getReqMeta(req);

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
    if (req.method !== "POST") return bad(req, "Method not allowed", 405);

    const SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const idemKey = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
    if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

    const reserveErr = await reserveIdempotencyKey(SB, idemKey);
    if (reserveErr) {
      try {
        const row = await replayIdempotencyKey(SB, idemKey);
        if (row?.response_body && row?.response_status) {
          return json(req, row.response_status, row.response_body);
        }
        return bad(req, "Request already in progress", 409);
      } catch (e: any) {
        console.error(e);
        return bad(req, e?.message || "Idempotency error", 500);
      }
    }

    async function finalize(status: number, body: any) {
      await finalizeIdempotency(SB, idemKey, status, body);
      return json(req, status, body);
    }

    const { dossier_id, token, document_id } = await req.json().catch(() => ({}));
    if (!dossier_id || !token || !document_id) {
      return finalize(400, { ok: false, error: "Missing dossier_id/token/document_id" });
    }

    const tokenHash = await sha256Hex(String(token));
    const actor_ref = tokenHash.slice(0, 12);

    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .select("id, locked_at, status")
      .eq("id", dossier_id)
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (dErr) return finalize(500, { ok: false, error: dErr.message });
    if (!dossier) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_delete_rejected",
          event_data: { document_id, reason: "unauthorized" },
        },
        meta,
        { actor_ref },
      );
      return finalize(401, { ok: false, error: "Unauthorized" });
    }

    const st = String(dossier.status || "");
    if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_delete_rejected",
          event_data: { document_id, reason: "locked" },
        },
        meta,
        { actor_ref },
      );
      return finalize(409, { ok: false, error: "Dossier is vergrendeld en kan niet meer gewijzigd worden." });
    }

    const { data: doc, error: docErr } = await SB
      .from("dossier_documents")
      .select("id, dossier_id, storage_bucket, storage_path, filename")
      .eq("id", document_id)
      .eq("dossier_id", dossier_id)
      .maybeSingle();

    if (docErr) return finalize(500, { ok: false, error: docErr.message });

    // -------------------- IMPORTANT CHANGE --------------------
    // Bestaat doc niet? Dan is dit audit-wise een REJECT (not_found),
    // maar we houden response 200 (idempotent).
    if (!doc) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "document_delete_rejected",
          event_data: { document_id, reason: "not_found" },
        },
        meta,
        { actor_ref },
      );

      return finalize(200, {
        ok: true,
        deleted: false,
        document_id,
        reason: "not_found",
      });
    }
    // ---------------------------------------------------------

    const { error: sDelErr } = await SB.storage
      .from(String(doc.storage_bucket))
      .remove([String(doc.storage_path)]);

    if (sDelErr) {
      const msg = String((sDelErr as any).message || sDelErr);
      if (!/not\s*found/i.test(msg) && !/does\s*not\s*exist/i.test(msg)) {
        return finalize(500, { ok: false, error: `Storage delete failed: ${msg}` });
      }
    }

    const { error: delErr } = await SB
      .from("dossier_documents")
      .delete()
      .eq("id", document_id)
      .eq("dossier_id", dossier_id);

    if (delErr) return finalize(500, { ok: false, error: `DB delete failed: ${delErr.message}` });

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
        },
      },
      meta,
      { actor_ref },
    );

    return finalize(200, { ok: true, deleted: true, document_id });
  } catch (e) {
    console.error("api-dossier-doc-delete fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});
