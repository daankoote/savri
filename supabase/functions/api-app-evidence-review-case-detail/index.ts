import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
} from "../_shared/app_foundation.ts";
import {
  requireVerifiedSupabaseAuthUser,
} from "../_shared/app_customer_auth.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import {
  parseEvidenceReviewCaseDetailSource,
} from "../_shared/app_evidence_review_case_detail.ts";

const READ_RPC = "app_evidence_review_case_detail_read_v2";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

type RpcResult = { data?: unknown; error?: unknown };

export type EvidenceReviewCaseDetailHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: EvidenceReviewCaseDetailHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function authorizationStatus(code: string): number {
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
  return 500;
}

function exactCaseReference(req: Request): string | null {
  const params = new URL(req.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== "caseRef") ||
    params.getAll("caseRef").length !== 1
  ) return null;
  const value = params.get("caseRef") ?? "";
  return value === value.trim() && CASE_REFERENCE_RE.test(value) ? value : null;
}

export function createHandler(
  overrides: Partial<EvidenceReviewCaseDetailHandlerDependencies> = {},
): (req: Request) => Promise<Response> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return appOptionsResponse(req);
    if (req.method !== "GET") {
      return appErrorResponse(
        req,
        405,
        "Methode niet toegestaan.",
        "invalid_input",
      );
    }

    const metaResult = await deps.requestMeta(req);
    if (metaResult instanceof Response) return metaResult;

    const caseReference = exactCaseReference(req);
    if (!caseReference) {
      return appErrorResponse(
        req,
        400,
        "Ongeldige aanvraag.",
        "invalid_input",
      );
    }

    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "Het evidencedossier is tijdelijk niet beschikbaar.",
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

    const { data, error } = await serviceClient.rpc(READ_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: caseReference,
    }) as RpcResult;
    if (error || !isRecord(data)) {
      return appErrorResponse(
        req,
        500,
        "Het evidencedossier is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (data.ok !== true) {
      const code = typeof data.code === "string" ? data.code : "internal_error";
      const status = authorizationStatus(code);
      return appErrorResponse(
        req,
        status,
        status === 403
          ? "Het evidencedossier is niet toegestaan."
          : status === 400
          ? "Ongeldige aanvraag."
          : "Het evidencedossier is tijdelijk niet beschikbaar.",
        status === 500 ? "internal_error" : code,
      );
    }

    const response = parseEvidenceReviewCaseDetailSource(data);
    if (!response) {
      return appErrorResponse(
        req,
        500,
        "Het evidencedossier is tijdelijk niet beschikbaar.",
        "case_detail_reconstruction_failed",
      );
    }
    return appJsonResponse(req, 200, response);
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
