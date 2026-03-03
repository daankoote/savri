// supabase/functions/api-lead-submit/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";

// =====================
// CORS (strict allowlist)
// =====================
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
      "authorization, x-client-info, apikey, content-type, idempotency-key",
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

// =====================
// ENV + Supabase client
// =====================
function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
function getEnvOptional(name: string) {
  const v = Deno.env.get(name);
  return v && String(v).trim() ? String(v).trim() : null;
}

let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (_sb) return _sb;
  _sb = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  return _sb;
}

// -------------------- validators --------------------
function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
}
function isMobile(v?: string) {
  if (!v) return true;
  const t = v.trim();
  return /^06\d{8}$|^\+316\d{8}$/.test(t.replace(/[\s\-().]/g, ""));
}
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randToken(lenBytes = 18) {
  const b = new Uint8Array(lenBytes);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function parseIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("cf-connecting-ip") || null;
}
function getReqId(req: Request) {
  return req.headers.get("x-request-id") || crypto.randomUUID();
}

// =====================
// Off-chain intake audit (fail-open)
// =====================
async function insertIntakeAuditFailOpen(
  SB: ReturnType<typeof createClient>,
  row: {
    request_id: string;
    idempotency_key: string;
    environment: string;
    ip: string | null;
    ua: string | null;
    origin: string | null;

    flow: string;
    stage: string;
    status: number;
    reason: string;
    message: string;
    payload: Record<string, unknown>;
  },
) {
  try {
    const { error } = await SB.from("intake_audit_events").insert([row]);
    if (error) console.error("intake audit insert failed (fail-open):", error);
  } catch (e) {
    console.error("intake audit insert threw (fail-open):", e);
  }
}

// =====================
// Fast-path: trigger mail-worker (fail-open)
// =====================
type TriggerResult =
  | { ok: true; status: number }
  | { ok: false; status: number | null; error: string };

async function triggerMailWorkerFailOpen(opts: {
  SB: ReturnType<typeof createClient>;
  request_id: string;
  dossier_id: string | null;
  idempotency_key: string | null;
  ip: string | null;
  ua: string | null;
  environment: string;
}): Promise<TriggerResult> {
  const { SB, request_id, dossier_id, idempotency_key, ip, ua, environment } = opts;

  // NB: geen dossier_audit_events hier bij dossier_id null; dit is ok
  try {
    const MAIL_WORKER_SECRET = getEnvOptional("MAIL_WORKER_SECRET");
    if (!MAIL_WORKER_SECRET) {
      return { ok: false, status: null, error: `missing_env has_secret=${!!MAIL_WORKER_SECRET}` };
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);

    const rid = `realtime-mail-worker-${request_id}`;

    try {
      const { error: invErr } = await SB.functions.invoke("mail-worker", {
        headers: {
          "x-mail-worker-secret": MAIL_WORKER_SECRET,
          "x-request-id": rid,
        },
        body: {},
      });

      clearTimeout(t);

      if (invErr) {
        return { ok: false, status: null, error: `invoke_failed ${invErr.message ?? String(invErr)}` };
      }
      return { ok: true, status: 200 };
    } catch (e: any) {
      clearTimeout(t);
      return { ok: false, status: null, error: `invoke_exception ${e?.message ?? String(e)}` };
    }
  } catch (e: any) {
    return { ok: false, status: null, error: `exception ${e?.message ?? String(e)}` };
  }
}

// =====================
// Self-serve scope caps
// =====================
const MAX_SELF_SERVE_CHARGERS = 4;
function validateSelfServeChargerCount(n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return "Ongeldig aantal laadpunten";
  if (n > MAX_SELF_SERVE_CHARGERS) return `Maximaal ${MAX_SELF_SERVE_CHARGERS} laadpunten per locatie.`;
  return null;
}

type DossierStatus = "incomplete" | "ready_for_review" | "in_review" | "ready_for_booking";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") return bad(req, "Method not allowed", 405);

  // Init Supabase
  let SB: ReturnType<typeof createClient>;
  try {
    SB = sb();
  } catch (e) {
    console.error("ENV/Client init error:", e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  const meta = getReqMeta(req);
  const request_id = meta.request_id;
  const ip = meta.ip ?? null;
  const ua = meta.ua ?? null;
  const origin = meta.origin ?? null;
  const environment = meta.environment ?? "unknown";

  // Idempotency header verplicht
  const idemKey = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  // Reserveer key
  const { error: reserveErr } = await SB.from("idempotency_keys").insert([{ key: idemKey }]);

  // Duplicate replay
  if (reserveErr) {
    const { data: row, error: rowErr } = await SB
      .from("idempotency_keys")
      .select("response_status,response_body")
      .eq("key", idemKey)
      .maybeSingle();

    if (rowErr) return bad(req, `Idempotency lookup failed: ${rowErr.message}`, 500);

    if (row?.response_body && row.response_status) {
      return json(req, row.response_status, row.response_body);
    }
    return bad(req, "Request already in progress", 409);
  }

  async function finalize(status: number, body: any) {
    const { error: upErr } = await SB
      .from("idempotency_keys")
      .update({ response_status: status, response_body: body })
      .eq("key", idemKey);

    if (upErr) console.error("Idempotency finalize failed:", upErr);
    return json(req, status, body);
  }

  // Body lezen
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return finalize(400, { ok: false, error: "Invalid JSON" });
  }

  const flow = String(payload?.flow || "").trim();
  if (!flow) return finalize(400, { ok: false, error: "Missing flow" });

  // allow flow strings for legacy callers, but hard-kill installer routes
  const ALLOWED_FLOWS = ["installer_signup", "installer_to_customer", "ev_direct", "contact"] as const;
  if (!ALLOWED_FLOWS.includes(flow as any)) {
    return finalize(400, { ok: false, error: "Invalid flow" });
  }

  if (flow === "installer_signup" || flow === "installer_to_customer") {
    return finalize(410, {
      ok: false,
      error: "Legacy; neem contact op.",
      legacy: true,
      flow,
    });
  }

  // ---- EV DIRECT ----
  if (flow === "ev_direct") {
    const first = String(payload.first_name || "").trim();
    const last = String(payload.last_name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();
    const charger_count = Number(payload.charger_count);
    const own_premises = payload.own_premises === true;

    // Hard gates (self-serve): NL + MID must be true
    const in_nl = payload.in_nl === true;
    const has_mid = payload.has_mid === true;

    // Optional: user may already know it; NOT a gate at intake in Model A
    const mid_number = String(payload.mid_number || "").trim();



    // syntactische validatie eerst
    if (!first) return finalize(400, { ok: false, error: "Voornaam verplicht" });
    if (!last) return finalize(400, { ok: false, error: "Achternaam verplicht" });
    if (!email || !isEmail(email)) return finalize(400, { ok: false, error: "Ongeldig e-mailadres" });
    if (!isMobile(phone)) return finalize(400, { ok: false, error: "Ongeldig mobiel nummer" });

    {
      const err = validateSelfServeChargerCount(charger_count);
      if (err) return finalize(400, { ok: false, error: err });
    }

    // ============================
    // A) HARD REJECT PRE-DOSSIER
    // ============================
    if (!in_nl) {
      const msg = "Aanmelding laadpalen is alleen beschikbaar voor laadpalen in Nederland.";
      await insertIntakeAuditFailOpen(SB, {
        request_id,
        idempotency_key: idemKey,
        environment,
        ip,
        ua,
        origin,
        flow: "ev_direct",
        stage: "eligibility",
        status: 400,
        reason: "in_nl_false",
        message: msg,
        payload: {
          email,
          charger_count,
          own_premises,
          in_nl,
          has_mid,
        },
      });
      return finalize(400, { ok: false, error: msg });
    }

    if (!has_mid) {
      const msg = "Aanmelding laadpalen is alleen beschikbaar voor laadpalen met een MID-meter.";
      await insertIntakeAuditFailOpen(SB, {
        request_id,
        idempotency_key: idemKey,
        environment,
        ip,
        ua,
        origin,
        flow: "ev_direct",
        stage: "eligibility",
        status: 400,
        reason: "has_mid_false",
        message: msg,
        payload: {
          email,
          charger_count,
          own_premises,
          in_nl,
          has_mid,
        },
      });
      return finalize(400, { ok: false, error: msg });
    }



    // ============
    // ELIGIBLE OK
    // ============

    const full_name = `${first} ${last}`.trim();

    const { data: lead, error: lErr } = await SB
      .from("leads")
      .insert([{
        source: "ev_direct",
        lead_type: "ev_user",
        full_name,
        first_name: first,
        last_name: last,
        email,
        phone: phone || null,
        charger_count,
        own_premises,
        consent_terms: true,
        in_nl,
        has_mid,
      }])
      .select("id")
      .single();

    if (lErr) return finalize(500, { ok: false, error: `Lead insert failed: ${lErr.message}` });

    const token = randToken(18);
    const tokenHash = await sha256Hex(token);
    const initialStatus: DossierStatus = "incomplete";

    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .insert([{
        lead_id: lead.id,
        source: "ev_direct",
        lead_type: "ev_user",
        customer_first_name: first,
        customer_last_name: last,
        customer_email: email,
        customer_phone: phone || null,
        charger_count,
        in_nl,
        own_premises,
        status: initialStatus,
        access_token_hash: tokenHash,
        access_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }])
    .select("id")
    .single();

    if (dErr) return finalize(500, { ok: false, error: `Dossier insert failed: ${dErr.message}` });

    // AUDIT (dossier-scoped) — eligible OK → dossier created
    await insertAuditFailOpen(
    SB,
    {
      dossier_id: dossier.id,
      event_type: "dossier_created",
      actor_type: "system",
      event_data: {
        flow: "ev_direct",
        lead_id: lead.id,
        charger_count,
        in_nl,
        has_mid,
      },
    },
    meta,
  );

    // mail enqueue (alleen bij eligible OK)
    const dossierUrl = `https://www.enval.nl/dossier.html?d=${dossier.id}&t=${token}`;
    const mailBody =
      `Beste ${first},\n\n` +
      `Bedankt voor je aanmelding bij Enval.\n\n` +
      `Maak je dossier compleet via deze link:\n${dossierUrl}\n\n` +
      `Met vriendelijke groet,\nEnval`;

    const { data: queued, error: mailErr } = await SB.from("outbound_emails").insert([{
      dossier_id: dossier.id,
      to_email: email,
      subject: "Je Enval dossier link",
      body: mailBody,
      message_type: "dossier_link",
      priority: 3,
      next_attempt_at: new Date().toISOString(),
    }]).select("id").single();

    if (mailErr) return finalize(500, { ok: false, error: `Mail queue failed: ${mailErr.message}` });

    await triggerMailWorkerFailOpen({
      request_id,
      dossier_id: dossier.id,
      idempotency_key: idemKey,
      ip,
      ua,
      environment,
      SB,
    });

    return finalize(200, { ok: true, lead_id: lead.id, dossier_id: dossier.id });
  }

  // ---- CONTACT ----
  if (flow === "contact") {
    const first = String(payload.first_name || "").trim();
    const last = String(payload.last_name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const subject = String(payload.subject || "").trim();
    const message = String(payload.message || "").trim();

    if (!first) return finalize(400, { ok: false, error: "Voornaam verplicht" });
    if (!email || !isEmail(email)) return finalize(400, { ok: false, error: "Ongeldig e-mailadres" });
    if (!subject) return finalize(400, { ok: false, error: "Onderwerp verplicht" });
    if (!message) return finalize(400, { ok: false, error: "Bericht verplicht" });

    const name = `${first} ${last || ""}`.trim();

    const { error: cmErr } = await SB.from("contact_messages").insert([{
      name,
      email,
      subject,
      message,
      first_name: first,
      last_name: last || null,
    }]);

    if (cmErr) return finalize(500, { ok: false, error: `Contact insert failed: ${cmErr.message}` });

    const mailBody =
      `Nieuwe contactaanvraag via enval.nl\n\n` +
      `Naam: ${name}\n` +
      `E-mail: ${email}\n` +
      `Onderwerp: ${subject}\n\n` +
      `Bericht:\n${message}\n`;

    const { error: qErr } = await SB.from("outbound_emails").insert([{
      dossier_id: null,
      to_email: "dk@enval.nl",
      subject: `Contactformulier: ${subject} via enval.nl`,
      body: mailBody,
      message_type: "contact",
      priority: 10,
      reply_to: email,
      from_email: "contact@enval.nl",
      from_name: "Enval Contact",
      next_attempt_at: new Date().toISOString(),
    }]);

    if (qErr) return finalize(500, { ok: false, error: `Mail queue failed: ${qErr.message}` });

    await triggerMailWorkerFailOpen({
      SB,
      request_id,
      dossier_id: null,
      idempotency_key: idemKey,
      ip,
      ua,
      environment,
    });

    return finalize(200, { ok: true, queued: true });
  }

  return finalize(400, { ok: false, error: "Unhandled flow" });
});
