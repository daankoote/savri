// supabase/functions/api-dossier-dev-unlock/index.ts

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

function nowIso() {
  return new Date().toISOString();
}

type DossierRow = {
  id: string;
  status: string | null;
  locked_at: string | null;
};

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

  const parsed = await req.json().catch(() => ({} as Record<string, unknown>));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const session_token = parsed?.session_token ? String(parsed.session_token) : null;

  let SB: ReturnType<typeof createClient>;
  try {
    SB = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
  } catch (e) {
    console.error("ENV error:", e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  if (!dossier_id || !session_token) {
    return json(req, 400, { ok: false, error: "Missing dossier_id/session_token" });
  }

  const auth = await requireCustomerSession(
    SB,
    dossier_id,
    session_token,
    meta,
    "dossier_dev_unlock_rejected",
  );

  if (!auth.ok) {
    return json(req, auth.status, { ok: false, error: auth.error });
  }

  const idemScopedKey = scopedSessionIdemKey(
    dossier_id,
    auth.session_token_hash,
    idemKey,
  );

  const cached = await tryGetIdempotentResponse(SB, idemScopedKey);
  if (cached) return json(req, cached.status, cached.body);

  async function finalize(status: number, body: Record<string, unknown>) {
    await storeIdempotentResponseFailOpen(SB, idemScopedKey, status, body);
    return json(req, status, body);
  }

  async function reject(
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
        event_type: "dossier_dev_unlock_rejected",
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

    return finalize(status, { ok: false, error: message, ...(extra || {}) });
  }

  if (ENVIRONMENT !== "dev") {
    return reject(
      "environment_gate",
      403,
      "Dev unlock is only available in dev environment.",
      { reason: "environment_not_dev", environment: ENVIRONMENT },
    );
  }

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id,status,locked_at")
    .eq("id", dossier_id)
    .maybeSingle<DossierRow>();

  if (dErr) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_dev_unlock_failed",
        event_data: {
          stage: "dossier_lookup",
          status: 500,
          message: dErr.message,
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    return finalize(500, { ok: false, error: dErr.message });
  }

  if (!dossier) {
    return reject(
      "dossier_lookup",
      404,
      "Dossier not found",
      { reason: "not_found" },
    );
  }

  const currentStatus = String(dossier.status || "");
  const currentlyLocked =
    !!dossier.locked_at ||
    currentStatus === "in_review" ||
    currentStatus === "ready_for_booking";

  if (!currentlyLocked) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_dev_unlock_noop",
        event_data: {
          reason: "already_editable",
          previous_status: currentStatus || null,
          previous_locked_at: dossier.locked_at || null,
        },
      },
      meta,
      { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
    );

    return finalize(200, {
      ok: true,
      dossier_id,
      unlocked: false,
      status: currentStatus || "incomplete",
      locked_at: dossier.locked_at || null,
      message: "Dossier is already editable.",
    });
  }

  const ts = nowIso();

  const { data: updated, error: upErr } = await SB
    .from("dossiers")
    .update({
      status: "incomplete",
      locked_at: null,
      updated_at: ts,
    })
    .eq("id", dossier_id)
    .select("id,status,locked_at")
    .maybeSingle<DossierRow>();

  if (upErr) {
    return reject(
      "dossier_update",
      500,
      `Dossier unlock failed: ${upErr.message}`,
    );
  }

  if (!updated) {
    return reject(
      "dossier_update_verify",
      500,
      "Dossier unlock failed: no updated row returned.",
    );
  }

  if (updated.locked_at !== null || String(updated.status || "") !== "incomplete") {
    return reject(
      "dossier_update_verify",
      500,
      "Dossier unlock verification failed.",
      {
        actual_status: updated.status || null,
        actual_locked_at: updated.locked_at || null,
      },
    );
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "dossier_dev_unlock_applied",
      event_data: {
        previous_status: currentStatus || null,
        previous_locked_at: dossier.locked_at || null,
        new_status: "incomplete",
        new_locked_at: null,
        reason: "dev_only_manual_unlock",
      },
    },
    meta,
    { actor_ref: auth.actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, {
    ok: true,
    dossier_id,
    unlocked: true,
    status: "incomplete",
    locked_at: null,
    previous_status: currentStatus || null,
    previous_locked_at: dossier.locked_at || null,
    message: "Dossier unlocked for dev.",
  });
});