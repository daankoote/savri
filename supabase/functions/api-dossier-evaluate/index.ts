// supabase/functions/api-dossier-dossier-evaluate/index.ts

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
function bad(req: Request, msg: string, code = 400, extra: Record<string, unknown> = {}) {
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

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function nowIso() {
  return new Date().toISOString();
}

type CheckStatus = "pass" | "fail";
type DossierStatus = "incomplete" | "ready_for_review" | "in_review" | "ready_for_booking";

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type ConsentRow = {
  consent_type: string;
  accepted: boolean;
  accepted_at?: string | null;
  created_at?: string | null;
};

function actorRefForCustomer(dossierId: string, tokenHash: string) {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

serve(async (req) => {
  const meta = getReqMeta(req);
  const ENVIRONMENT = getEnvironment();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return bad(req, "Method not allowed", 405);

  // Idempotency REQUIRED (this endpoint writes: dossier_checks + dossiers.status/lock + audit)
  // IMPORTANT: request_id is NOT an idempotency key.
  const idemKey = String(meta.idempotency_key || "").trim();
  if (!idemKey) return bad(req, "Missing Idempotency-Key", 400);

  const parsed = await req.json().catch(() => ({} as any));
  const dossier_id = parsed?.dossier_id ? String(parsed.dossier_id) : null;
  const token = parsed?.token ? String(parsed.token) : null;
  const doFinalize = parsed?.finalize === true;

  let SB: ReturnType<typeof createClient>;
  try {
    SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  } catch (e) {
    console.error("ENV error:", e);
    return bad(req, "Server misconfigured (missing secrets)", 500);
  }

  // Replay zodra we dossier scope hebben
  if (dossier_id) {
    const cached = await tryGetIdempotentResponse(SB, idemKey);
    if (cached) return json(req, cached.status, cached.body);
  }

  async function finalize(status: number, body: any) {
    await storeIdempotentResponseFailOpen(SB, idemKey, status, body);
    return json(req, status, body);
  }

  if (!dossier_id || !token) {
    return finalize(400, { ok: false, error: "Missing dossier_id/token" });
  }

  const tokenHash = await sha256Hex(String(token));
  const actor_ref = actorRefForCustomer(dossier_id, tokenHash);

  async function auditReject(stage: string, status: number, message: string, extra?: Record<string, unknown>) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_evaluate_rejected",
        event_data: { stage, status, message, ...(extra || {}) },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );
  }

  async function reject(stage: string, status: number, message: string, extra?: Record<string, unknown>) {
    await auditReject(stage, status, message, extra);
    return finalize(status, { ok: false, error: message, ...(extra || {}) });
  }

  const { data: dossier, error: dErr } = await SB
    .from("dossiers")
    .select("id,status,locked_at,email_verified_at,address_verified_at,charger_count")
    .eq("id", dossier_id)
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (dErr) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_evaluate_failed",
        event_data: { stage: "dossier_lookup", status: 500, message: dErr.message },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );
    return finalize(500, { ok: false, error: dErr.message });
  }

  if (!dossier) {
    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_evaluate_rejected",
        event_data: { stage: "auth", status: 401, message: "Unauthorized", reason: "unauthorized" },
      },
      meta,
      { actor_ref: `dossier:${dossier_id}|token:invalid`, environment: ENVIRONMENT },
    );
    return finalize(401, { ok: false, error: "Unauthorized" });
  }

  // Already locked -> stable OK response
  if (dossier.locked_at) {
    return finalize(200, {
      ok: true,
      dossier_id,
      status: String(dossier.status || "in_review"),
      locked_at: dossier.locked_at,
      message: "Dossier is already locked for review.",
      doFinalize,
    });
  }

  const st = String(dossier.status || "");
  if (st === "in_review" || st === "ready_for_booking") {
    return finalize(200, {
      ok: true,
      dossier_id,
      status: st,
      locked_at: dossier.locked_at || null,
      message: "Dossier is already in review/booking state.",
      doFinalize,
    });
  }

  const [
    { data: consentsRaw, error: cErr },
    { data: chargers, error: chErr },
    { data: documents, error: docErr },
  ] = await Promise.all([
    SB.from("dossier_consents")
      .select("consent_type, accepted, accepted_at, created_at")
      .eq("dossier_id", dossier_id)
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false }),
    SB.from("dossier_chargers").select("id, serial_number, brand, model").eq("dossier_id", dossier_id),
    SB.from("dossier_documents").select("doc_type, charger_id, status").eq("dossier_id", dossier_id),
  ]);

  if (cErr) return reject("consents_read", 500, `Consents read failed: ${cErr.message}`);
  if (chErr) return reject("chargers_read", 500, `Chargers read failed: ${chErr.message}`);
  if (docErr) return reject("documents_read", 500, `Documents read failed: ${docErr.message}`);

  // Latest-consent reducer (deterministisch): eerste per type is de nieuwste door ordering hierboven
  const consentMap: Record<string, boolean> = {};
  const seenType = new Set<string>();
  for (const row of (consentsRaw || []) as ConsentRow[]) {
    const t = String(row.consent_type || "").trim();
    if (!t) continue;
    if (seenType.has(t)) continue;
    seenType.add(t);
    consentMap[t] = row.accepted === true;
  }

  const hasTerms = consentMap["terms"] === true;
  const hasPrivacy = consentMap["privacy"] === true;
  const hasMandaat = consentMap["mandaat"] === true;

  const emailOk = !!dossier.email_verified_at;
  const addressOk = !!dossier.address_verified_at;

  const requiredChargers = Math.max(0, asNum(dossier.charger_count || 0));
  const chargerRows: Array<any> = chargers || [];
  const chargerCount = chargerRows.length;

  const chargerExactOk = requiredChargers > 0
    ? (chargerCount === requiredChargers)
    : (chargerCount > 0);

  // docs_per_charger telt alleen confirmed
  const confirmedDocs = (documents || []).filter((d: any) => String(d.status || "") === "confirmed");
  const byCharger: Record<string, { factuur: number; foto_laadpunt: number }> = {};

  for (const d of confirmedDocs) {
    const dt = String((d as any).doc_type || "").toLowerCase();
    const chId = String((d as any).charger_id || "").trim();
    if (!chId) continue;
    if (!byCharger[chId]) byCharger[chId] = { factuur: 0, foto_laadpunt: 0 };
    if (dt === "factuur") byCharger[chId].factuur += 1;
    if (dt === "foto_laadpunt") byCharger[chId].foto_laadpunt += 1;
  }

  const missingDocsPerCharger: Array<{ charger_id: string; serial_number?: string | null; missing: string[] }> = [];
  for (const ch of chargerRows) {
    const chId = String(ch.id);
    const cnt = byCharger[chId] || { factuur: 0, foto_laadpunt: 0 };
    const missing: string[] = [];
    if (cnt.factuur < 1) missing.push("factuur");
    if (cnt.foto_laadpunt < 1) missing.push("foto_laadpunt");
    if (missing.length) {
      missingDocsPerCharger.push({
        charger_id: chId,
        serial_number: ch.serial_number || null,
        missing,
      });
    }
  }

  const docsPerChargerOk = chargerRows.length > 0 && missingDocsPerCharger.length === 0;

  const checks: Array<{ check_code: string; status: CheckStatus; details: any }> = [
    { check_code: "email_verified", status: emailOk ? "pass" : "fail", details: {} },
    { check_code: "address_verified", status: addressOk ? "pass" : "fail", details: {} },
    {
      check_code: "charger_exact_count",
      status: chargerExactOk ? "pass" : "fail",
      details: { required: requiredChargers, current: chargerCount },
    },
    {
      check_code: "docs_per_charger",
      status: docsPerChargerOk ? "pass" : "fail",
      details: { rule: "only_confirmed_docs_count", missing_per_charger: missingDocsPerCharger },
    },
    {
      check_code: "consents_required",
      status: (hasTerms && hasPrivacy && hasMandaat) ? "pass" : "fail",
      details: { terms: hasTerms, privacy: hasPrivacy, mandaat: hasMandaat },
    },
  ];

  const allRequiredPass = checks.every((c) => c.status === "pass");

  const missingSteps: string[] = [];
  if (!emailOk) missingSteps.push("1) E-mail geverifieerd");
  if (!addressOk) missingSteps.push("2) Adres");
  if (!chargerExactOk) missingSteps.push("3) Laadpalen (exact aantal)");
  if (!docsPerChargerOk) missingSteps.push("4) Documenten (factuur + foto per laadpunt) — upload moet bevestigd zijn");
  if (!(hasTerms && hasPrivacy && hasMandaat)) missingSteps.push("5) Toestemmingen");

  const ts = nowIso();

  const upsertRows = checks.map((c) => ({
    dossier_id,
    check_code: c.check_code,
    status: c.status,
    details: c.details,
    updated_at: ts,
  }));

  const { error: upChkErr } = await SB
    .from("dossier_checks")
    .upsert(upsertRows, { onConflict: "dossier_id,check_code" });

  if (upChkErr) return reject("checks_upsert", 500, `Checks upsert failed: ${upChkErr.message}`);

  if (!allRequiredPass) {
    const newStatus: DossierStatus = "incomplete";

    // status only (no lock)
    await SB
      .from("dossiers")
      .update({ status: newStatus, updated_at: ts })
      .eq("id", dossier_id)
      .is("locked_at", null)
      .neq("status", "in_review")
      .neq("status", "ready_for_booking");

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_review_rejected_incomplete",
        event_data: { missingSteps, checks },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );

    return finalize(400, {
      ok: false,
      error: "Er ontbreken nog onderdelen. Vul de stappen hierboven in.",
      dossier_id,
      status: newStatus,
      missingSteps,
      checks,
      doFinalize,
    });
  }

  // All pass: either mark ready_for_review or lock for review
  if (!doFinalize) {
    const newStatus: DossierStatus = "ready_for_review";

    await SB
      .from("dossiers")
      .update({ status: newStatus, updated_at: ts })
      .eq("id", dossier_id)
      .is("locked_at", null)
      .neq("status", "in_review")
      .neq("status", "ready_for_booking");

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "dossier_ready_for_review",
        event_data: { new_status: newStatus, checks },
      },
      meta,
      { actor_ref, environment: ENVIRONMENT },
    );

    return finalize(200, {
      ok: true,
      dossier_id,
      status: newStatus,
      locked_at: null,
      all_required_pass: true,
      checks,
      missingSteps: [],
      doFinalize,
    });
  }

  // Finalize: lock
  const newStatus: DossierStatus = "in_review";

  const { data: lockedRow, error: upErr } = await SB
    .from("dossiers")
    .update({ status: newStatus, locked_at: ts, updated_at: ts })
    .eq("id", dossier_id)
    .is("locked_at", null)
    .neq("status", "in_review")
    .neq("status", "ready_for_booking")
    .select("id,status,locked_at")
    .maybeSingle();

  if (upErr) return reject("dossier_lock", 500, `Dossier update failed: ${upErr.message}`);

  let finalLockedAt = lockedRow?.locked_at || null;
  let finalStatus = String(lockedRow?.status || "");

  if (!finalLockedAt || finalStatus !== "in_review") {
    const { data: fresh, error: fErr } = await SB
      .from("dossiers")
      .select("id,status,locked_at")
      .eq("id", dossier_id)
      .maybeSingle();

    if (fErr) return reject("dossier_reread", 500, `Dossier re-read failed: ${fErr.message}`);

    if (fresh?.locked_at) {
      finalLockedAt = fresh.locked_at;
      finalStatus = String(fresh.status || "in_review");
    } else {
      return reject("dossier_lock_verify", 500, "Indienen lijkt gelukt, maar dossier is niet vergrendeld. Probeer opnieuw.");
    }
  }

  await insertAuditFailOpen(
    SB,
    {
      dossier_id,
      actor_type: "customer",
      event_type: "dossier_locked_for_review",
      event_data: { new_status: "in_review" },
    },
    meta,
    { actor_ref, environment: ENVIRONMENT },
  );

  return finalize(200, {
    ok: true,
    dossier_id,
    status: finalStatus || "in_review",
    locked_at: finalLockedAt,
    all_required_pass: true,
    checks,
    missingSteps: [],
    doFinalize,
  });
});
