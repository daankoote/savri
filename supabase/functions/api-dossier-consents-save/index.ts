// supabase/functions/api-dossier-consents-save/index.ts

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

function asBool(v: unknown) {
  return v === true;
}

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
    if (req.method !== "POST") return json(req, 405, { ok: false, error: "Method not allowed" });

    const SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const idemKey = String(meta.idempotency_key || "").trim();
    if (!idemKey) {
      return json(req, 400, { ok: false, error: "Missing Idempotency-Key" });
    }

    const parsed = await req.json().catch(() => ({} as any));
    const dossierId = parsed?.dossier_id ? String(parsed.dossier_id) : null;
    const session_token = parsed?.session_token ? String(parsed.session_token) : null;
    const consents = parsed?.consents;

    if (!dossierId || !session_token) {
      return json(req, 400, { ok: false, error: "Missing dossier_id/session_token" });
    }

    const auth = await requireCustomerSession(
      SB,
      dossierId,
      session_token,
      meta,
      "consents_save_rejected",
    );

    if (!auth.ok) {
      return json(req, auth.status, { ok: false, error: auth.error });
    }

    const idemScopedKey = scopedSessionIdemKey(dossierId, auth.session_token_hash, idemKey);
    const cached = await tryGetIdempotentResponse(SB, idemScopedKey);
    if (cached) return json(req, cached.status, cached.body);

    async function finalize(status: number, body: any) {
      await storeIdempotentResponseFailOpen(SB, idemScopedKey, status, body);
      return json(req, status, body);
    }

    async function reject(stage: string, status: number, message: string, extra?: Record<string, unknown>) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id: dossierId,
          actor_type: "customer",
          event_type: "consents_save_rejected",
          event_data: { stage, status, message, ...(extra || {}) },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );
      return finalize(status, { ok: false, error: message });
    }

    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .select("id, locked_at, status, customer_email")
      .eq("id", dossierId)
      .maybeSingle();

    if (dErr) return reject("db_read", 500, dErr.message);
    if (!dossier) return reject("dossier_lookup", 404, "Dossier not found", { reason: "not_found" });

    const st = String(dossier.status || "");
    if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
      return reject("dossier_locked", 409, "Dossier is vergrendeld en kan niet meer gewijzigd worden.");
    }

    if (!consents || typeof consents !== "object") {
      return reject("validate", 400, "Missing consents object");
    }

    const terms = asBool(consents?.terms);
    const privacy = asBool(consents?.privacy);
    const mandaat = asBool(consents?.mandaat);

    if (!terms || !privacy || !mandaat) {
      return reject("validate", 400, "Vink alle drie de toestemmingen aan om door te gaan.", {
        consents: { terms, privacy, mandaat },
        reason: "not_all_checked",
      });
    }

    const VERSION = "v1.0";
    const actor_email = String(dossier.customer_email || "").trim() || null;

    const { data: existing, error: exErr } = await SB
      .from("dossier_consents")
      .select("consent_type, accepted, version")
      .eq("dossier_id", dossierId)
      .eq("version", VERSION)
      .in("consent_type", ["terms", "privacy", "mandaat"]);

    if (exErr) return reject("db_read", 500, `Consents read failed: ${exErr.message}`);

    const byType: Record<string, boolean> = {};
    for (const r of (existing || [])) {
      const t = String((r as any).consent_type || "");
      const a = (r as any).accepted === true;
      if (t) byType[t] = byType[t] || a;
    }

    const alreadyAll =
      byType["terms"] === true &&
      byType["privacy"] === true &&
      byType["mandaat"] === true;

    const ts = nowIso();

    if (alreadyAll) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id: dossierId,
          actor_type: "customer",
          event_type: "consents_saved",
          event_data: {
            consents: { terms: true, privacy: true, mandaat: true },
            version: VERSION,
            accepted_at: ts,
            already_saved: true,
          },
        },
        meta,
        { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
      );

      return finalize(200, {
        ok: true,
        saved: true,
        already_saved: true,
        consents: { terms: true, privacy: true, mandaat: true },
        accepted_at: ts,
      });
    }

    const rows = [
      { dossier_id: dossierId, consent_type: "terms", version: VERSION, accepted: true, accepted_at: ts, actor_email },
      { dossier_id: dossierId, consent_type: "privacy", version: VERSION, accepted: true, accepted_at: ts, actor_email },
      { dossier_id: dossierId, consent_type: "mandaat", version: VERSION, accepted: true, accepted_at: ts, actor_email },
    ];

    const { error: insErr } = await SB.from("dossier_consents").insert(rows);
    if (insErr) return reject("db_write", 500, `Consents insert failed: ${insErr.message}`);

    let invalidated = false;
    if (st === "ready_for_review") {
      try {
        const { error: sErr } = await SB
          .from("dossiers")
          .update({ status: "incomplete", updated_at: ts })
          .eq("id", dossierId)
          .eq("status", "ready_for_review")
          .is("locked_at", null);
        if (!sErr) invalidated = true;
      } catch (_e) {}
    }

    await insertAuditFailOpen(
      SB,
      {
        dossier_id: dossierId,
        actor_type: "customer",
        event_type: "consents_saved",
        event_data: {
          consents: { terms, privacy, mandaat },
          version: VERSION,
          accepted_at: ts,
          invalidated_ready_for_review: invalidated,
          already_saved: false,
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    return finalize(200, {
      ok: true,
      saved: true,
      consents: { terms, privacy, mandaat },
      accepted_at: ts,
      invalidated,
    });
  } catch (e) {
    console.error("api-dossier-consents-save fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});