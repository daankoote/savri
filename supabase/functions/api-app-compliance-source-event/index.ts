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
  boundedSha256,
  boundedString,
  boundedTimestamp,
  boundedUuid,
  configuredExpiry,
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";

const CAPTURE_RPC = "app_compliance_source_event_capture_v1";
const EVENT_KINDS = new Set([
  "INBOOKING_COMPLETED",
  "VERIFICATION_STATEMENT_POSSESSED",
  "FINDINGS_REPORT_RECEIVED",
  "STATEMENT_SUBMITTED_TO_NEA",
  "VERIFICATION_RESULT_REGISTERED_IN_REV",
]);
const BODY_KEYS = Object.freeze([
  "deliveryYear",
  "eventKind",
  "occurredAt",
  "evidenceSha256",
  "evidenceVersionId",
  "evidenceVersionNumber",
  "externalReference",
  "verificationResultReference",
  "statementReference",
  "findingsReportReference",
]);
const REFERENCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/;

type RpcResult = { data?: unknown; error?: unknown };

export type CaptureHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  idempotencyExpiresAt: () => string | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: CaptureHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  idempotencyExpiresAt: configuredExpiry,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function parseBody(req: Request): Promise<JsonObject | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch (_error) {
    return null;
  }
}

function nullableReference(value: unknown): string | null | "invalid" {
  if (value === null) return null;
  const normalized = boundedString(value, 128, true);
  return normalized && REFERENCE_PATTERN.test(normalized)
    ? normalized
    : "invalid";
}

export function normalizeComplianceCaptureRequest(
  body: JsonObject,
): JsonObject | null {
  if (
    Object.keys(body).length !== BODY_KEYS.length ||
    Object.keys(body).some((key) => !BODY_KEYS.includes(key))
  ) return null;

  const deliveryYear = Number(body.deliveryYear);
  const eventKind = boundedString(body.eventKind, 64);
  const occurredAt = boundedTimestamp(body.occurredAt);
  const evidenceSha256 = boundedSha256(body.evidenceSha256);
  const evidenceVersionId = body.evidenceVersionId === null
    ? null
    : boundedUuid(body.evidenceVersionId);
  const evidenceVersionNumber = body.evidenceVersionNumber === null
    ? null
    : Number(body.evidenceVersionNumber);
  const externalReference = nullableReference(body.externalReference);
  const verificationResultReference = nullableReference(
    body.verificationResultReference,
  );
  const statementReference = nullableReference(body.statementReference);
  const findingsReportReference = nullableReference(
    body.findingsReportReference,
  );

  if (
    !Number.isInteger(deliveryYear) || deliveryYear < 2000 ||
    deliveryYear > 9999 || !eventKind || !EVENT_KINDS.has(eventKind) ||
    !occurredAt || !evidenceSha256 ||
    (body.evidenceVersionId !== null && !evidenceVersionId) ||
    (evidenceVersionNumber !== null &&
      (!Number.isInteger(evidenceVersionNumber) ||
        evidenceVersionNumber < 1)) ||
    (evidenceVersionId === null) !== (evidenceVersionNumber === null) ||
    externalReference === "invalid" ||
    verificationResultReference === "invalid" ||
    statementReference === "invalid" ||
    findingsReportReference === "invalid"
  ) return null;

  const artifactEvent = eventKind === "VERIFICATION_STATEMENT_POSSESSED" ||
    eventKind === "FINDINGS_REPORT_RECEIVED";
  if (
    (artifactEvent && (!evidenceVersionId || externalReference !== null)) ||
    (!artifactEvent &&
      (evidenceVersionId !== null || externalReference === null))
  ) return null;

  if (
    (eventKind === "INBOOKING_COMPLETED" &&
      (verificationResultReference !== null || statementReference !== null ||
        findingsReportReference !== null)) ||
    (eventKind === "VERIFICATION_STATEMENT_POSSESSED" &&
      (verificationResultReference === null || statementReference === null ||
        findingsReportReference !== null)) ||
    (eventKind === "FINDINGS_REPORT_RECEIVED" &&
      (verificationResultReference === null || statementReference !== null ||
        findingsReportReference === null)) ||
    (eventKind === "STATEMENT_SUBMITTED_TO_NEA" &&
      (verificationResultReference !== null || statementReference === null ||
        findingsReportReference !== null)) ||
    (eventKind === "VERIFICATION_RESULT_REGISTERED_IN_REV" &&
      (verificationResultReference === null || statementReference !== null ||
        findingsReportReference !== null))
  ) return null;

  return {
    delivery_year: deliveryYear,
    event_kind: eventKind,
    occurred_at: occurredAt,
    evidence_sha256: evidenceSha256,
    evidence_version_id: evidenceVersionId,
    evidence_version_number: evidenceVersionNumber,
    external_reference: externalReference,
    verification_result_reference: verificationResultReference,
    statement_reference: statementReference,
    findings_report_reference: findingsReportReference,
  };
}

function safeErrorStatus(code: string): number {
  if (code === "authentication_required") return 401;
  if (
    code === "authenticated_actor_not_verified" ||
    code === "workforce_identity_missing" ||
    code === "workforce_identity_inactive" ||
    code === "seniority_not_authorized" ||
    code === "capability_not_authorized" ||
    code === "tenant_scope_denied" ||
    code === "authorization_changed"
  ) return 403;
  if (code === "invalid_input") return 400;
  if (code === "provenance_rejected" || code === "evidence_mismatch") {
    return 422;
  }
  if (
    code === "idempotency_conflict" ||
    code === "concurrent_write_conflict" ||
    code === "compliance_fact_conflict"
  ) return 409;
  return 500;
}

function safeErrorMessage(code: string): string {
  if (code === "authentication_required") return "Authenticatie vereist.";
  if (code === "invalid_input") return "Controleer de aanvraag.";
  if (code === "provenance_rejected" || code === "evidence_mismatch") {
    return "De bronvastlegging kon niet worden geaccepteerd.";
  }
  if (safeErrorStatus(code) === 403) {
    return "De bronvastlegging is niet toegestaan.";
  }
  if (safeErrorStatus(code) === 409) {
    return "De bronvastlegging conflicteert met bestaande gegevens.";
  }
  return "De bronvastlegging is tijdelijk niet beschikbaar.";
}

function safeSuccess(data: JsonObject): JsonObject | null {
  const sourceEventId = boundedUuid(data.source_event_id);
  const deliveryYear = Number(data.delivery_year);
  const eventKind = boundedString(data.event_kind, 64);
  const occurredAt = boundedTimestamp(data.occurred_at);
  const recordedAt = boundedTimestamp(data.recorded_at);
  if (
    data.ok !== true || data.code !== "ok" || !sourceEventId ||
    !Number.isInteger(deliveryYear) || !eventKind ||
    !EVENT_KINDS.has(eventKind) || !occurredAt || !recordedAt ||
    data.idempotency_status !== "recorded"
  ) return null;
  return {
    ok: true,
    sourceEventId,
    deliveryYear,
    eventKind,
    occurredAt,
    recordedAt,
    idempotencyStatus: "recorded",
  };
}

export function createHandler(
  overrides: Partial<CaptureHandlerDependencies> = {},
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

    const metaResult = await deps.requestMeta(req);
    if (metaResult instanceof Response) return metaResult;
    const meta = metaResult;
    if (
      !meta.idempotency_key || meta.idempotency_key.length > 200 ||
      /\s/.test(meta.idempotency_key) || meta.request_id.length > 96
    ) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        "invalid_input",
      );
    }

    const serviceClient = deps.createServiceClient();
    const expiresAt = deps.idempotencyExpiresAt();
    if (!serviceClient || !expiresAt) {
      return appErrorResponse(
        req,
        503,
        "De bronvastlegging is tijdelijk niet beschikbaar.",
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

    const body = await parseBody(req);
    const payload = body ? normalizeComplianceCaptureRequest(body) : null;
    if (!payload) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        "invalid_input",
      );
    }
    const canonicalHash = await deps.hashPayload({
      contract_version: "reg03h_compliance_source_event_capture_v1",
      caller: "api-app-compliance-source-event",
      auth_user_id: verified.context.authUserId,
      payload,
    });
    const { data, error } = await serviceClient.rpc(CAPTURE_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_payload_hash: canonicalHash,
      p_idempotency_expires_at: expiresAt,
      p_payload: payload,
    }) as RpcResult;
    if (error || !isRecord(data)) {
      return appErrorResponse(
        req,
        500,
        "De bronvastlegging is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (data.ok !== true) {
      const code = typeof data.code === "string" ? data.code : "internal_error";
      return appErrorResponse(
        req,
        safeErrorStatus(code),
        safeErrorMessage(code),
        safeErrorStatus(code) === 500 ? "internal_error" : code,
      );
    }
    const success = safeSuccess(data);
    if (!success) {
      return appErrorResponse(
        req,
        500,
        "De bronvastlegging is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    return appJsonResponse(req, 201, success);
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
