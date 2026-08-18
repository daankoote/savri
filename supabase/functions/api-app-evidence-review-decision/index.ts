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
  boundedString,
  configuredExpiry,
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import {
  EVIDENCE_REVIEW_CORRECTION_INSTRUCTION_MAX_LENGTH,
  EVIDENCE_REVIEW_CORRECTION_REASONS,
  type EvidenceReviewCorrectionReason,
  parseEvidenceReviewCaseDetailSource,
} from "../_shared/app_evidence_review_case_detail.ts";

const DETAIL_RPC = "app_evidence_review_case_detail_read_v3";
const DECIDE_RPC = "app_evidence_review_decide_v2";
const STATE_RPC = "app_evidence_review_state_v1";
const BODY_KEYS = Object.freeze([
  "caseRef",
  "correctionInstruction",
  "correctionReason",
  "decision",
  "evidenceVersionRef",
]);
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECISIONS = new Set(["ACCEPTED", "CORRECTION_REQUIRED"] as const);
const CORRECTION_REASONS = new Set(EVIDENCE_REVIEW_CORRECTION_REASONS);
export const CORRECTION_INSTRUCTION_MAX_LENGTH =
  EVIDENCE_REVIEW_CORRECTION_INSTRUCTION_MAX_LENGTH;

type ReviewDecision = "ACCEPTED" | "CORRECTION_REQUIRED";
type RpcResult = { data?: unknown; error?: unknown };

export type EvidenceReviewDecisionHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  idempotencyExpiresAt: () => string | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: EvidenceReviewDecisionHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  idempotencyExpiresAt: configuredExpiry,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" || value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(
        value,
      )
  ) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

async function parseBody(req: Request): Promise<JsonObject | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch (_error) {
    return null;
  }
}

export function normalizeEvidenceReviewDecisionRequest(
  body: JsonObject,
):
  | Readonly<{
    caseRef: string;
    evidenceVersionRef: string;
    decision: ReviewDecision;
    correctionReason?: EvidenceReviewCorrectionReason;
    correctionInstruction?: string;
  }>
  | null {
  if (Object.keys(body).some((key) => !BODY_KEYS.includes(key))) return null;
  if (
    typeof body.caseRef !== "string" || body.caseRef !== body.caseRef.trim() ||
    !CASE_REFERENCE_RE.test(body.caseRef) ||
    typeof body.evidenceVersionRef !== "string" ||
    body.evidenceVersionRef !== body.evidenceVersionRef.trim() ||
    !UUID_RE.test(body.evidenceVersionRef) ||
    typeof body.decision !== "string" ||
    !DECISIONS.has(body.decision as ReviewDecision)
  ) return null;
  const decision = body.decision as ReviewDecision;
  const baseKeys = ["caseRef", "decision", "evidenceVersionRef"];
  if (decision === "ACCEPTED") {
    if (
      Object.keys(body).length !== baseKeys.length ||
      "correctionReason" in body || "correctionInstruction" in body
    ) return null;
    return Object.freeze({
      caseRef: body.caseRef,
      evidenceVersionRef: body.evidenceVersionRef,
      decision,
    });
  }
  if (
    Object.keys(body).length !== BODY_KEYS.length ||
    typeof body.correctionReason !== "string" ||
    !CORRECTION_REASONS.has(
      body.correctionReason as EvidenceReviewCorrectionReason,
    )
  ) return null;
  const correctionInstruction = boundedString(
    body.correctionInstruction,
    CORRECTION_INSTRUCTION_MAX_LENGTH,
  );
  if (!correctionInstruction || !/[\p{L}\p{N}]/u.test(correctionInstruction)) {
    return null;
  }
  return Object.freeze({
    caseRef: body.caseRef,
    evidenceVersionRef: body.evidenceVersionRef,
    decision,
    correctionReason: body.correctionReason as EvidenceReviewCorrectionReason,
    correctionInstruction,
  });
}

function safeErrorStatus(code: string): number {
  if (code === "authentication_required") return 401;
  if (
    code === "authenticated_actor_not_verified" ||
    code === "workforce_identity_missing" ||
    code === "workforce_identity_inactive" ||
    code === "seniority_not_authorized" ||
    code === "capability_not_authorized" ||
    code === "case_scope_denied" ||
    code === "authorization_changed"
  ) return 403;
  if (code === "invalid_input") return 400;
  if (code === "evidence_version_missing") return 404;
  if (
    code === "idempotency_conflict" ||
    code === "concurrent_write_conflict" ||
    code === "evidence_already_decided"
  ) return 409;
  return 500;
}

function safeErrorMessage(code: string): string {
  const status = safeErrorStatus(code);
  if (status === 401) return "Authenticatie vereist.";
  if (status === 400) return "Controleer de aanvraag.";
  if (status === 403 || status === 404) {
    return "De evidencebeslissing is niet toegestaan.";
  }
  if (status === 409) {
    return "De evidencebeslissing conflicteert met bestaande gegevens.";
  }
  return "De evidencebeslissing is tijdelijk niet beschikbaar.";
}

function safeFailure(req: Request, data: JsonObject): Response {
  const code = typeof data.code === "string" ? data.code : "internal_error";
  const status = safeErrorStatus(code);
  return appErrorResponse(
    req,
    status,
    safeErrorMessage(code),
    status === 500 ? "internal_error" : code,
  );
}

export function createHandler(
  overrides: Partial<EvidenceReviewDecisionHandlerDependencies> = {},
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
        "De evidencebeslissing is tijdelijk niet beschikbaar.",
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
    const request = body ? normalizeEvidenceReviewDecisionRequest(body) : null;
    if (!request) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        "invalid_input",
      );
    }

    const detailResult = await serviceClient.rpc(DETAIL_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: request.caseRef,
    }) as RpcResult;
    if (detailResult.error || !isRecord(detailResult.data)) {
      return appErrorResponse(
        req,
        500,
        "De evidencebeslissing is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (detailResult.data.ok !== true) {
      return safeFailure(req, detailResult.data);
    }
    const detail = parseEvidenceReviewCaseDetailSource(detailResult.data);
    const selectedEvidence = detail?.evidence.find((item) =>
      item.evidenceVersionRef === request.evidenceVersionRef
    );
    if (
      !detail || detail.case.caseRef !== request.caseRef || !selectedEvidence
    ) {
      return appErrorResponse(
        req,
        404,
        "De evidencebeslissing is niet toegestaan.",
        "evidence_version_missing",
      );
    }

    const canonicalHash = await deps.hashPayload({
      contract_version: "review12_evidence_review_decision_v2",
      caller: "api-app-evidence-review-decision",
      auth_user_id: verified.context.authUserId,
      case_ref: request.caseRef,
      evidence_version_ref: request.evidenceVersionRef,
      decision: request.decision,
      correction_reason: request.correctionReason ?? null,
      correction_instruction: request.correctionInstruction ?? null,
    });
    const decisionResult = await serviceClient.rpc(DECIDE_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_evidence_version_id: request.evidenceVersionRef,
      p_decision: request.decision,
      p_correction_reason: request.correctionReason ?? null,
      p_correction_instruction: request.correctionInstruction ?? null,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_payload_sha256: canonicalHash,
      p_idempotency_expires_at: expiresAt,
    }) as RpcResult;
    if (decisionResult.error || !isRecord(decisionResult.data)) {
      return appErrorResponse(
        req,
        500,
        "De evidencebeslissing is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (decisionResult.data.ok !== true) {
      return safeFailure(req, decisionResult.data);
    }
    if (
      decisionResult.data.evidence_version_id !== request.evidenceVersionRef ||
      decisionResult.data.review_state !== request.decision ||
      decisionResult.data.correction_reason !==
        (request.correctionReason ?? null) ||
      decisionResult.data.correction_instruction !==
        (request.correctionInstruction ?? null)
    ) {
      return appErrorResponse(
        req,
        500,
        "De evidencebeslissing is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }

    const stateResult = await serviceClient.rpc(STATE_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_evidence_version_id: request.evidenceVersionRef,
    }) as RpcResult;
    if (stateResult.error || !isRecord(stateResult.data)) {
      return appErrorResponse(
        req,
        500,
        "De evidencebeslissing is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (stateResult.data.ok !== true) return safeFailure(req, stateResult.data);
    const decisionAt = normalizedTimestamp(stateResult.data.decided_at);
    if (
      stateResult.data.evidence_version_id !== request.evidenceVersionRef ||
      stateResult.data.review_state !== request.decision ||
      !decisionAt
    ) {
      return appErrorResponse(
        req,
        500,
        "De evidencebeslissing is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }

    const outcome = selectedEvidence.reviewStatus === request.decision
      ? "ALREADY_RECORDED"
      : "RECORDED";
    return appJsonResponse(req, 201, {
      schemaVersion: "evidence-review-decision-v2",
      caseRef: request.caseRef,
      evidenceVersionRef: request.evidenceVersionRef,
      decision: request.decision,
      decisionAt,
      outcome,
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
