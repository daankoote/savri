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
  buildEvidenceReviewWorklistResponse,
  parseAuthorizedEvidenceReviewSourceRows,
} from "../_shared/app_evidence_review_worklist.ts";

const READ_RPC = "app_evidence_review_worklist_source_read_v2";

type RpcResult = { data?: unknown; error?: unknown };

export type EvidenceReviewWorklistHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
  now: () => string;
};

const DEFAULT_DEPENDENCIES: EvidenceReviewWorklistHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
  now: () => new Date().toISOString(),
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

export function createHandler(
  overrides: Partial<EvidenceReviewWorklistHandlerDependencies> = {},
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

    if ([...new URL(req.url).searchParams.keys()].length !== 0) {
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
        "De evidencewerklijst is tijdelijk niet beschikbaar.",
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
    }) as RpcResult;
    if (error || !isRecord(data)) {
      return appErrorResponse(
        req,
        500,
        "De evidencewerklijst is tijdelijk niet beschikbaar.",
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
          ? "De evidencewerklijst is niet toegestaan."
          : "De evidencewerklijst is tijdelijk niet beschikbaar.",
        status === 500 ? "internal_error" : code,
      );
    }

    const sourceRows = parseAuthorizedEvidenceReviewSourceRows(data);
    const response = sourceRows
      ? buildEvidenceReviewWorklistResponse(deps.now(), sourceRows)
      : null;
    if (!response) {
      return appErrorResponse(
        req,
        500,
        "De evidencewerklijst is tijdelijk niet beschikbaar.",
        "worklist_reconstruction_failed",
      );
    }
    return appJsonResponse(req, 200, response);
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
