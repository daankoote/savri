import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  insertAppIntakeAuditFailOpen,
  payloadHash,
} from "../_shared/app_foundation.ts";
import { authorizeSignupSigningIntakeV1 } from "../_shared/app_signup_signing_authorization.ts";
import { DataPlaneTenantConfigurationV1Adapter } from "../_shared/app_tenant_configuration_data_plane_v1.ts";
import {
  resolveTenantSigningMaterialBundleV1,
  type TenantSigningMaterialDataPlaneClient,
} from "../_shared/app_tenant_signing_material_data_plane_v1.ts";
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
  resolveDeploymentPresentationMailIdentity,
  resolvePresentationMailIdentity,
} from "../_shared/app_workflow_email_context.ts";
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
  const receiptReference = stringField(
    body,
    "presentation_receipt_reference",
  );
  const receiptSha256 = stringField(body, "presentation_receipt_sha256")
    .toLowerCase();
  const receiptBound = Boolean(receiptReference || receiptSha256);
  const legalActions = isRecord(body.legal_actions) ? body.legal_actions : null;
  if (
    receiptBound &&
    (
      !/^SPR-[0-9a-f-]{36}$/.test(receiptReference) ||
      !/^[0-9a-f]{64}$/.test(receiptSha256) ||
      !legalActions ||
      legalActions.privacy_notice_read !== true ||
      legalActions.service_terms_accepted !== true ||
      legalActions.fee_terms_accepted !== true ||
      legalActions.mandate_signed !== true ||
      Object.keys(body).some((key) =>
        ![
          "intake_reference",
          "management_capability",
          "presentation_receipt_reference",
          "presentation_receipt_sha256",
          "legal_actions",
        ].includes(key)
      )
    )
  ) {
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
  let email = "";
  let manageHash = "";
  let authenticatedAuthUserId: string | null = null;
  if (receiptBound) {
    const authorization = await authorizeSignupSigningIntakeV1(
      req,
      SB,
      intakeId,
      capability,
    );
    if (!authorization.ok) {
      return appErrorResponse(
        req,
        authorization.status,
        authorization.message,
        authorization.code,
      );
    }
    email = authorization.value.emailNormalized;
    manageHash = authorization.value.manageCapabilitySha256;
    authenticatedAuthUserId = authorization.value.authUserId;
  } else {
    if (!signingLegalBundleAllowed(environment)) {
      return appErrorResponse(
        req,
        503,
        "Ondertekenen is nog niet beschikbaar.",
        "legal_bundle_not_current",
      );
    }
    const intake = await SB.from("app_signup_intakes").select(
      "email_normalized,status,expires_at",
    ).eq("id", intakeId).maybeSingle();
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
    email = String(intake.data.email_normalized || "");
    manageHash = await capabilityHash(capability);
  }
  const meta = await getAppRequestMeta(req);
  if (meta instanceof Response) return meta;
  if (!meta.idempotency_key || (receiptBound && !meta.tenant_execution)) {
    return appErrorResponse(
      req,
      400,
      "Aanvraagcode ontbreekt.",
      "missing_idempotency_key",
    );
  }
  const mailIdentity = meta.tenant_execution
    ? await resolvePresentationMailIdentity(
      { get: (name: string) => Deno.env.get(name) },
      meta.tenant_execution,
    )
    : await resolveDeploymentPresentationMailIdentity({
      get: (name: string) => Deno.env.get(name),
    });
  if (!mailIdentity) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
  const code = generateSigningOtp();
  const channelHash = await channelReference(secret, email);
  const verifier = await otpVerifier(secret, code);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  let issued: { data: unknown; error: unknown };
  if (receiptBound && meta.tenant_execution && authenticatedAuthUserId) {
    const receipt = await SB.from("app_signup_signing_presentation_receipts")
      .select("id")
      .eq("receipt_reference", receiptReference)
      .eq("intake_id", intakeId)
      .eq("authenticated_auth_user_id", authenticatedAuthUserId)
      .eq("tenant_id", meta.tenant_execution.tenantId)
      .eq("environment", meta.tenant_execution.environment).maybeSingle();
    if (receipt.error || !receipt.data) {
      return appErrorResponse(
        req,
        403,
        "Vraag de documenten opnieuw op.",
        "presentation_receipt_unavailable",
      );
    }
    const acceptance = await SB.from(
      "app_signup_signing_presentation_acceptances",
    ).select("id").eq("presentation_receipt_id", receipt.data.id).maybeSingle();
    let currentManifestRowId: string | null = null;
    let currentManifestSha256: string | null = null;
    if (!acceptance.data) {
      const configuration = await new DataPlaneTenantConfigurationV1Adapter(
        SB,
        Object.freeze({ now: () => new Date(meta.timestamp) }),
      ).resolveForExecutionContext(meta.tenant_execution);
      if (!configuration.ok) {
        return appErrorResponse(
          req,
          503,
          "Ondertekenen is tijdelijk niet beschikbaar.",
          "signing_configuration_unavailable",
        );
      }
      const materials = await resolveTenantSigningMaterialBundleV1(
        SB as unknown as TenantSigningMaterialDataPlaneClient,
        meta.tenant_execution,
        configuration.value,
        meta.timestamp,
      );
      if (!materials.ok) {
        return appErrorResponse(
          req,
          503,
          "Ondertekenen is tijdelijk niet beschikbaar.",
          "signing_material_unavailable",
        );
      }
      currentManifestRowId = materials.value.manifestRowId;
      currentManifestSha256 = configuration.value.manifest.canonicalSha256;
    }
    const acceptedAt = meta.timestamp;
    const acceptanceSha256 = await payloadHash({
      schema_version: "signup-signing-presentation-acceptance-v1",
      intake_id: intakeId,
      authenticated_auth_user_id: authenticatedAuthUserId,
      receipt_reference: receiptReference,
      receipt_sha256: receiptSha256,
      legal_actions: legalActions,
      accepted_at: acceptedAt,
      request_id: meta.request_id,
    });
    const normalizedPayloadHash = await payloadHash({
      intake_reference: intakeId,
      method_id: "typed_name_otp_v1",
      method_version: "1",
      channel_reference_sha256: channelHash,
      presentation_receipt_reference: receiptReference,
      presentation_receipt_sha256: receiptSha256,
      legal_actions: legalActions,
    });
    issued = await SB.rpc("app_signup_signing_challenge_issue_v2", {
      p_intake_id: intakeId,
      p_manage_token_sha256: manageHash,
      p_authenticated_auth_user_id: authenticatedAuthUserId,
      p_tenant_id: meta.tenant_execution.tenantId,
      p_environment: meta.tenant_execution.environment,
      p_receipt_reference: receiptReference,
      p_receipt_sha256: receiptSha256,
      p_current_manifest_revision_id: currentManifestRowId,
      p_current_manifest_sha256: currentManifestSha256,
      p_privacy_notice_read: true,
      p_service_terms_accepted: true,
      p_fee_terms_accepted: true,
      p_mandate_signed: true,
      p_accepted_at: acceptedAt,
      p_acceptance_sha256: acceptanceSha256,
      p_channel_reference_sha256: channelHash,
      p_otp_verifier_sha256: verifier,
      p_expires_at: expiresAt,
      p_payload_hash: normalizedPayloadHash,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_ip_hash: meta.ip_hash,
      p_user_agent_hash: meta.user_agent_hash,
    });
  } else {
    const normalizedPayloadHash = await payloadHash({
      intake_reference: intakeId,
      method_id: "typed_name_otp_v1",
      method_version: "1",
      channel_reference_sha256: channelHash,
    });
    issued = await SB.rpc("app_signup_signing_challenge_issue_v1", {
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
  }
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
    return appJsonResponse(
      req,
      rpc.status,
      receiptBound
        ? {
          ...rpc.body,
          delivery_target_masked: maskEmail(email),
        }
        : {
          ...rpc.body,
          delivery_target_masked: maskEmail(email),
          legal_bundle_mode: localCandidate
            ? "local_validation_candidate"
            : "current",
          legal_documents: await signingLegalRuntimeProjection(),
        },
    );
  }
  const delivery = await transport.deliver({
    challengeReference,
    verifiedChannelReference: channelHash,
    deliveryTarget: email,
    secretCode: code,
    expiresAt,
    templateVersion: "signup-signing-otp-nl-v1",
    requestReference: meta.request_id,
    displayName: mailIdentity.displayName,
    senderName: mailIdentity.mailDisplayName,
    senderAddress: mailIdentity.mailAddress,
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
  return appJsonResponse(
    req,
    rpc.status,
    receiptBound
      ? {
        ...rpc.body,
        delivery_target_masked: maskEmail(email),
      }
      : {
        ...rpc.body,
        delivery_target_masked: maskEmail(email),
        legal_bundle_mode: localCandidate
          ? "local_validation_candidate"
          : "current",
        legal_documents: await signingLegalRuntimeProjection(),
      },
  );
});
