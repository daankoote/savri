import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
} from "../_shared/app_foundation.ts";
import { requireVerifiedSupabaseAuthUser } from "../_shared/app_customer_auth.ts";
import {
  correctionLegalBundleHash,
  correctionLegalBundleProjection,
  correctionResponsePayloadHash,
  correctionSignerNamesMatch,
  parseCorrectionChallengeRequest,
} from "../_shared/app_customer_correction_submission.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import { resolveSigningOtpTransport } from "../_shared/signing_otp_transport.ts";
import {
  channelReference,
  generateSigningOtp,
  maskEmail,
  otpVerifier,
  signingVerifierSecret,
  validUuid,
} from "../_shared/signup_signing.ts";

type RpcResult = { data?: unknown; error?: unknown };
type ChallengeRow = {
  delivery_status?: string;
  expires_at?: string;
  replaced_at?: string | null;
  consumed_at?: string | null;
};

type SignerContext = {
  expectedName: string;
  authorityRef: string;
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeStatus(value: unknown): number {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 503
    ? status
    : 500;
}

function signerContext(value: unknown): SignerContext | null {
  if (
    !isRecord(value) || value.ok !== true || value.status !== 200 ||
    typeof value.expected_signer_display_name !== "string" ||
    typeof value.expected_signer_authority_ref !== "string" ||
    !/^CSA-[A-F0-9]{32}$/.test(value.expected_signer_authority_ref)
  ) return null;
  return {
    expectedName: value.expected_signer_display_name,
    authorityRef: value.expected_signer_authority_ref,
  };
}

export type CorrectionChallengeDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: CorrectionChallengeDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

export function createHandler(
  overrides: Partial<CorrectionChallengeDependencies> = {},
): (req: Request) => Promise<Response> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return appOptionsResponse(req);
    if (req.method !== "POST") {
      return appErrorResponse(
        req,
        405,
        "Methode niet toegestaan.",
        "method_not_allowed",
      );
    }
    const meta = await deps.requestMeta(req);
    if (meta instanceof Response) return meta;
    if (!meta.idempotency_key) {
      return appErrorResponse(
        req,
        400,
        "Aanvraagcode ontbreekt.",
        "missing_idempotency_key",
      );
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch (_error) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        "invalid_json",
      );
    }
    const input = parseCorrectionChallengeRequest(body);
    if (!input) {
      return appErrorResponse(
        req,
        400,
        "Controleer de correcties.",
        "invalid_input",
      );
    }
    const serviceClient = deps.createServiceClient();
    const secret = signingVerifierSecret();
    const transport = resolveSigningOtpTransport();
    if (!serviceClient || !secret || !transport) {
      return appErrorResponse(
        req,
        503,
        "Ondertekenen is tijdelijk niet beschikbaar.",
        "service_unavailable",
      );
    }
    const verified = await deps.verifyBearer(req, serviceClient);
    if (!verified.ok) {
      return appErrorResponse(
        req,
        401,
        "Authenticatie vereist.",
        "authentication_required",
      );
    }
    const signerResult = await serviceClient.rpc(
      "app_customer_correction_signer_context_v1",
      {
        p_auth_user_id: verified.context.authUserId,
        p_case_ref: input.caseRef,
      },
    ) as RpcResult;
    if (signerResult.error || !isRecord(signerResult.data)) {
      return appErrorResponse(
        req,
        500,
        "Ondertekenen is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    const expectedSigner = signerContext(signerResult.data);
    if (!expectedSigner) {
      const status = signerResult.data.ok === false
        ? safeStatus(signerResult.data.status)
        : 500;
      return appErrorResponse(
        req,
        status,
        status === 404
          ? "Dossier niet gevonden."
          : status === 400
          ? "Controleer de ondertekening."
          : status === 409
          ? "Ondertekenen is niet beschikbaar voor dit account."
          : "Ondertekenen is tijdelijk niet beschikbaar.",
        typeof signerResult.data.code === "string"
          ? signerResult.data.code
          : "internal_error",
      );
    }
    if (
      !correctionSignerNamesMatch(
        input.typedFullName,
        expectedSigner.expectedName,
      )
    ) {
      return appErrorResponse(
        req,
        400,
        "De ingevoerde naam komt niet overeen met de verwachte ondertekenaar.",
        "signer_name_mismatch",
      );
    }
    const code = generateSigningOtp();
    const channelHash = await channelReference(
      secret,
      verified.context.emailNormalized,
    );
    const verifier = await otpVerifier(secret, code);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const payloadSha256 = await correctionResponsePayloadHash(
      input,
      expectedSigner.authorityRef,
    );
    const legalBundleSha256 = await correctionLegalBundleHash();
    const issued = await serviceClient.rpc(
      "app_customer_correction_challenge_issue_v5",
      {
        p_auth_user_id: verified.context.authUserId,
        p_case_ref: input.caseRef,
        p_fact_resolutions: input.factResolutions,
        p_responses: input.responses,
        p_typed_full_name: input.typedFullName,
        p_channel_reference_sha256: channelHash,
        p_otp_verifier_sha256: verifier,
        p_expires_at: expiresAt,
        p_payload_sha256: payloadSha256,
        p_legal_bundle_version: "customer-correction-confirmation-nl-v1",
        p_legal_bundle_sha256: legalBundleSha256,
        p_request_id: meta.request_id,
        p_idempotency_key: meta.idempotency_key,
        p_environment: meta.environment,
      },
    ) as RpcResult;
    if (issued.error || !isRecord(issued.data)) {
      return appErrorResponse(
        req,
        500,
        "Ondertekenen is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (issued.data.ok !== true) {
      const status = safeStatus(issued.data.status);
      return appErrorResponse(
        req,
        status,
        status === 404
          ? "Dossier niet gevonden."
          : status === 409
          ? "De correctieopdracht is gewijzigd."
          : status === 400
          ? "Controleer de correcties."
          : "Ondertekenen is tijdelijk niet beschikbaar.",
        typeof issued.data.code === "string"
          ? issued.data.code
          : "internal_error",
      );
    }
    const challengeReference = String(issued.data.challenge_reference || "");
    if (!validUuid(challengeReference)) {
      return appErrorResponse(
        req,
        500,
        "Ondertekenen is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (issued.data.replayed === true) {
      const query = serviceClient.from("app_signup_signing_challenges") as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<
                { data?: ChallengeRow | null; error?: unknown }
              >;
            };
          };
        };
      };
      const existing = await query.select(
        "delivery_status,expires_at,replaced_at,consumed_at",
      )
        .eq("id", challengeReference).eq("subject_type", "CUSTOMER_CORRECTION")
        .maybeSingle();
      if (
        existing.error || !existing.data ||
        existing.data.delivery_status !== "delivered" ||
        existing.data.replaced_at || existing.data.consumed_at ||
        new Date(String(existing.data.expires_at)).getTime() <= Date.now()
      ) {
        return appErrorResponse(
          req,
          409,
          "Vraag een nieuwe code aan.",
          "challenge_unavailable",
        );
      }
      return appJsonResponse(req, 200, {
        ok: true,
        challenge_reference: challengeReference,
        expires_at: issued.data.expires_at,
        item_count: issued.data.item_count,
        delivery_target_masked: maskEmail(verified.context.emailNormalized),
        legal_bundle: correctionLegalBundleProjection(),
      });
    }
    const delivery = await transport.deliver({
      challengeReference,
      verifiedChannelReference: channelHash,
      deliveryTarget: verified.context.emailNormalized,
      secretCode: code,
      expiresAt,
      templateVersion: "customer-correction-signing-otp-nl-v1",
      requestReference: meta.request_id,
    });
    const table = serviceClient.from("app_signup_signing_challenges") as {
      update: (values: JsonObject) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error?: unknown }>;
        };
      };
    };
    const now = new Date().toISOString();
    const updated = await table.update(
      delivery.delivered
        ? {
          delivery_status: "delivered",
          transport_id: delivery.transportId,
          provider_delivery_reference: delivery.providerDeliveryReference ||
            null,
          delivered_at: now,
        }
        : {
          delivery_status: "failed",
          transport_id: delivery.transportId,
          delivery_failed_at: now,
          replaced_at: now,
        },
    ).eq("id", challengeReference).eq("subject_type", "CUSTOMER_CORRECTION");
    if (!delivery.delivered || updated.error) {
      return appErrorResponse(
        req,
        503,
        "De code kon niet worden verzonden.",
        delivery.safeFailureCode || "delivery_failed",
      );
    }
    return appJsonResponse(req, 201, {
      ok: true,
      challenge_reference: challengeReference,
      expires_at: issued.data.expires_at,
      item_count: issued.data.item_count,
      delivery_target_masked: maskEmail(verified.context.emailNormalized),
      legal_bundle: correctionLegalBundleProjection(),
    });
  };
}

export const handler = createHandler();
if (import.meta.main) serve(handler);
