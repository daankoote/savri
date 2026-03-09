// supabase/functions/api-dossier-login-request/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import {
  insertAuditFailOpen,
  tryGetIdempotentResponse,
  storeIdempotentResponseFailOpen,
} from "../_shared/audit.ts";
import { randToken, sha256Hex } from "../_shared/sessions.ts";

// -------------------- CORS --------------------
function parseAllowedOrigins(): string[] {
  const raw =
    Deno.env.get("ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_ORIGIN") ??
    "https://www.enval.nl,https://enval.nl";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

function isAllowedNetlifyPreview(origin: string) {
  return /^https:\/\/deploy-preview-\d+--enval1\.netlify\.app$/.test(origin);
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow =
    (origin && (ALLOWED_ORIGINS.includes(origin) || isAllowedNetlifyPreview(origin)))
      ? origin
      : (ALLOWED_ORIGINS[0] || "https://www.enval.nl");

  return {
    "Access-Control-Allow-Origin": allow,
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

function ok(req: Request) {
  return json(req, 200, { ok: true });
}

// -------------------- ENV + Client --------------------
function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
function getEnvOptional(name: string) {
  const v = Deno.env.get(name);
  return v && String(v).trim() ? String(v).trim() : null;
}

function sb() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
}

function isoNow() {
  return new Date().toISOString();
}

function actorRefForEmail(dossierId: string, email: string) {
  // Geen raw email in actor_ref (privacy). Kleine mask is genoeg.
  const e = email.trim().toLowerCase();
  return `dossier:${dossierId}|email:${e.slice(0, 2)}***`;
}

// -------------------- Mail worker trigger (fail-open) --------------------
async function triggerMailWorkerFailOpen(opts: {
  SB: ReturnType<typeof createClient>;
  request_id: string;
}): Promise<void> {
  try {
    const MAIL_WORKER_SECRET = getEnvOptional("MAIL_WORKER_SECRET");
    if (!MAIL_WORKER_SECRET) return;

    await opts.SB.functions.invoke("mail-worker", {
      headers: {
        "x-mail-worker-secret": MAIL_WORKER_SECRET,
        "x-request-id": `realtime-mail-worker-${opts.request_id}`,
      },
      body: {},
    });
  } catch {
    // fail-open
  }
}

// -------------------- Throttle helper (FAIL-CLOSED) --------------------
async function isThrottledFailClosed(opts: {
  SB: ReturnType<typeof createClient>;
  dossier_id: string;
  windowSeconds: number;
}): Promise<{ throttled: boolean; reason: string }> {
  const cutoff = new Date(Date.now() - opts.windowSeconds * 1000).toISOString();

  const { data, error } = await opts.SB
    .from("outbound_emails")
    .select("id,created_at,status")
    .eq("dossier_id", opts.dossier_id)
    .eq("message_type", "dossier_link")
    .gte("created_at", cutoff)
    .in("status", ["queued", "processing", "sent"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    // FAIL-CLOSED: bij throttle-check error → treat as throttled
    return { throttled: true, reason: `throttle_check_failed:${error.message}` };
  }

  const hit = Array.isArray(data) && data.length > 0;
  return { throttled: hit, reason: hit ? "recent_mail_exists" : "ok" };
}

// -------------------- Handler --------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "Method not allowed" });

  const meta = getReqMeta(req);
  const idemKey = meta.idempotency_key || meta.request_id;

  // Init Supabase once
  let SB: ReturnType<typeof createClient>;
  try {
    SB = sb();
  } catch {
    return json(req, 500, { ok: false, error: "Server misconfigured" });
  }

  // Idempotency (fail-open): als response al bestaat → teruggeven
  try {
    const cached = await tryGetIdempotentResponse(SB, idemKey);
    if (cached) return json(req, cached.status, cached.body);
  } catch {
    // ignore
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    const body = { ok: false, error: "Invalid JSON" };
    await storeIdempotentResponseFailOpen(SB, idemKey, 400, body);
    return json(req, 400, body);
  }

  const dossier_id = payload?.dossier_id ? String(payload.dossier_id) : null;
  const email = payload?.email ? String(payload.email).trim().toLowerCase() : null;

  // No enumeration: altijd ok:true
  if (!dossier_id || !email || !isEmail(email)) {
    const body = { ok: true };
    await storeIdempotentResponseFailOpen(SB, idemKey, 200, body);
    return ok(req);
  }

  // Fetch dossier minimal
  const { data: d, error: dErr } = await SB
    .from("dossiers")
    .select("id,customer_email,locked_at")
    .eq("id", dossier_id)
    .maybeSingle();

  if (dErr || !d) {
    // Geen dossier = geen dossier-scoped audit (FK kan falen). No enumeration → ok.
    const body = { ok: true };
    await storeIdempotentResponseFailOpen(SB, idemKey, 200, body);
    return ok(req);
  }

  const actor_ref = actorRefForEmail(dossier_id, email);

  // Audit: request received
  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "login_request_received",
      event_data: { stage: "auth", status: 200, message: "login request received" },
    },
    meta,
    { actor_ref },
  );

  // Email match?
  const dossierEmail = String(d.customer_email || "").trim().toLowerCase();
  if (!dossierEmail || dossierEmail !== email) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "login_request_rejected",
        event_data: { stage: "auth", status: 200, reason: "email_mismatch", message: "no mail issued" },
      },
      meta,
      { actor_ref },
    );

    const body = { ok: true };
    await storeIdempotentResponseFailOpen(SB, idemKey, 200, body);
    return ok(req);
  }

  // Throttle (60s window) — FAIL-CLOSED
  const thr = await isThrottledFailClosed({ SB, dossier_id, windowSeconds: 60 });
  if (thr.throttled) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "system",
        event_type: "login_request_throttled",
        event_data: { stage: "auth", status: 429, reason: thr.reason, message: "throttled" },
      },
      meta,
      { actor_ref },
    );

    const body = { ok: true };
    await storeIdempotentResponseFailOpen(SB, idemKey, 200, body);
    return ok(req);
  }

  // Rotate link-token
  const tokenRaw = randToken(18);
  const tokenHash = await sha256Hex(tokenRaw);
  const now = isoNow();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: upd, error: uErr } = await SB
    .from("dossiers")
    .update({
      access_token_hash: tokenHash,
      access_token_created_at: now,
      access_token_expires_at: expiresAt,
      access_token_consumed_at: null,
      access_token_consumed_ip: null,
      access_token_consumed_ua: null,
      access_token_consumed_request_id: null,
      updated_at: now,
    })
    .eq("id", dossier_id)
    .select("id")
    .maybeSingle();

  if (uErr || !upd) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "system",
        event_type: "login_link_issue_failed",
        event_data: {
          stage: "auth",
          status: 500,
          reason: "token_rotate_failed",
          message: uErr?.message || "failed",
        },
      },
      meta,
      { actor_ref },
    );

    const body = { ok: true };
    await storeIdempotentResponseFailOpen(SB, idemKey, 200, body);
    return ok(req);
  }

  // Enqueue mail
  const dossierUrl = `https://www.enval.nl/dossier.html?d=${dossier_id}&t=${tokenRaw}`;
  const mailBody =
    `Beste,\n\n` +
    `Hier is je nieuwe Enval dossier-link:\n${dossierUrl}\n\n` +
    `Met vriendelijke groet,\nEnval`;

  const { data: queued, error: qErr } = await SB
    .from("outbound_emails")
    .insert([{
      dossier_id,
      to_email: email,
      subject: "Je Enval dossier link",
      body: mailBody,
      message_type: "dossier_link",
      priority: 3,
      next_attempt_at: now,
    }])
    .select("id")
    .single();

  if (qErr) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "system",
        event_type: "login_link_issue_failed",
        event_data: { stage: "mail", status: 500, reason: "mail_queue_failed", message: qErr.message },
      },
      meta,
      { actor_ref, expires_at: expiresAt },
    );

    const body = { ok: true };
    await storeIdempotentResponseFailOpen(SB, idemKey, 200, body);
    return ok(req);
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "system",
      event_type: "login_link_issued",
      event_data: {
        stage: "mail",
        status: 200,
        message: "mail queued",
        outbound_email_id: queued?.id ?? null,
        expires_at: expiresAt,
      },
    },
    meta,
    { actor_ref },
  );

  // Fast-path trigger (fail-open)
  await triggerMailWorkerFailOpen({ SB, request_id: meta.request_id });

  const body = { ok: true };
  await storeIdempotentResponseFailOpen(SB, idemKey, 200, body);
  return ok(req);
});