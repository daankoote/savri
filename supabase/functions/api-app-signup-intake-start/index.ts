import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  capabilityHash,
  configuredMinutes,
  deriveCapabilityToken,
  minutesFromNow,
  normalizeEmail,
  parseRecordBody,
  publicRpcBody,
  signupServiceClient,
  SignupCapabilityConfigurationError,
  stringField,
} from "../_shared/signup_quarantine.ts";

const ACCOUNT_TYPES = new Set(["particulier", "zakelijk", "vve"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);
  if (req.method !== "POST") return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");

  const meta = await getAppRequestMeta(req);
  if (!meta.idempotency_key) return appErrorResponse(req, 400, "Aanvraagcode ontbreekt.", "missing_idempotency_key");

  const body = await parseRecordBody(req);
  if (!body) return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  const accountType = stringField(body, "account_type").toLowerCase();
  const email = normalizeEmail(stringField(body, "email"));
  if (!ACCOUNT_TYPES.has(accountType) || !email) {
    return appErrorResponse(req, 400, "Controleer accounttype en e-mailadres.", "invalid_signup_basis");
  }

  const normalized = { account_type: accountType, email };
  const normalizedPayloadHash = await payloadHash(normalized);
  let rawCapability: string;
  try {
    rawCapability = await deriveCapabilityToken("intake_manage", meta.idempotency_key, normalizedPayloadHash);
  } catch (error) {
    if (error instanceof SignupCapabilityConfigurationError) {
      return appErrorResponse(req, 503, "Aanmelden is tijdelijk niet beschikbaar.", "service_unavailable");
    }
    throw error;
  }
  const manageTokenSha256 = await capabilityHash(rawCapability);
  const intakeTtlMinutes = configuredMinutes("APP_SIGNUP_INTAKE_TTL_MINUTES", 1440, 10, 10080);
  const manageTtlMinutes = configuredMinutes("APP_SIGNUP_MANAGE_TTL_MINUTES", 720, 10, intakeTtlMinutes);
  const intakeExpiresAt = minutesFromNow(intakeTtlMinutes);
  const capabilityExpiresAt = minutesFromNow(manageTtlMinutes);
  const SB = signupServiceClient();
  if (!SB) return appErrorResponse(req, 503, "Aanmelden is tijdelijk niet beschikbaar.", "service_unavailable");

  const { data, error } = await SB.rpc("app_signup_quarantine_start_v1", {
    p_account_type: accountType,
    p_email_normalized: email,
    p_payload_hash: normalizedPayloadHash,
    p_manage_token_sha256: manageTokenSha256,
    p_intake_expires_at: intakeExpiresAt,
    p_capability_expires_at: capabilityExpiresAt,
    p_request_id: meta.request_id,
    p_idempotency_key: meta.idempotency_key,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
  });
  if (error) return appErrorResponse(req, 503, "Aanmelden is tijdelijk niet beschikbaar.", "service_unavailable");
  const rpc = publicRpcBody(data);
  if (!rpc) return appErrorResponse(req, 503, "Aanmelden is tijdelijk niet beschikbaar.", "service_unavailable");
  if (rpc.body.ok !== true) return appJsonResponse(req, rpc.status, rpc.body);

  return appJsonResponse(req, 200, {
    ...rpc.body,
    management_capability: rawCapability,
  });
});
