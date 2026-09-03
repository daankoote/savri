import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  sha256Hex,
} from "../_shared/app_foundation.ts";
import { requireVerifiedSupabaseAuthUser } from "../_shared/app_customer_auth.ts";
import {
  SUPPORTED_DELIVERY_YEARS,
} from "../_shared/app_compliance_worklist.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";

const COMPLIANCE_CAPABILITY = "compliance.delivery_year.view";
const EVIDENCE_CAPABILITY = "evidence.review.view";
const CURRENT_DELIVERY_YEAR = SUPPORTED_DELIVERY_YEARS[0];

type RpcResult = { data?: unknown; error?: unknown };

export type OperatorContextHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
  hashTenantReference: (value: string) => Promise<string>;
};

const DEFAULT_DEPENDENCIES: OperatorContextHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
  hashTenantReference: sha256Hex,
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function denialCode(results: readonly JsonObject[]): string {
  const codes = results.map((result) =>
    typeof result.code === "string" ? result.code : "internal_error"
  );
  if (codes.includes("workforce_identity_missing")) {
    return "workforce_identity_missing";
  }
  if (codes.includes("workforce_identity_inactive")) {
    return "workforce_identity_inactive";
  }
  if (codes.includes("authenticated_actor_not_verified")) {
    return "authenticated_actor_not_verified";
  }
  if (
    codes.every((code) =>
      [
        "capability_not_authorized",
        "case_scope_denied",
        "seniority_not_authorized",
        "tenant_scope_denied",
      ].includes(code)
    )
  ) return "operator_not_authorized";
  return "internal_error";
}

export function createHandler(
  overrides: Partial<OperatorContextHandlerDependencies> = {},
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
    const meta = metaResult;
    if (
      !meta.tenant_execution ||
      [...new URL(req.url).searchParams.keys()].length !== 0
    ) {
      return appErrorResponse(req, 400, "Ongeldige aanvraag.", "invalid_input");
    }

    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "Beheer is tijdelijk niet beschikbaar.",
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

    const [compliance, evidence] = await Promise.all([
      serviceClient.rpc("app_compliance_worklist_source_events_read_v1", {
        p_auth_user_id: verified.context.authUserId,
        p_delivery_year: CURRENT_DELIVERY_YEAR,
      }) as Promise<RpcResult>,
      serviceClient.rpc("app_evidence_review_worklist_source_read_v4", {
        p_auth_user_id: verified.context.authUserId,
      }) as Promise<RpcResult>,
    ]);

    if (
      compliance.error || evidence.error || !isRecord(compliance.data) ||
      !isRecord(evidence.data)
    ) {
      return appErrorResponse(
        req,
        503,
        "Beheer is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }

    const effectiveCapabilities: string[] = [];
    if (compliance.data.ok === true) {
      effectiveCapabilities.push(COMPLIANCE_CAPABILITY);
    }
    if (evidence.data.ok === true) {
      effectiveCapabilities.push(EVIDENCE_CAPABILITY);
    }
    if (effectiveCapabilities.length === 0) {
      const code = denialCode([compliance.data, evidence.data]);
      return appErrorResponse(
        req,
        code === "internal_error" ? 503 : 403,
        code === "internal_error"
          ? "Beheer is tijdelijk niet beschikbaar."
          : "Beheer is niet toegestaan.",
        code,
      );
    }

    return appJsonResponse(req, 200, {
      schema_version: "operator_context_v1",
      actor_type: "tenant_workforce",
      tenant_reference: await deps.hashTenantReference(
        meta.tenant_execution.tenantId,
      ),
      effective_capabilities: effectiveCapabilities,
      active: true,
      authorized: true,
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
