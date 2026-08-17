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
  buildComplianceWorklistResponse,
  parseAuthorizedComplianceSourceEvents,
  SUPPORTED_DELIVERY_YEARS,
} from "../_shared/app_compliance_worklist.ts";

const READ_RPC = "app_compliance_worklist_source_events_read_v1";

type RpcResult = { data?: unknown; error?: unknown };

export type ComplianceWorklistHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
  now: () => string;
};

const DEFAULT_DEPENDENCIES: ComplianceWorklistHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
  now: () => new Date().toISOString(),
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseDeliveryYear(req: Request):
  | { ok: true; value: number }
  | { ok: false; code: "invalid_input" | "unsupported_delivery_year" } {
  const params = new URL(req.url).searchParams;
  const keys = [...params.keys()];
  if (
    keys.length !== 1 || keys[0] !== "deliveryYear" ||
    params.getAll("deliveryYear").length !== 1
  ) return { ok: false, code: "invalid_input" };
  const raw = params.get("deliveryYear") ?? "";
  if (!/^\d{4}$/.test(raw)) return { ok: false, code: "invalid_input" };
  const deliveryYear = Number(raw);
  return (SUPPORTED_DELIVERY_YEARS as readonly number[]).includes(deliveryYear)
    ? { ok: true, value: deliveryYear }
    : { ok: false, code: "unsupported_delivery_year" };
}

function authorizationStatus(code: string): number {
  if (code === "authenticated_actor_not_verified") return 403;
  if (
    code === "workforce_identity_missing" ||
    code === "workforce_identity_inactive" ||
    code === "seniority_not_authorized" ||
    code === "capability_not_authorized" ||
    code === "tenant_scope_denied" ||
    code === "authorization_changed"
  ) return 403;
  if (code === "invalid_input") return 400;
  return 500;
}

export function createHandler(
  overrides: Partial<ComplianceWorklistHandlerDependencies> = {},
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

    const selectedYear = parseDeliveryYear(req);
    if (!selectedYear.ok) {
      return appErrorResponse(
        req,
        selectedYear.code === "unsupported_delivery_year" ? 422 : 400,
        "Het leveringsjaar wordt niet ondersteund.",
        selectedYear.code,
      );
    }

    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "De compliancewerklijst is tijdelijk niet beschikbaar.",
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
      p_delivery_year: selectedYear.value,
    }) as RpcResult;
    if (error || !isRecord(data)) {
      return appErrorResponse(
        req,
        500,
        "De compliancewerklijst is tijdelijk niet beschikbaar.",
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
          ? "De compliancewerklijst is niet toegestaan."
          : "De compliancewerklijst is tijdelijk niet beschikbaar.",
        status === 500 ? "internal_error" : code,
      );
    }

    const sourceEvents = parseAuthorizedComplianceSourceEvents(
      data,
      selectedYear.value,
    );
    const asOf = deps.now();
    const worklist = sourceEvents
      ? buildComplianceWorklistResponse(selectedYear.value, asOf, sourceEvents)
      : null;
    if (!worklist?.ok) {
      return appErrorResponse(
        req,
        500,
        "De compliancewerklijst is tijdelijk niet beschikbaar.",
        "worklist_reconstruction_failed",
      );
    }
    return appJsonResponse(req, 200, worklist.value);
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
