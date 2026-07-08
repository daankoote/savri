// supabase/functions/api-app-signup-submit/index.ts
//
// Contract/smoke skeleton for the future /app signup submit endpoint.
// Frontend may assist; backend decides.
//
// Foundation migration must be applied/tested before enabling production writes.
// This endpoint is not yet wired from /app.

import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";

type SignupSmokePayload = {
  accountType?: unknown;
  applicant?: unknown;
  consentBundleAcceptance?: unknown;
  feeTermsAcceptance?: unknown;
  locations?: unknown;
  chargers?: unknown;
};

const ACCOUNT_TYPES = new Set(["particulier", "zakelijk", "vve"]);

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

async function parseJsonBody(req: Request): Promise<{ ok: true; body: SignupSmokePayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as SignupSmokePayload };
  } catch (_e) {
    return { ok: false };
  }
}

function validateSmokeContract(body: SignupSmokePayload): string | null {
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

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(req, 400, "Idempotency-Key ontbreekt.", "missing_idempotency_key");
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  }

  const validationError = validateSmokeContract(parsed.body);
  if (validationError) {
    return appErrorResponse(req, 400, validationError, "invalid_signup_contract");
  }

  const payload_hash = await payloadHash(parsed.body);

  return appJsonResponse(req, 200, {
    ok: true,
    mode: "skeleton",
    request_id: meta.request_id,
    payload_hash,
    message:
      "Backendcontract aanwezig. Deze smoke-skeleton is nog niet gekoppeld aan productie-submit en schrijft nog geen dossier.",
  });
});
