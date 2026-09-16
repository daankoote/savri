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
  configuredExpiry,
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import {
  isCorrectionCoverMessage,
} from "../_shared/app_evidence_review_correction_handoff.ts";

const PUBLISH_RPC = "app_evidence_review_correction_publish_v2";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HANDOFF_REFERENCE_RE = /^CRH-[0-9A-F]{16}$/;

type RpcResult = { data?: unknown; error?: unknown };
type PublishRequest = Readonly<{
  caseRef: string;
  coverMessage: string;
  roundRef: string;
}>;

export type EvidenceReviewCorrectionPublishHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  idempotencyExpiresAt: () => string | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: EvidenceReviewCorrectionPublishHandlerDependencies =
  {
    createServiceClient: defaultServiceClient,
    idempotencyExpiresAt: configuredExpiry,
    requestMeta: getAppRequestMeta,
    hashPayload: payloadHash,
    verifyBearer: requireVerifiedSupabaseAuthUser,
  };

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isInformationRequestConflict(value: unknown): boolean {
  return isObject(value) && value.code === "23514" &&
    value.message === "customer_information_request_active";
}

export function normalizeCorrectionPublishRequest(
  value: unknown,
): PublishRequest | null {
  if (
    !isObject(value) ||
    Object.keys(value).sort().join("|") !==
      "caseRef|coverMessage|roundRef" ||
    typeof value.caseRef !== "string" ||
    value.caseRef !== value.caseRef.trim() ||
    !CASE_REFERENCE_RE.test(value.caseRef) ||
    typeof value.roundRef !== "string" || !UUID_RE.test(value.roundRef) ||
    !isCorrectionCoverMessage(value.coverMessage)
  ) return null;
  return Object.freeze({
    caseRef: value.caseRef,
    coverMessage: value.coverMessage,
    roundRef: value.roundRef,
  });
}

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (_error) {
    return null;
  }
}

function safeStatus(code: string): number {
  if (code === "authentication_required") return 401;
  if (
    [
      "authenticated_actor_not_verified",
      "workforce_identity_missing",
      "workforce_identity_inactive",
      "seniority_not_authorized",
      "capability_not_authorized",
      "case_scope_denied",
      "authorization_changed",
    ].includes(code)
  ) return 403;
  if (["case_missing", "review_round_missing"].includes(code)) return 404;
  if (
    [
      "stale_review_round",
      "correction_handoff_not_eligible",
      "customer_context_unavailable",
      "correction_bundle_unavailable",
      "correction_handoff_conflict",
      "concurrent_write_conflict",
      "idempotency_conflict",
      "case_not_reviewable",
      "review_manifest_unavailable",
      "information_request_active",
    ].includes(code)
  ) return 409;
  if (code === "invalid_input") return 400;
  return 500;
}

function safeFailure(req: Request, value: JsonObject): Response {
  const code = typeof value.code === "string" ? value.code : "internal_error";
  const status = safeStatus(code);
  return appErrorResponse(
    req,
    status,
    status === 400
      ? "Controleer de publicatieaanvraag."
      : status === 401
      ? "Authenticatie vereist."
      : status === 403 || status === 404
      ? "De correctiepublicatie is niet toegestaan."
      : code === "information_request_active"
      ? "Er staat een vraag aan de klant open. Rond deze af of trek deze in voordat u correcties verstuurt."
      : status === 409
      ? "De correctiepublicatie is niet beschikbaar voor deze beoordelingsronde."
      : "De correctiepublicatie is tijdelijk niet beschikbaar.",
    status === 500 ? "internal_error" : code,
  );
}

function normalizedTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" || value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value)
  ) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function createHandler(
  overrides: Partial<EvidenceReviewCorrectionPublishHandlerDependencies> = {},
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
    if (
      !metaResult.idempotency_key ||
      metaResult.idempotency_key.length > 200 ||
      /\s/.test(metaResult.idempotency_key) ||
      metaResult.request_id.length > 128
    ) {
      return appErrorResponse(
        req,
        400,
        "Controleer de publicatieaanvraag.",
        "invalid_input",
      );
    }
    const serviceClient = deps.createServiceClient();
    const expiresAt = deps.idempotencyExpiresAt();
    if (!serviceClient || !expiresAt) {
      return appErrorResponse(
        req,
        503,
        "De correctiepublicatie is tijdelijk niet beschikbaar.",
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
    const request = normalizeCorrectionPublishRequest(await parseBody(req));
    if (!request) {
      return appErrorResponse(
        req,
        400,
        "Controleer de publicatieaanvraag.",
        "invalid_input",
      );
    }
    const canonicalHash = await deps.hashPayload({
      contract_version: "evidence-review-correction-publish-v2",
      caller: "api-app-evidence-review-correction-publish",
      auth_user_id: verified.context.authUserId,
      case_ref: request.caseRef,
      cover_message: request.coverMessage,
      round_ref: request.roundRef,
    });
    const result = await serviceClient.rpc(PUBLISH_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: request.caseRef,
      p_round_id: request.roundRef,
      p_cover_message: request.coverMessage,
      p_request_id: metaResult.request_id,
      p_idempotency_key: metaResult.idempotency_key,
      p_payload_sha256: canonicalHash,
      p_idempotency_expires_at: expiresAt,
    }) as RpcResult;
    if (isInformationRequestConflict(result.error)) {
      return safeFailure(req, { code: "information_request_active" });
    }
    if (result.error || !isObject(result.data)) {
      return appErrorResponse(
        req,
        500,
        "De correctiepublicatie is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) return safeFailure(req, result.data);
    const code = result.data.code;
    const roundRef = result.data.round_id;
    const handoffRef = result.data.handoff_ref;
    const publishedAt = normalizedTimestamp(result.data.published_at);
    if (
      !["published", "already_published"].includes(String(code)) ||
      typeof roundRef !== "string" || !UUID_RE.test(roundRef) ||
      roundRef !== request.roundRef ||
      typeof handoffRef !== "string" ||
      !HANDOFF_REFERENCE_RE.test(handoffRef) || !publishedAt
    ) {
      return appErrorResponse(
        req,
        500,
        "De correctiepublicatie is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    return appJsonResponse(req, code === "published" ? 201 : 200, {
      schemaVersion: "evidence-review-correction-publish-v2",
      result: code === "published" ? "PUBLISHED" : "ALREADY_PUBLISHED",
      caseRef: request.caseRef,
      roundRef,
      handoffRef,
      publishedAt,
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
