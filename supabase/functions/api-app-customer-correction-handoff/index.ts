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
  parseCustomerCorrectionHandoffSource,
} from "../_shared/app_evidence_review_correction_handoff.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";

const READ_RPC = "app_customer_correction_handoff_read_v2";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

type RpcResult = { data?: unknown; error?: unknown };

export type CustomerCorrectionHandoffHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: CustomerCorrectionHandoffHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
  overrides: Partial<CustomerCorrectionHandoffHandlerDependencies> = {},
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
      return appErrorResponse(req, 400, "Ongeldige aanvraag.", "invalid_input");
    }
    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "De correctieopdracht is tijdelijk niet beschikbaar.",
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
    const result = await serviceClient.rpc(READ_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: caseReference,
    }) as RpcResult;
    if (result.error || !isObject(result.data)) {
      return appErrorResponse(
        req,
        500,
        "De correctieopdracht is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) {
      const code = typeof result.data.code === "string"
        ? result.data.code
        : "internal_error";
      const status = code === "authentication_required"
        ? 401
        : code === "invalid_input"
        ? 400
        : code === "customer_case_access_denied"
        ? 404
        : 500;
      return appErrorResponse(
        req,
        status,
        status === 401
          ? "Authenticatie vereist."
          : status === 400
          ? "Ongeldige aanvraag."
          : status === 404
          ? "Dossier niet gevonden."
          : "De correctieopdracht is tijdelijk niet beschikbaar.",
        status === 500 ? "internal_error" : code,
      );
    }
    const response = parseCustomerCorrectionHandoffSource(result.data);
    if (!response || response.caseRef !== caseReference) {
      return appErrorResponse(
        req,
        500,
        "De correctieopdracht is tijdelijk niet beschikbaar.",
        "correction_handoff_reconstruction_failed",
      );
    }
    return appJsonResponse(req, 200, response);
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
