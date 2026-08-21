import { serve } from "jsr:@std/http@0.224.0/server";

import type { DocumentFactKey } from "../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";
import type {
  DocumentParserProfileKey,
} from "../../../platform/runtime/document-parsing/document_parser_contract.ts";
import {
  buildParserExecutionIdentity,
  createDocumentParserPort,
} from "../../../platform/runtime/document-parsing/document_parser_core.ts";
import {
  getDocumentParserProfile,
} from "../../../platform/runtime/document-parsing/document_parser_profiles.ts";
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
  downloadCorrectionReplacementObject,
  normalizeCorrectionReplacementConfirmRequest,
  projectCustomerSafeReplacementObservation,
} from "../_shared/app_customer_correction_replacement.ts";
import {
  CURRENT_PDF_PARSER_ADAPTER,
} from "../_shared/app_document_parser_pdf_adapter.ts";
import {
  findPersistedParserObservation,
  persistParserObservation,
} from "../_shared/app_parser_observation_persistence.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import { minutesFromNow } from "../_shared/signup_quarantine.ts";

const RESOLVE_RPC = "app_customer_correction_replacement_upload_resolve_v1";
const CONFIRM_RPC = "app_customer_correction_replacement_upload_confirm_v1";
const DOCUMENT_PARSER = createDocumentParserPort(
  CURRENT_PDF_PARSER_ADAPTER,
  payloadHash,
);

type RpcResult = { data?: unknown; error?: unknown };

export type CorrectionReplacementUploadConfirmDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
  downloadObject: typeof downloadCorrectionReplacementObject;
};

const DEFAULT_DEPENDENCIES: CorrectionReplacementUploadConfirmDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
  downloadObject: downloadCorrectionReplacementObject,
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: JsonObject, key: string): string {
  return typeof value[key] === "string" ? String(value[key]) : "";
}

function safeRpcFailure(req: Request, value: JsonObject): Response {
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
      ? "Upload niet gevonden."
      : safeStatus === 409
      ? "Deze correctieopdracht is niet meer actueel."
      : safeStatus === 413
      ? "Bestand is te groot."
      : safeStatus === 415
      ? "Upload een geldig PDF-bestand."
      : safeStatus === 400
      ? "Controleer de upload."
      : "Uploadcontrole is tijdelijk niet beschikbaar.",
    safeStatus === 500 ? "internal_error" : code,
  );
}

export function createHandler(
  overrides: Partial<CorrectionReplacementUploadConfirmDependencies> = {},
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
    const normalized = normalizeCorrectionReplacementConfirmRequest(rawBody);
    if (!normalized.ok) {
      return appErrorResponse(
        req,
        400,
        "Controleer de upload.",
        normalized.code,
      );
    }
    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "Uploadcontrole is tijdelijk niet beschikbaar.",
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
    const resolved = await serviceClient.rpc(RESOLVE_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: normalized.value.caseRef,
      p_upload_ref: normalized.value.uploadRef,
    }) as RpcResult;
    if (resolved.error || !isObject(resolved.data)) {
      return appErrorResponse(
        req,
        500,
        "Uploadcontrole is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (resolved.data.ok !== true) return safeRpcFailure(req, resolved.data);
    const bucket = stringValue(resolved.data, "storage_bucket");
    const path = stringValue(resolved.data, "storage_path");
    const stored = await deps.downloadObject(serviceClient, bucket, path);
    const payloadSha256 = await deps.hashPayload(normalized.value);
    const confirmed = await serviceClient.rpc(CONFIRM_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: normalized.value.caseRef,
      p_upload_ref: normalized.value.uploadRef,
      p_actual_size_bytes: stored.ok ? stored.sizeBytes : null,
      p_detected_mime_type: stored.ok ? stored.detectedMimeType : null,
      p_server_sha256: stored.ok ? stored.serverSha256 : null,
      p_failure_code: stored.ok ? null : stored.failureCode,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_payload_sha256: payloadSha256,
      p_idempotency_expires_at: minutesFromNow(24 * 60),
      p_environment: meta.environment,
    }) as RpcResult;
    if (confirmed.error || !isObject(confirmed.data)) {
      return appErrorResponse(
        req,
        500,
        "Uploadcontrole is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (confirmed.data.ok !== true) return safeRpcFailure(req, confirmed.data);

    let parserObservation = null;
    if (stored.ok) {
      try {
        const profileKey = stringValue(
          confirmed.data,
          "parser_profile",
        ) as DocumentParserProfileKey;
        const profile = getDocumentParserProfile(profileKey);
        const candidateId = stringValue(confirmed.data, "candidate_id");
        const candidateRef = stringValue(confirmed.data, "candidate_ref");
        const source = {
          kind: "correction_replacement_candidate" as const,
          replacementCandidateId: candidateId,
          replacementCandidateRef: candidateRef,
          evidenceVersionRef: `correction_replacement_candidate:${candidateId}`,
        };
        const executionIdentitySha256 = await buildParserExecutionIdentity(
          deps.hashPayload,
          {
            source,
            byteSha256: stored.serverSha256,
            profile: profile.key,
            profileVersion: profile.version,
            provider: CURRENT_PDF_PARSER_ADAPTER,
          },
        );
        let observation = await findPersistedParserObservation(
          serviceClient as never,
          executionIdentitySha256,
        );
        if (!observation) {
          const parsed = await DOCUMENT_PARSER.parse(
            new Uint8Array(stored.bytes),
            profile.key,
            {
              provenanceAuthority: "trusted_server",
              observationRef: crypto.randomUUID(),
              source,
              byteSha256: stored.serverSha256,
              serverObservedAt: meta.timestamp,
            },
          );
          observation = await persistParserObservation(
            serviceClient as never,
            parsed,
          );
        }
        const returnedFactKeys = Array.isArray(confirmed.data.fact_keys)
          ? confirmed.data.fact_keys.filter((value): value is string =>
            typeof value === "string"
          )
          : [];
        const allowed = new Set(profile.expectedFactKeys);
        const exactFactKeys = returnedFactKeys.filter((value) =>
          allowed.has(value as DocumentFactKey)
        ) as DocumentFactKey[];
        if (observation && exactFactKeys.length === returnedFactKeys.length) {
          parserObservation = projectCustomerSafeReplacementObservation(
            observation,
            exactFactKeys,
          );
        }
      } catch (_error) {
        // A valid immutable candidate remains staged if the observational
        // parser or its persistence boundary is unavailable.
        parserObservation = null;
      }
    }

    return appJsonResponse(req, 200, {
      ok: true,
      uploadRef: normalized.value.uploadRef,
      candidateRef: stringValue(confirmed.data, "candidate_ref"),
      replacementTargetRef: stringValue(
        confirmed.data,
        "replacement_target_ref",
      ),
      status: "confirmed_staged",
      parserObservation,
      parserSuccessRequiredForFinalCustomerValue: false,
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
