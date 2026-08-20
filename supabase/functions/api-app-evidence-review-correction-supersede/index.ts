import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import { requireVerifiedSupabaseAuthUser } from "../_shared/app_customer_auth.ts";
import {
  configuredExpiry,
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import {
  CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS,
  type CustomerCorrectionResponseRequirement,
} from "../_shared/app_evidence_review_correction_handoff.ts";

const SUPERSEDE_RPC = "app_evidence_review_correction_supersede_v1";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const HANDOFF_REFERENCE_RE = /^CRH-[0-9A-F]{16}$/;
const ITEM_REFERENCE_RE = /^CCI-[A-F0-9]{32}$/;

export const CORRECTION_SUPERSESSION_REASONS = Object.freeze(
  [
    "NEW_EVIDENCE_REQUIRED",
    "REQUIREMENT_CORRECTION",
    "PROCESS_CORRECTION",
    "OTHER",
  ] as const,
);

export type CorrectionSupersessionReason =
  (typeof CORRECTION_SUPERSESSION_REASONS)[number];

type ItemRequirement = Readonly<{
  itemRef: string;
  responseRequirement: CustomerCorrectionResponseRequirement;
}>;

export type CorrectionSupersedeRequest = Readonly<{
  caseRef: string;
  predecessorHandoffRef: string;
  itemRequirements: readonly ItemRequirement[];
  reason: CorrectionSupersessionReason;
  explanation: string | null;
}>;

type RpcResult = { data?: unknown; error?: unknown };

export type CorrectionSupersedeHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  idempotencyExpiresAt: () => string | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: CorrectionSupersedeHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  idempotencyExpiresAt: configuredExpiry,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actual = Object.keys(value);
  return required.every((key) => actual.includes(key)) &&
    actual.every((key) => required.includes(key) || optional.includes(key));
}

export function normalizeCorrectionSupersedeRequest(
  value: unknown,
): CorrectionSupersedeRequest | null {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "caseRef",
      "itemRequirements",
      "predecessorHandoffRef",
      "reason",
    ], ["explanation"]) ||
    typeof value.caseRef !== "string" ||
    value.caseRef !== value.caseRef.trim() ||
    !CASE_REFERENCE_RE.test(value.caseRef) ||
    typeof value.predecessorHandoffRef !== "string" ||
    !HANDOFF_REFERENCE_RE.test(value.predecessorHandoffRef) ||
    !CORRECTION_SUPERSESSION_REASONS.includes(
      value.reason as CorrectionSupersessionReason,
    ) ||
    !Array.isArray(value.itemRequirements) ||
    value.itemRequirements.length < 1 || value.itemRequirements.length > 100
  ) return null;

  const reason = value.reason as CorrectionSupersessionReason;
  if (
    value.explanation !== undefined && value.explanation !== null &&
    typeof value.explanation !== "string"
  ) return null;
  const explanation = typeof value.explanation === "string"
    ? value.explanation
    : null;
  if (
    (reason === "OTHER" &&
      (typeof explanation !== "string" || explanation !== explanation.trim() ||
        explanation.length < 1 || explanation.length > 500)) ||
    (reason !== "OTHER" && explanation !== null)
  ) return null;

  const itemRequirements: ItemRequirement[] = [];
  for (const item of value.itemRequirements) {
    if (
      !isObject(item) ||
      !exactKeys(item, ["itemRef", "responseRequirement"]) ||
      typeof item.itemRef !== "string" ||
      !ITEM_REFERENCE_RE.test(item.itemRef) ||
      !CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS.includes(
        item.responseRequirement as CustomerCorrectionResponseRequirement,
      )
    ) return null;
    itemRequirements.push(Object.freeze({
      itemRef: item.itemRef,
      responseRequirement: item
        .responseRequirement as CustomerCorrectionResponseRequirement,
    }));
  }
  itemRequirements.sort((left, right) =>
    left.itemRef.localeCompare(right.itemRef)
  );
  if (
    new Set(itemRequirements.map((item) => item.itemRef)).size !==
      itemRequirements.length
  ) {
    return null;
  }

  return Object.freeze({
    caseRef: value.caseRef,
    predecessorHandoffRef: value.predecessorHandoffRef,
    itemRequirements: Object.freeze(itemRequirements),
    reason,
    explanation,
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
  if (["case_missing", "correction_handoff_missing"].includes(code)) return 404;
  if (code === "invalid_input") return 400;
  if (
    [
      "correction_handoff_answered",
      "correction_handoff_not_current",
      "correction_handoff_integrity_failed",
      "correction_item_set_mismatch",
      "idempotency_conflict",
      "concurrent_write_conflict",
    ].includes(code)
  ) return 409;
  return 500;
}

function safeFailure(req: Request, value: JsonObject): Response {
  const code = typeof value.code === "string" ? value.code : "internal_error";
  const status = safeStatus(code);
  return appErrorResponse(
    req,
    status,
    status === 400
      ? "Controleer de vervangende correctieopdracht."
      : status === 401
      ? "Authenticatie vereist."
      : status === 403 || status === 404
      ? "De correctieopdracht kan niet worden vervangen."
      : status === 409
      ? "De correctieopdracht is niet meer actueel."
      : "De correctieopdracht kan tijdelijk niet worden vervangen.",
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
  overrides: Partial<CorrectionSupersedeHandlerDependencies> = {},
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
      !metaResult.idempotency_key || metaResult.idempotency_key.length > 200 ||
      /\s/.test(metaResult.idempotency_key) ||
      metaResult.request_id.length > 128
    ) {
      return appErrorResponse(
        req,
        400,
        "Controleer de vervangende correctieopdracht.",
        "invalid_input",
      );
    }
    const serviceClient = deps.createServiceClient();
    const expiresAt = deps.idempotencyExpiresAt();
    if (!serviceClient || !expiresAt) {
      return appErrorResponse(
        req,
        503,
        "De correctieopdracht kan tijdelijk niet worden vervangen.",
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
    const input = normalizeCorrectionSupersedeRequest(await parseBody(req));
    if (!input) {
      return appErrorResponse(
        req,
        400,
        "Controleer de vervangende correctieopdracht.",
        "invalid_input",
      );
    }
    const canonicalHash = await deps.hashPayload({
      contract_version: "evidence-review-correction-supersede-v1",
      caller: "api-app-evidence-review-correction-supersede",
      auth_user_id: verified.context.authUserId,
      case_ref: input.caseRef,
      predecessor_handoff_ref: input.predecessorHandoffRef,
      item_requirements: input.itemRequirements.map((item) => ({
        item_ref: item.itemRef,
        response_requirement: item.responseRequirement,
      })),
      reason: input.reason,
      explanation: input.explanation,
    });
    const result = await serviceClient.rpc(SUPERSEDE_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: input.caseRef,
      p_predecessor_handoff_ref: input.predecessorHandoffRef,
      p_item_requirements: input.itemRequirements.map((item) => ({
        item_ref: item.itemRef,
        response_requirement: item.responseRequirement,
      })),
      p_reason: input.reason,
      p_explanation: input.explanation,
      p_request_id: metaResult.request_id,
      p_idempotency_key: metaResult.idempotency_key,
      p_payload_sha256: canonicalHash,
      p_idempotency_expires_at: expiresAt,
    }) as RpcResult;
    if (result.error || !isObject(result.data)) {
      return appErrorResponse(
        req,
        500,
        "De correctieopdracht kan tijdelijk niet worden vervangen.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) return safeFailure(req, result.data);

    const predecessorRef = result.data.predecessor_handoff_ref;
    const successorRef = result.data.successor_handoff_ref;
    const publishedAt = normalizedTimestamp(result.data.published_at);
    if (
      result.data.code !== "superseded" ||
      predecessorRef !== input.predecessorHandoffRef ||
      typeof successorRef !== "string" ||
      !HANDOFF_REFERENCE_RE.test(successorRef) ||
      successorRef === predecessorRef || !publishedAt
    ) {
      return appErrorResponse(
        req,
        500,
        "De correctieopdracht kan tijdelijk niet worden vervangen.",
        "internal_error",
      );
    }
    return appJsonResponse(req, 201, {
      schemaVersion: "evidence-review-correction-supersede-v1",
      result: "SUPERSEDED",
      caseRef: input.caseRef,
      predecessorHandoffRef: predecessorRef,
      successorHandoffRef: successorRef,
      publishedAt,
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
