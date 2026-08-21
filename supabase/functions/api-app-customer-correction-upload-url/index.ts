import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  requireVerifiedSupabaseAuthUser,
} from "../_shared/app_customer_auth.ts";
import {
  CORRECTION_REPLACEMENT_ACCEPTED_MIME_TYPES,
  CORRECTION_REPLACEMENT_MAX_UPLOAD_BYTES,
  createCorrectionReplacementSignedUpload,
  normalizeCorrectionReplacementIssueRequest,
} from "../_shared/app_customer_correction_replacement.ts";
import {
  configuredMinutes,
  minutesFromNow,
} from "../_shared/signup_quarantine.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";

const ISSUE_RPC = "app_customer_correction_replacement_upload_issue_v1";

type RpcResult = { data?: unknown; error?: unknown };

export type CorrectionReplacementUploadUrlDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
  createSignedUpload: typeof createCorrectionReplacementSignedUpload;
  uploadExpiresAt: () => string;
  idempotencyExpiresAt: () => string;
};

const DEFAULT_DEPENDENCIES: CorrectionReplacementUploadUrlDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
  createSignedUpload: createCorrectionReplacementSignedUpload,
  uploadExpiresAt: () =>
    minutesFromNow(configuredMinutes(
      "APP_CUSTOMER_CORRECTION_UPLOAD_TTL_MINUTES",
      30,
      10,
      120,
    )),
  idempotencyExpiresAt: () => minutesFromNow(24 * 60),
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: JsonObject, key: string): string {
  return typeof value[key] === "string" ? String(value[key]) : "";
}

function rpcFailure(req: Request, value: JsonObject): Response {
  const code = stringValue(value, "code") || "internal_error";
  const status = Number(value.status);
  const safeStatus = [400, 401, 404, 409, 413, 415].includes(status)
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
      : safeStatus === 413
      ? "Bestand is te groot."
      : safeStatus === 415
      ? "Upload een PDF-bestand."
      : safeStatus === 400
      ? "Controleer de upload."
      : "Upload is tijdelijk niet beschikbaar.",
    safeStatus === 500 ? "internal_error" : code,
  );
}

export function createHandler(
  overrides: Partial<CorrectionReplacementUploadUrlDependencies> = {},
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
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch (_error) {
      return appErrorResponse(
        req,
        400,
        "Controleer de upload.",
        "invalid_input",
      );
    }
    const normalized = normalizeCorrectionReplacementIssueRequest(rawBody);
    if (!normalized.ok) {
      const status = normalized.code === "file_too_large"
        ? 413
        : normalized.code === "unsupported_mime_type"
        ? 415
        : 400;
      return appErrorResponse(
        req,
        status,
        status === 413
          ? "Bestand is te groot."
          : status === 415
          ? "Upload een PDF-bestand."
          : "Controleer de upload.",
        normalized.code,
      );
    }
    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "Upload is tijdelijk niet beschikbaar.",
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
    const payloadSha256 = await deps.hashPayload(normalized.value);
    const result = await serviceClient.rpc(ISSUE_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: normalized.value.caseRef,
      p_replacement_target_ref: normalized.value.replacementTargetRef,
      p_original_filename: normalized.value.fileName,
      p_declared_mime_type: normalized.value.mimeType,
      p_declared_size_bytes: normalized.value.sizeBytes,
      p_upload_expires_at: deps.uploadExpiresAt(),
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_payload_sha256: payloadSha256,
      p_idempotency_expires_at: deps.idempotencyExpiresAt(),
      p_environment: meta.environment,
    }) as RpcResult;
    if (result.error || !isObject(result.data)) {
      return appErrorResponse(
        req,
        500,
        "Upload is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) return rpcFailure(req, result.data);
    const bucket = stringValue(result.data, "storage_bucket");
    const path = stringValue(result.data, "storage_path");
    const signed = await deps.createSignedUpload(serviceClient, bucket, path);
    if (!signed) {
      return appErrorResponse(
        req,
        503,
        "Upload is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    return appJsonResponse(req, 201, {
      ok: true,
      uploadRef: stringValue(result.data, "upload_ref"),
      replacementTargetRef: stringValue(result.data, "replacement_target_ref"),
      signedUploadUrl: signed.signed_upload_url,
      uploadToken: signed.upload_token,
      expiresAt: stringValue(result.data, "expires_at"),
      acceptedMimeTypes: CORRECTION_REPLACEMENT_ACCEPTED_MIME_TYPES,
      maximumFileSize: CORRECTION_REPLACEMENT_MAX_UPLOAD_BYTES,
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
