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
  EVIDENCE_FACT_REVIEW_MANIFEST_VERSION,
} from "../_shared/app_evidence_review_case_detail.ts";

const FINALIZE_RPC = "app_evidence_review_round_finalize_v1";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const SUBJECT_REF_RE = /^FRS-[0-9a-f]{64}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const DISPOSITIONS = new Set(["ACCEPTED", "CORRECTION_REQUIRED"] as const);
const FACT_CORRECTION_REASONS = new Set([
  "MISSING_INFORMATION",
  "INCORRECT_INFORMATION",
  "INCONSISTENT_INFORMATION",
  "OTHER",
] as const);
const BODY_KEYS = [
  "caseRef",
  "decisions",
  "manifestHash",
  "manifestVersion",
] as const;

export type EvidenceFactReviewDisposition =
  | "ACCEPTED"
  | "CORRECTION_REQUIRED";
export type EvidenceFactReviewCorrectionReason =
  | "MISSING_INFORMATION"
  | "INCORRECT_INFORMATION"
  | "INCONSISTENT_INFORMATION"
  | "OTHER";
export type EvidenceFactReviewRoundDecision =
  | Readonly<{ subjectRef: string; disposition: "ACCEPTED" }>
  | Readonly<{
    subjectRef: string;
    disposition: "CORRECTION_REQUIRED";
    correctionReason: EvidenceFactReviewCorrectionReason;
    correctionInstruction: string;
  }>;
export type EvidenceFactReviewRoundFinalizeRequest = Readonly<{
  caseRef: string;
  manifestVersion: typeof EVIDENCE_FACT_REVIEW_MANIFEST_VERSION;
  manifestHash: string;
  decisions: readonly EvidenceFactReviewRoundDecision[];
}>;

type RpcResult = { data?: unknown; error?: unknown };

export type EvidenceFactReviewRoundHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  idempotencyExpiresAt: () => string | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: EvidenceFactReviewRoundHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  idempotencyExpiresAt: configuredExpiry,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort().join("|");
  return actual === [...keys].sort().join("|");
}

function normalizeDecision(value: unknown): EvidenceFactReviewRoundDecision | null {
  if (!isRecord(value)) return null;
  const subjectRef = typeof value.subjectRef === "string"
    ? value.subjectRef.trim()
    : "";
  const disposition = value.disposition as EvidenceFactReviewDisposition;
  if (!SUBJECT_REF_RE.test(subjectRef) || !DISPOSITIONS.has(disposition)) {
    return null;
  }
  if (disposition === "ACCEPTED") {
    if (!hasExactKeys(value, ["subjectRef", "disposition"])) return null;
    return Object.freeze({ subjectRef, disposition });
  }
  if (
    !hasExactKeys(value, [
      "subjectRef",
      "disposition",
      "correctionReason",
      "correctionInstruction",
    ]) || typeof value.correctionReason !== "string" ||
    !FACT_CORRECTION_REASONS.has(
      value.correctionReason as EvidenceFactReviewCorrectionReason,
    )
  ) return null;
  const correctionInstruction = boundedString(value.correctionInstruction, 1_000);
  if (!correctionInstruction || !/[\p{L}\p{N}]/u.test(correctionInstruction)) {
    return null;
  }
  return Object.freeze({
    subjectRef,
    disposition,
    correctionReason:
      value.correctionReason as EvidenceFactReviewCorrectionReason,
    correctionInstruction,
  });
}

export function normalizeEvidenceFactReviewRoundRequest(
  body: unknown,
): EvidenceFactReviewRoundFinalizeRequest | null {
  if (!isRecord(body) || !hasExactKeys(body, BODY_KEYS)) return null;
  if (
    typeof body.caseRef !== "string" || body.caseRef !== body.caseRef.trim() ||
    !CASE_REFERENCE_RE.test(body.caseRef) ||
    body.manifestVersion !== EVIDENCE_FACT_REVIEW_MANIFEST_VERSION ||
    typeof body.manifestHash !== "string" || !HASH_RE.test(body.manifestHash) ||
    !Array.isArray(body.decisions) || body.decisions.length === 0 ||
    body.decisions.length > 100
  ) return null;
  const decisions = body.decisions.map(normalizeDecision);
  if (decisions.some((decision) => !decision)) return null;
  const normalized = decisions as EvidenceFactReviewRoundDecision[];
  if (new Set(normalized.map((decision) => decision.subjectRef)).size !==
    normalized.length) return null;
  normalized.sort((left, right) => left.subjectRef.localeCompare(right.subjectRef));
  return Object.freeze({
    caseRef: body.caseRef,
    manifestVersion: EVIDENCE_FACT_REVIEW_MANIFEST_VERSION,
    manifestHash: body.manifestHash,
    decisions: Object.freeze(normalized),
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
    code === "authenticated_actor_not_verified" ||
    code === "workforce_identity_missing" ||
    code === "workforce_identity_inactive" ||
    code === "seniority_not_authorized" ||
    code === "capability_not_authorized" ||
    code === "case_scope_denied" ||
    code === "authorization_changed"
  ) return 403;
  if (code === "case_missing") return 404;
  if (
    code === "stale_review_manifest" ||
    code === "manifest_subjects_mismatch" ||
    code === "review_round_conflict" ||
    code === "concurrent_write_conflict" ||
    code === "idempotency_conflict" ||
    code === "case_not_reviewable" ||
    code === "review_manifest_unavailable"
  ) return 409;
  if (
    code === "invalid_input" || code === "invalid_decisions" ||
    code === "duplicate_subject"
  ) return 400;
  return 500;
}

function safeFailure(req: Request, data: JsonObject): Response {
  const code = typeof data.code === "string" ? data.code : "internal_error";
  const status = safeStatus(code);
  const message = status === 400
    ? "Controleer de beoordelingsronde."
    : status === 401
    ? "Authenticatie vereist."
    : status === 403 || status === 404
    ? "De beoordelingsronde is niet toegestaan."
    : status === 409
    ? "Het dossier is gewijzigd. Vernieuw de beoordeling."
    : "De beoordelingsronde is tijdelijk niet beschikbaar.";
  return appErrorResponse(
    req,
    status,
    message,
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
  overrides: Partial<EvidenceFactReviewRoundHandlerDependencies> = {},
): (req: Request) => Promise<Response> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return appOptionsResponse(req);
    if (req.method !== "POST") {
      return appErrorResponse(req, 405, "Methode niet toegestaan.", "invalid_input");
    }

    const metaResult = await deps.requestMeta(req);
    if (metaResult instanceof Response) return metaResult;
    if (
      !metaResult.idempotency_key || metaResult.idempotency_key.length > 200 ||
      /\s/.test(metaResult.idempotency_key) || metaResult.request_id.length > 128
    ) {
      return appErrorResponse(
        req,
        400,
        "Controleer de beoordelingsronde.",
        "invalid_input",
      );
    }

    const serviceClient = deps.createServiceClient();
    const expiresAt = deps.idempotencyExpiresAt();
    if (!serviceClient || !expiresAt) {
      return appErrorResponse(
        req,
        503,
        "De beoordelingsronde is tijdelijk niet beschikbaar.",
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

    const request = normalizeEvidenceFactReviewRoundRequest(await parseBody(req));
    if (!request) {
      return appErrorResponse(
        req,
        400,
        "Controleer de beoordelingsronde.",
        "invalid_input",
      );
    }
    const canonicalHash = await deps.hashPayload({
      contract_version: "evidence-fact-review-round-finalization-v1",
      caller: "api-app-evidence-review-round-finalize",
      auth_user_id: verified.context.authUserId,
      case_ref: request.caseRef,
      manifest_version: request.manifestVersion,
      manifest_hash: request.manifestHash,
      decisions: request.decisions.map((decision) => ({
        subject_ref: decision.subjectRef,
        disposition: decision.disposition,
        correction_reason: decision.disposition === "CORRECTION_REQUIRED"
          ? decision.correctionReason
          : null,
        correction_instruction: decision.disposition === "CORRECTION_REQUIRED"
          ? decision.correctionInstruction
          : null,
      })),
    });

    const result = await serviceClient.rpc(FINALIZE_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: request.caseRef,
      p_manifest_version: request.manifestVersion,
      p_manifest_hash: request.manifestHash,
      p_decisions: request.decisions,
      p_request_id: metaResult.request_id,
      p_idempotency_key: metaResult.idempotency_key,
      p_payload_sha256: canonicalHash,
      p_idempotency_expires_at: expiresAt,
    }) as RpcResult;
    if (result.error || !isRecord(result.data)) {
      return appErrorResponse(
        req,
        500,
        "De beoordelingsronde is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) return safeFailure(req, result.data);

    const resultCode = result.data.code;
    const roundRef = typeof result.data.round_id === "string"
      ? result.data.round_id
      : "";
    const finalizedAt = normalizedTimestamp(result.data.finalized_at);
    if (
      !["finalized", "already_finalized"].includes(String(resultCode)) ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(roundRef) || !finalizedAt ||
      result.data.manifest_version !== request.manifestVersion ||
      result.data.manifest_hash !== request.manifestHash ||
      !["ALL_FACTS_ACCEPTED", "CORRECTIONS_REQUIRED"].includes(
        String(result.data.outcome),
      )
    ) {
      return appErrorResponse(
        req,
        500,
        "De beoordelingsronde is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }

    return appJsonResponse(req, resultCode === "finalized" ? 201 : 200, {
      schemaVersion: "evidence-fact-review-round-finalization-v1",
      caseRef: request.caseRef,
      roundRef,
      manifestVersion: request.manifestVersion,
      manifestHash: request.manifestHash,
      outcome: result.data.outcome,
      finalizedAt,
      result: resultCode === "finalized" ? "FINALIZED" : "ALREADY_FINALIZED",
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
