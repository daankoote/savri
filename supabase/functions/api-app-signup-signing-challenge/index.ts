import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  insertAppIntakeAuditFailOpen,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  capabilityHash,
  isRecord,
  parseRecordBody,
  publicRpcBody,
  signupServiceClient,
  stringField,
} from "../_shared/signup_quarantine.ts";
import {
  isExplicitLocalSigningEnvironment,
  signingLegalBundleAllowed,
  signingLegalRuntimeProjection,
} from "../_shared/signing_legal_runtime.ts";
import { resolveSigningOtpTransport } from "../_shared/signing_otp_transport.ts";
import {
  channelReference,
  generateSigningOtp,
  maskEmail,
  otpVerifier,
  signingVerifierSecret,
  validUuid,
} from "../_shared/signup_signing.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);
  if (req.method !== "POST") {
    return appErrorResponse(
      req,
      405,
      "Methode niet toegestaan.",
      "method_not_allowed",
    );
  }
  const meta = await getAppRequestMeta(req);
  if (!meta.idempotency_key) {
    return appErrorResponse(
      req,
      400,
      "Aanvraagcode ontbreekt.",
      "missing_idempotency_key",
    );
  }
  const body = await parseRecordBody(req);
  if (!body) {
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      "invalid_json",
    );
  }
  const intakeId = stringField(body, "intake_reference").toLowerCase();
  const capability = stringField(body, "management_capability");
  if (!validUuid(intakeId) || !capability) {
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      "invalid_request",
    );
  }

  const environment = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
  };
  if (!signingLegalBundleAllowed(environment)) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is nog niet beschikbaar.",
      "legal_bundle_not_current",
    );
  }
  const localCandidate = isExplicitLocalSigningEnvironment(environment);
  const secret = signingVerifierSecret();
  const transport = resolveSigningOtpTransport();
  const SB = signupServiceClient();
  if (!secret || !transport || !SB) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  const intake = await SB.from("app_signup_intakes").select(
    "email_normalized,status,expires_at",
  )
    .eq("id", intakeId).maybeSingle();
  if (
    intake.error || !intake.data || intake.data.status !== "collecting" ||
    new Date(intake.data.expires_at).getTime() <= Date.now()
  ) {
    return appErrorResponse(
      req,
      403,
      "Deze aanmelding is niet beschikbaar.",
      "intake_unavailable",
    );
  }
  const email = String(intake.data.email_normalized || "");
  const code = generateSigningOtp();
  const channelHash = await channelReference(secret, email);
  const verifier = await otpVerifier(secret, code);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const normalizedPayloadHash = await payloadHash({
    intake_reference: intakeId,
    method_id: "typed_name_otp_v1",
    method_version: "1",
    channel_reference_sha256: channelHash,
  });
  const manageHash = await capabilityHash(capability);
  const issued = await SB.rpc("app_signup_signing_challenge_issue_v1", {
    p_intake_id: intakeId,
    p_manage_token_sha256: manageHash,
    p_channel_reference_sha256: channelHash,
    p_otp_verifier_sha256: verifier,
    p_expires_at: expiresAt,
    p_payload_hash: normalizedPayloadHash,
    p_request_id: meta.request_id,
    p_idempotency_key: meta.idempotency_key,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
  });
  if (issued.error) {
    return appErrorResponse(
      req,
      403,
      "Code kan niet worden aangevraagd.",
      "challenge_unavailable",
    );
  }
  const rpc = publicRpcBody(issued.data);
  if (!rpc) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
  if (rpc.body.ok !== true) return appJsonResponse(req, rpc.status, rpc.body);
  if (!isRecord(rpc.body)) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
  const challengeReference = stringField(rpc.body, "challenge_reference");
  if (rpc.body.replayed === true) {
    const existing = await SB.from("app_signup_signing_challenges")
      .select("delivery_status,expires_at,replaced_at,consumed_at")
      .eq("id", challengeReference)
      .eq("intake_id", intakeId)
      .maybeSingle();
    if (
      existing.error || !existing.data ||
      existing.data.delivery_status !== "delivered" ||
      existing.data.replaced_at || existing.data.consumed_at ||
      new Date(existing.data.expires_at).getTime() <= Date.now()
    ) {
      return appErrorResponse(
        req,
        409,
        "Vraag een nieuwe code aan.",
        "challenge_unavailable",
      );
    }
    return appJsonResponse(req, rpc.status, {
      ...rpc.body,
      delivery_target_masked: maskEmail(email),
      legal_bundle_mode: localCandidate
        ? "local_validation_candidate"
        : "current",
      legal_documents: await signingLegalRuntimeProjection(),
    });
  }
  const delivery = await transport.deliver({
    challengeReference,
    verifiedChannelReference: channelHash,
    deliveryTarget: email,
    secretCode: code,
    expiresAt,
    templateVersion: "signup-signing-otp-nl-v1",
    requestReference: meta.request_id,
  });
  const deliveryUpdate = delivery.delivered
    ? {
      delivery_status: "delivered",
      transport_id: delivery.transportId,
      provider_delivery_reference: delivery.providerDeliveryReference || null,
      delivered_at: new Date().toISOString(),
    }
    : {
      delivery_status: "failed",
      transport_id: delivery.transportId,
      delivery_failed_at: new Date().toISOString(),
      replaced_at: new Date().toISOString(),
    };
  const updated = await SB.from("app_signup_signing_challenges").update(
    deliveryUpdate,
  ).eq("id", challengeReference).eq("intake_id", intakeId);
  if (!delivery.delivered || updated.error) {
    return appErrorResponse(
      req,
      503,
      "De code kon niet worden verzonden.",
      delivery.safeFailureCode || "delivery_failed",
    );
  }
  await insertAppIntakeAuditFailOpen(SB, {
    event_type: "signup_signing_challenge_delivered",
    event_data: {
      intake_reference: intakeId,
      challenge_reference: challengeReference,
      transport_id: delivery.transportId,
    },
  }, meta);
  return appJsonResponse(req, rpc.status, {
    ...rpc.body,
    delivery_target_masked: maskEmail(email),
    legal_bundle_mode: localCandidate
      ? "local_validation_candidate"
      : "current",
    legal_documents: await signingLegalRuntimeProjection(),
  });
});
