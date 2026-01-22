import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
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

serve(async (req) => {
  console.log("[REQ]", {
    fn: "api-dossier-charger-delete",
    method: req.method,
    path: new URL(req.url).pathname,
    request_id: req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || null,
  });

  const meta = getReqMeta(req);

  async function auditAndReturn(opts: {
    SB?: any;
    dossier_id?: string | null;
    actor_ref?: string | null;
    event_type: string;
    event_data?: Record<string, unknown>;
    http_status: number;
    response_body: any;
  }) {
    const dossier_id = opts.dossier_id ?? null;
    if (opts.SB && dossier_id) {
      try {
        await insertAuditFailOpen(
          opts.SB,
          {
            dossier_id,
            actor_type: "customer",
            event_type: opts.event_type,
            event_data: opts.event_data || {},
          },
          meta,
          { actor_ref: opts.actor_ref || null },
        );
      } catch (_e) {}
    }
    return json(req, opts.http_status, opts.response_body);
  }

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
    if (req.method !== "POST") return bad(req, "Method not allowed", 405);

    const { dossier_id, token, charger_id } = await req.json().catch(() => ({}));
    if (!dossier_id || !token || !charger_id) {
      // cannot audit without dossier_id (NOT NULL)
      return bad(req, "Missing dossier_id/token/charger_id", 400);
    }

    const SB = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const tokenHash = await sha256Hex(String(token));
    const actor_ref = tokenHash.slice(0, 12);

    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .select("id, locked_at, status")
      .eq("id", dossier_id)
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (dErr) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_failed",
        event_data: { reason: "dossier_lookup_failed", error: dErr.message, charger_id },
        http_status: 500,
        response_body: { ok: false, error: dErr.message },
      });
    }
    if (!dossier) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_rejected",
        event_data: { reason: "unauthorized", charger_id },
        http_status: 401,
        response_body: { ok: false, error: "Unauthorized" },
      });
    }

    const st = String(dossier.status || "");
    if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_rejected",
        event_data: { reason: "dossier_locked", status: st, charger_id },
        http_status: 409,
        response_body: { ok: false, error: "Dossier is vergrendeld en kan niet meer gewijzigd worden." },
      });
    }

    const { data: ch, error: chErr } = await SB
      .from("dossier_chargers")
      .select("id")
      .eq("id", charger_id)
      .eq("dossier_id", dossier_id)
      .maybeSingle();

    if (chErr) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_failed",
        event_data: { reason: "charger_lookup_failed", error: chErr.message, charger_id },
        http_status: 500,
        response_body: { ok: false, error: `Charger lookup failed: ${chErr.message}` },
      });
    }
    if (!ch) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_rejected",
        event_data: { reason: "charger_not_found", charger_id },
        http_status: 404,
        response_body: { ok: false, error: "Laadpaal niet gevonden in dit dossier." },
      });
    }

    const ts = nowIso();

    async function invalidateIfNeeded(): Promise<boolean> {
      if (st !== "ready_for_review") return false;

      const { error: sErr } = await SB
        .from("dossiers")
        .update({ status: "incomplete", updated_at: ts })
        .eq("id", dossier_id)
        .eq("status", "ready_for_review")
        .is("locked_at", null);

      if (sErr) throw new Error(`Status invalidation failed: ${sErr.message}`);
      return true;
    }

    const { data: docs, error: docErr } = await SB
      .from("dossier_documents")
      .select("id, storage_bucket, storage_path, filename")
      .eq("dossier_id", dossier_id)
      .eq("charger_id", charger_id);

    if (docErr) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_failed",
        event_data: { reason: "docs_read_failed", error: docErr.message, charger_id },
        http_status: 500,
        response_body: { ok: false, error: `Docs read failed: ${docErr.message}` },
      });
    }

    let storageDeleted = 0;
    const byBucket: Record<string, string[]> = {};

    for (const d of (docs || [])) {
      const b = String((d as any).storage_bucket || "").trim();
      const p = String((d as any).storage_path || "").trim();
      if (!b || !p) continue;
      if (!byBucket[b]) byBucket[b] = [];
      byBucket[b].push(p);
    }

    for (const b of Object.keys(byBucket)) {
      const paths = byBucket[b];
      if (!paths.length) continue;

      const { error: sDelErr } = await SB.storage.from(b).remove(paths);
      if (sDelErr) {
        return auditAndReturn({
          SB,
          dossier_id,
          actor_ref,
          event_type: "charger_delete_failed",
          event_data: { reason: "storage_delete_failed", error: sDelErr.message, bucket: b, charger_id },
          http_status: 500,
          response_body: { ok: false, error: `Storage delete failed: ${sDelErr.message}` },
        });
      }

      storageDeleted += paths.length;
    }

    const { error: dbDocDelErr } = await SB
      .from("dossier_documents")
      .delete()
      .eq("dossier_id", dossier_id)
      .eq("charger_id", charger_id);

    if (dbDocDelErr) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_failed",
        event_data: { reason: "document_delete_failed", error: dbDocDelErr.message, charger_id },
        http_status: 500,
        response_body: { ok: false, error: `Document delete failed: ${dbDocDelErr.message}` },
      });
    }

    const { error: delErr } = await SB
      .from("dossier_chargers")
      .delete()
      .eq("id", charger_id)
      .eq("dossier_id", dossier_id);

    if (delErr) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_failed",
        event_data: { reason: "charger_delete_failed", error: delErr.message, charger_id },
        http_status: 500,
        response_body: { ok: false, error: `Charger delete failed: ${delErr.message}` },
      });
    }

    let invalidated = false;
    try {
      invalidated = await invalidateIfNeeded();
    } catch (e: any) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_delete_failed",
        event_data: { reason: "status_invalidation_failed", error: e?.message || String(e), charger_id },
        http_status: 500,
        response_body: { ok: false, error: e?.message || "Status invalidation failed" },
      });
    }

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "charger_deleted",
        event_data: {
          charger_id,
          deleted_documents: (docs || []).length,
          deleted_storage_objects: storageDeleted,
          invalidated,
        },
      },
      meta,
      { actor_ref },
    );

    return ok(req, {
      deleted: true,
      charger_id,
      deleted_documents: (docs || []).length,
      deleted_storage_objects: storageDeleted,
      invalidated,
    });
  } catch (e) {
    console.error("api-dossier-charger-delete fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});
