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
  parseCorrectionFinalizeRequest,
} from "../_shared/app_customer_correction_submission.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import {
  otpVerifier,
  signingVerifierSecret,
} from "../_shared/signup_signing.ts";

type RpcResult = { data?: unknown; error?: unknown };
function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function safeStatus(value: unknown): number {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 503
    ? status
    : 500;
}

export type CorrectionFinalizeDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};
const DEFAULT_DEPENDENCIES: CorrectionFinalizeDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

export function createHandler(
  overrides: Partial<CorrectionFinalizeDependencies> = {},
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
    const input = parseCorrectionFinalizeRequest(body);
    if (!input) {
      return appErrorResponse(
        req,
        400,
        "Controleer de ondertekening.",
        "invalid_input",
      );
    }
    const serviceClient = deps.createServiceClient();
    const secret = signingVerifierSecret();
    if (!serviceClient || !secret) {
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
    const verifier = await otpVerifier(secret, input.otp);
    const legalBundleSha256 = await correctionLegalBundleHash();
    const result = await serviceClient.rpc(
      "app_customer_correction_finalize_v4",
      {
        p_auth_user_id: verified.context.authUserId,
        p_case_ref: input.caseRef,
        p_challenge_id: input.challengeReference,
        p_otp_verifier_sha256: verifier,
        p_typed_full_name: input.typedFullName,
        p_legal_bundle_version: "customer-correction-confirmation-nl-v1",
        p_legal_bundle_sha256: legalBundleSha256,
        p_request_id: meta.request_id,
        p_idempotency_key: meta.idempotency_key,
        p_environment: meta.environment,
      },
    ) as RpcResult;
    if (result.error || !isRecord(result.data)) {
      return appErrorResponse(
        req,
        500,
        "De correctie kon niet worden ondertekend.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) {
      const status = safeStatus(result.data.status);
      return appErrorResponse(
        req,
        status,
        status === 404
          ? "Dossier niet gevonden."
          : status === 409
          ? "De correctieopdracht is gewijzigd."
          : status === 400
          ? "Controleer de ondertekening."
          : "De correctie kon niet worden ondertekend.",
        typeof result.data.code === "string"
          ? result.data.code
          : "internal_error",
      );
    }
    return appJsonResponse(
      req,
      Number(result.data.status) === 200 ? 200 : 201,
      result.data,
    );
  };
}

export const handler = createHandler();
if (import.meta.main) serve(handler);
