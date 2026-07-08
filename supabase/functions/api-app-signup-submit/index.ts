// supabase/functions/api-app-signup-submit/index.ts
//
// DB-write v1 foundation for the future /app signup submit endpoint.
// Frontend may assist; backend decides.
//
// Foundation migration must be applied/tested before enabling production writes.
// This endpoint is not yet wired from /app.

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  insertAppAuditFailOpen,
  insertAppIntakeAuditFailOpen,
  payloadHash,
} from "../_shared/app_foundation.ts";

type SignupSubmitPayload = {
  accountType?: unknown;
  applicant?: unknown;
  consentBundleAcceptance?: unknown;
  feeTermsAcceptance?: unknown;
  locations?: unknown;
  chargers?: unknown;
};

const ACCOUNT_TYPES = new Set(["particulier", "zakelijk", "vve"]);
const IDEMPOTENCY_SCOPE = "api-app-signup-submit:v1";
const IDEMPOTENCY_TTL_HOURS = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return getString(value).toLowerCase();
}

function displayNameFromApplicant(applicant: Record<string, unknown>, email: string): string {
  const firstName = getString(applicant.firstName ?? applicant.first_name ?? applicant.voornaam);
  const lastName = getString(applicant.lastName ?? applicant.last_name ?? applicant.achternaam);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  const prefix = email.split("@")[0]?.trim();
  return prefix || email;
}

function appSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function parseJsonBody(req: Request): Promise<{ ok: true; body: SignupSubmitPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as SignupSubmitPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function validateSubmitContract(body: SignupSubmitPayload): string | null {
  if (!ACCOUNT_TYPES.has(getString(body.accountType))) {
    return "Controleer het type aanmelding.";
  }

  if (!isRecord(body.applicant)) {
    return "Controleer de aanvragergegevens.";
  }

  const email = getString(body.applicant.email);
  if (!email) {
    return "Controleer het e-mailadres.";
  }

  const consentBundleAcceptance = getNestedRecord(body, "consentBundleAcceptance");
  if (consentBundleAcceptance?.accepted !== true) {
    return "Bevestig toestemming en voorwaarden.";
  }

  const feeTermsAcceptance = getNestedRecord(body, "feeTermsAcceptance");
  if (feeTermsAcceptance?.accepted !== true) {
    return "Bevestig de ENVAL feevoorwaarden.";
  }

  if (!Array.isArray(body.locations) && !Array.isArray(body.chargers)) {
    return "Controleer de laadpaal- of locatiegegevens.";
  }

  return null;
}

async function reserveOrReplayIdempotency(
  SB: any,
  key: string,
  payload_hash: string,
): Promise<
  | { ok: true; replay: false }
  | { ok: true; replay: true; status: number; body: unknown }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; status: number; code: string; message: string }
> {
  const { data: existing, error: lookupError } = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("key", key)
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      conflict: false,
      status: 500,
      code: "service_unavailable",
      message: "Aanmelding tijdelijk niet beschikbaar.",
    };
  }

  if (existing) {
    if (existing.payload_hash !== payload_hash) {
      return { ok: false, conflict: true };
    }

    if (existing.response_status && existing.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(existing.response_status),
        body: existing.response_body,
      };
    }

    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Aanmelding wordt al verwerkt.",
    };
  }

  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await SB.from("app_idempotency_keys").insert([{
    scope: IDEMPOTENCY_SCOPE,
    key,
    payload_hash,
    locked_at: new Date().toISOString(),
    expires_at: expiresAt,
  }]);

  if (!insertError) {
    return { ok: true, replay: false };
  }

  // Race-safe fallback: another request may have inserted the row first.
  const retry = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("key", key)
    .maybeSingle();

  if (!retry.error && retry.data) {
    if (retry.data.payload_hash !== payload_hash) return { ok: false, conflict: true };
    if (retry.data.response_status && retry.data.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(retry.data.response_status),
        body: retry.data.response_body,
      };
    }
    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Aanmelding wordt al verwerkt.",
    };
  }

  return {
    ok: false,
    conflict: false,
    status: 500,
    code: "service_unavailable",
    message: "Aanmelding tijdelijk niet beschikbaar.",
  };
}

async function completeIdempotency(SB: any, key: string, status: number, body: unknown): Promise<void> {
  await SB
    .from("app_idempotency_keys")
    .update({
      response_status: status,
      response_body: body,
      completed_at: new Date().toISOString(),
    })
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("key", key);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(req, 400, "Idempotency-Key ontbreekt.", "missing_idempotency_key");
  }

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    await insertAppIntakeAuditFailOpen(SB, {
      event_type: "signup_submit_invalid_json",
      actor_type: "anonymous",
      event_data: { reason: "invalid_json" },
    }, meta);
    return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  }

  const payload_hash = await payloadHash(parsed.body);

  const idempotency = await reserveOrReplayIdempotency(SB, meta.idempotency_key, payload_hash);
  if (!idempotency.ok) {
    if (idempotency.conflict) {
      await insertAppIntakeAuditFailOpen(SB, {
        event_type: "signup_submit_idempotency_conflict",
        actor_type: "anonymous",
        event_data: { reason: "idempotency_conflict", scope: IDEMPOTENCY_SCOPE },
      }, meta);
      return appErrorResponse(req, 409, "Deze aanvraag hoort bij een andere payload.", "idempotency_conflict");
    }

    return appErrorResponse(req, idempotency.status, idempotency.message, idempotency.code);
  }

  if (idempotency.replay) {
    return appJsonResponse(req, idempotency.status, idempotency.body);
  }

  const validationError = validateSubmitContract(parsed.body);
  if (validationError) {
    await insertAppIntakeAuditFailOpen(SB, {
      event_type: "signup_submit_invalid_contract",
      actor_type: "anonymous",
      event_data: { reason: "invalid_signup_contract" },
    }, meta);
    return appErrorResponse(req, 400, validationError, "invalid_signup_contract");
  }

  const accountType = getString(parsed.body.accountType) as "particulier" | "zakelijk" | "vve";
  const applicant = parsed.body.applicant as Record<string, unknown>;
  const email_normalized = normalizeEmail(applicant.email);
  const display_name = displayNameFromApplicant(applicant, email_normalized);

  const { data: existingIdentity, error: identityLookupError } = await SB
    .from("app_customer_identities")
    .select("customer_id")
    .eq("email_normalized", email_normalized)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (identityLookupError) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  let customer_id = existingIdentity?.customer_id || null;
  let customerEventType = "customer_matched";

  if (!customer_id) {
    const { data: customer, error: customerInsertError } = await SB
      .from("app_customers")
      .insert([{
        customer_type: accountType,
        display_name,
        preferred_language: "nl",
        primary_email_normalized: email_normalized,
        status: "active",
      }])
      .select("id")
      .single();

    if (customerInsertError || !customer?.id) {
      return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
    }

    customer_id = customer.id;
    customerEventType = "customer_created";

    const { error: identityInsertError } = await SB
      .from("app_customer_identities")
      .insert([{
        customer_id,
        email_normalized,
        identity_provider: "supabase",
        status: "active",
      }]);

    if (identityInsertError) {
      return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
    }
  }

  const { data: dossier, error: dossierInsertError } = await SB
    .from("app_customer_dossiers")
    .insert([{
      customer_id,
      account_type: accountType,
      status: "submitted",
      retention_class: "standard",
      submitted_at: new Date().toISOString(),
    }])
    .select("id")
    .single();

  if (dossierInsertError || !dossier?.id) {
    return appErrorResponse(req, 500, "Aanmelding tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const dossier_id = dossier.id;

  await insertAppAuditFailOpen(SB, {
    event_type: customerEventType,
    scope_type: "customer",
    scope_id: customer_id,
    customer_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      account_type: accountType,
      matched_by: customerEventType === "customer_matched" ? "email_normalized" : null,
    },
  }, meta);

  await insertAppAuditFailOpen(SB, {
    event_type: "dossier_created",
    scope_type: "dossier",
    scope_id: dossier_id,
    customer_id,
    dossier_id,
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      account_type: accountType,
      status: "submitted",
      retention_class: "standard",
    },
  }, meta);

  await insertAppIntakeAuditFailOpen(SB, {
    event_type: "signup_submit_write_accepted",
    actor_type: "edge_function",
    actor_ref: "api-app-signup-submit",
    event_data: {
      account_type: accountType,
      customer_id,
      dossier_id,
      scope: IDEMPOTENCY_SCOPE,
    },
  }, meta);

  const responseBody = {
    ok: true,
    mode: "write_v1",
    request_id: meta.request_id,
    customer_id,
    dossier_id,
    payload_hash,
    message:
      "Foundation submit geaccepteerd en dossier shell aangemaakt. Document-, locatie- en laadpaalverwerking is nog niet geimplementeerd.",
  };

  await completeIdempotency(SB, meta.idempotency_key, 200, responseBody);

  return appJsonResponse(req, 200, responseBody);
});
