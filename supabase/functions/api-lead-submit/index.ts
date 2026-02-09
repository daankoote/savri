// supabase/functions/api-lead-submit/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
  return /^0[1-9][0-9]{8}$|^\+31[1-9][0-9]{8}$/.test(t);
}
function isKVK(v: string) {
  return /^[0-9]{8}$/.test((v || "").trim());
}
function generateRefCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function randToken(lenBytes = 18) {
  const b = new Uint8Array(lenBytes);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("cf-connecting-ip") || null;
}
function getReqId(req: Request) {
  return req.headers.get("x-request-id") || crypto.randomUUID();
}

async function insertAuditFailOpen(
  SB: ReturnType<typeof createClient>,
  row: {
    dossier_id: string;
    actor_type: "system";
    event_type: string;
    event_data: Record<string, unknown>;
  },
) {
  try {
    const { error } = await SB.from("dossier_audit_events").insert([row]);
    if (error) console.error("audit insert failed (fail-open):", error);
  } catch (e) {
    console.error("audit insert threw (fail-open):", e);
  }
}

type DossierStatus = "incomplete" | "ready_for_review" | "in_review" | "ready_for_booking";

serve(async (req) => {
  // Preflight
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

  const request_id = getReqId(req);
  const ip = parseIp(req);
  const ua = req.headers.get("user-agent");
  const environment = Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || "unknown";

  // Idempotency header verplicht
  const idemKey = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  // Reserveer key
  const { error: reserveErr } = await SB
    .from("idempotency_keys")
    .insert([{ key: idemKey }]);

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

  const ALLOWED_FLOWS = ["installer_signup", "installer_to_customer", "ev_direct", "contact"] as const;
  if (!ALLOWED_FLOWS.includes(flow as any)) {
    return finalize(400, { ok: false, error: "Invalid flow" });
  }

  // ---- INSTALLER SIGNUP ----
  if (flow === "installer_signup") {
    const company_name = String(payload.company_name || "").trim();
    const first = String(payload.contact_first_name || "").trim();
    const last = String(payload.contact_last_name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();
    const kvk = String(payload.kvk || "").trim();

    if (!company_name) return finalize(400, { ok: false, error: "Bedrijfsnaam verplicht" });
    if (!first) return finalize(400, { ok: false, error: "Voornaam verplicht" });
    if (!last) return finalize(400, { ok: false, error: "Achternaam verplicht" });
    if (!email || !isEmail(email)) return finalize(400, { ok: false, error: "Ongeldig e-mailadres" });
    if (!isMobile(phone)) return finalize(400, { ok: false, error: "Ongeldig mobiel nummer" });
    if (!isKVK(kvk)) return finalize(400, { ok: false, error: "KVK moet 8 cijfers zijn" });

    const ref_code = generateRefCode(6);

    const { data: existingInstaller, error: exErr } = await SB
      .from("installers")
      .select("id")
      .or(`email.eq.${email},kvk.eq.${kvk}`)
      .maybeSingle();

    if (exErr) return finalize(500, { ok: false, error: `Installer duplicate check failed: ${exErr.message}` });
    if (existingInstaller) return finalize(409, { ok: false, error: "Deze installateur bestaat al (e-mail of KVK is al geregistreerd)." });

    const { data: invited, error: inviteErr } = await SB.auth.admin.inviteUserByEmail(email);
    if (inviteErr) return finalize(500, { ok: false, error: `Auth invite failed: ${inviteErr.message}` });

    const auth_user_id = invited.user?.id;
    if (!auth_user_id) return finalize(500, { ok: false, error: "Auth user not created" });

    const { data: ins, error: insErr } = await SB
      .from("installers")
      .insert([{
        ref_code,
        company_name,
        contact_first_name: first,
        contact_last_name: last,
        email,
        phone: phone || null,
        kvk,
        active: true,
        auth_user_id,
      }])
      .select("id, ref_code")
      .single();

    if (insErr) return finalize(500, { ok: false, error: `Installers insert failed: ${insErr.message}` });

    const mailBody =
      `Beste ${first} ${last},\n\n` +
      `Bedankt voor je aanmelding bij Enval.\n\n` +
      `Je persoonlijke installateurscode is: ${ins.ref_code}\n\n` +
      `Je ontvangt daarnaast een e-mail om een account te activeren (magic link).\n\n` +
      `Met vriendelijke groet,\nEnval`;

    const { error: mailErr } = await SB.from("outbound_emails").insert([{
      dossier_id: null,
      to_email: email,
      subject: "Je installateurscode voor Enval",
      body: mailBody,
      message_type: "installer_code",
      priority: 1,
      next_attempt_at: new Date().toISOString(),
    }]);

    if (mailErr) return finalize(500, { ok: false, error: `Mail queue failed: ${mailErr.message}` });

    return finalize(200, { ok: true, installer_ref: ins.ref_code });
  }

  // ---- INSTALLER -> CUSTOMER ----
  if (flow === "installer_to_customer") {
    const installer_ref = String(payload.installer_ref || "").trim().toUpperCase();
    const first = String(payload.first_name || "").trim();
    const last = String(payload.last_name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();
    const charger_count = Number(payload.charger_count);
    const own_premises = payload.own_premises === true;

    if (!installer_ref) return finalize(400, { ok: false, error: "Installateurscode verplicht" });
    if (!first) return finalize(400, { ok: false, error: "Voornaam verplicht" });
    if (!last) return finalize(400, { ok: false, error: "Achternaam verplicht" });
    if (!email || !isEmail(email)) return finalize(400, { ok: false, error: "Ongeldig e-mailadres" });
    if (!isMobile(phone)) return finalize(400, { ok: false, error: "Ongeldig mobiel nummer" });
    if (!Number.isInteger(charger_count) || charger_count < 1 || charger_count > 10) {
      return finalize(400, { ok: false, error: "Ongeldig aantal laadpunten" });
    }

    const { data: installer, error: iErr } = await SB
      .from("installers")
      .select("id, active")
      .eq("ref_code", installer_ref)
      .maybeSingle();

    if (iErr) return finalize(500, { ok: false, error: `Installer lookup failed: ${iErr.message}` });
    if (!installer || installer.active !== true) return finalize(400, { ok: false, error: "Installateurscode niet correct / niet actief" });

    const full_name = `${first} ${last}`.trim();

    const { data: lead, error: lErr } = await SB
      .from("leads")
      .insert([{
        source: "via_installateur",
        lead_type: "ev_user",
        first_name: first,
        last_name: last,
        full_name,
        email,
        phone: phone || null,
        charger_count,
        own_premises,
        installer_ref,
        consent_terms: true,
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
        source: "via_installateur",
        lead_type: "ev_user",
        installer_ref,
        installer_id: installer.id,
        customer_first_name: first,
        customer_last_name: last,
        customer_email: email,
        customer_phone: phone || null,
        charger_count,
        own_premises,
        status: initialStatus,
        access_token_hash: tokenHash,
      }])
      .select("id")
      .single();

    if (dErr) return finalize(500, { ok: false, error: `Dossier insert failed: ${dErr.message}` });

    await SB.from("dossier_audit_events").insert([{
      dossier_id: dossier.id,
      actor_type: "system",
      event_type: "dossier_created",
      event_data: { lead_id: lead.id, source: "via_installateur", installer_ref },
    }]);

    const dossierUrl = `https://www.enval.nl/dossier.html?d=${dossier.id}&t=${token}`;
    const mailBody =
      `Beste ${first},\n\n` +
      `Je aanmelding via Enval is ontvangen via je installateur.\n\n` +
      `Maak je dossier compleet via deze link:\n${dossierUrl}\n\n` +
      `Met vriendelijke groet,\nEnval`;

    const { data: queued, error: qErr } = await SB.from("outbound_emails").insert([{
      dossier_id: dossier.id,
      to_email: email,
      subject: "Je Enval dossier link",
      body: mailBody,
      message_type: "dossier_link",
      priority: 3,
      next_attempt_at: new Date().toISOString(),
    }]).select("id").single();

    if (qErr) return finalize(500, { ok: false, error: `Mail queue failed: ${qErr.message}` });

    // mail_queued audit (dossier-scoped, fail-open)
    await insertAuditFailOpen(SB, {
      dossier_id: dossier.id,
      actor_type: "system",
      event_type: "mail_queued",
      event_data: {
        request_id,
        idempotency_key: idemKey,
        actor_ref: "system:api-lead-submit",
        ip,
        ua,
        environment,
        outbound_email_id: queued?.id ?? null,
        message_type: "dossier_link",
        to_email: email,
        status: "queued",
      },
    });

    return finalize(200, { ok: true, lead_id: lead.id, dossier_id: dossier.id });
  }

  // ---- EV DIRECT ----
  if (flow === "ev_direct") {
    const first = String(payload.first_name || "").trim();
    const last = String(payload.last_name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();
    const charger_count = Number(payload.charger_count);
    const own_premises = payload.own_premises === true;

    if (!first) return finalize(400, { ok: false, error: "Voornaam verplicht" });
    if (!last) return finalize(400, { ok: false, error: "Achternaam verplicht" });
    if (!email || !isEmail(email)) return finalize(400, { ok: false, error: "Ongeldig e-mailadres" });
    if (!isMobile(phone)) return finalize(400, { ok: false, error: "Ongeldig mobiel nummer" });
    if (!Number.isInteger(charger_count) || charger_count < 1 || charger_count > 10) {
      return finalize(400, { ok: false, error: "Ongeldig aantal laadpunten" });
    }

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
        own_premises,
        status: initialStatus,
        access_token_hash: tokenHash,
      }])
      .select("id")
      .single();

    if (dErr) return finalize(500, { ok: false, error: `Dossier insert failed: ${dErr.message}` });

    await SB.from("dossier_audit_events").insert([{
      dossier_id: dossier.id,
      actor_type: "system",
      event_type: "dossier_created",
      event_data: { lead_id: lead.id, source: "ev_direct" },
    }]);

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

    await insertAuditFailOpen(SB, {
      dossier_id: dossier.id,
      actor_type: "system",
      event_type: "mail_queued",
      event_data: {
        request_id,
        idempotency_key: idemKey,
        actor_ref: "system:api-lead-submit",
        ip,
        ua,
        environment,
        outbound_email_id: queued?.id ?? null,
        message_type: "dossier_link",
        to_email: email,
        status: "queued",
      },
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

    return finalize(200, { ok: true, queued: true });
  }

  return finalize(400, { ok: false, error: "Unhandled flow" });
});
