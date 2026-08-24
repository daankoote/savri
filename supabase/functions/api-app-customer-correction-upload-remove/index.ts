import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import { requireVerifiedSupabaseAuthUser } from "../_shared/app_customer_auth.ts";
import { normalizeCorrectionReplacementWithdrawRequest } from "../_shared/app_customer_correction_replacement.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import { minutesFromNow } from "../_shared/signup_quarantine.ts";

const WITHDRAW_RPC = "app_customer_correction_replacement_withdraw_v1";
type RpcResult = { data?: unknown; error?: unknown };

export type CorrectionReplacementRemoveDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: CorrectionReplacementRemoveDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: JsonObject, key: string): string {
  return typeof value[key] === "string" ? String(value[key]) : "";
}

export function createHandler(
  overrides: Partial<CorrectionReplacementRemoveDependencies> = {},
): (req: Request) => Promise<Response> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return appOptionsResponse(req);
    if (req.method !== "POST") {
      return appErrorResponse(
        req,
        405,
        "Methode niet toegestaan.",
        "invalid_input",
      );
    }
    const meta = await deps.requestMeta(req);
    if (meta instanceof Response) return meta;
    if (!meta.idempotency_key) {
      return appErrorResponse(
        req,
        400,
        "Aanvraagcode ontbreekt.",
        "invalid_input",
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
        "invalid_input",
      );
    }
    const normalized = normalizeCorrectionReplacementWithdrawRequest(body);
    if (!normalized.ok) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        normalized.code,
      );
    }
    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "Verwijderen is tijdelijk niet beschikbaar.",
        "internal_error",
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
    const result = await serviceClient.rpc(WITHDRAW_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: normalized.value.caseRef,
      p_replacement_target_ref: normalized.value.replacementTargetRef,
      p_candidate_ref: normalized.value.candidateRef,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_payload_sha256: await deps.hashPayload(normalized.value),
      p_idempotency_expires_at: minutesFromNow(24 * 60),
      p_environment: meta.environment,
    }) as RpcResult;
    if (result.error || !isObject(result.data)) {
      return appErrorResponse(
        req,
        500,
        "Verwijderen is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) {
      const code = stringValue(result.data, "code");
      const status = Number(result.data.status);
      const safeStatus = status === 400 || status === 401 || status === 404 ||
          status === 409
        ? status
        : 500;
      return appErrorResponse(
        req,
        safeStatus,
        safeStatus === 401
          ? "Authenticatie vereist."
          : safeStatus === 404
          ? "Correctieopdracht niet gevonden."
          : safeStatus === 409
          ? "Deze correctieopdracht is niet meer actueel."
          : safeStatus === 400
          ? "Controleer de aanvraag."
          : "Verwijderen is tijdelijk niet beschikbaar.",
        safeStatus === 500 ? "internal_error" : code,
      );
    }
    return appJsonResponse(req, 200, {
      ok: true,
      status: stringValue(result.data, "code"),
      replacementTargetRef: stringValue(
        result.data,
        "replacement_target_ref",
      ),
      candidateRef: stringValue(result.data, "candidate_ref"),
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
