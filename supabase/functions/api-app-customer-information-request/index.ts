import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  parseCustomerInformationRequestSource,
} from "../_shared/app_customer_information_request.ts";
import {
  requireVerifiedSupabaseAuthUser,
} from "../_shared/app_customer_auth.ts";
import {
  resolveWorkflowEmailServerContext,
  type WorkflowEmailServerContext,
} from "../_shared/app_workflow_email_context.ts";
import {
  configuredExpiry,
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";

const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const REQUEST_REFERENCE_RE = /^IRQ-[0-9A-F]{16}$/;

type Operation = "create" | "respond" | "withdraw" | "resolve";
type NormalizedRequest = Readonly<{
  action: Operation;
  caseRef: string;
  requestRef?: string;
  text?: string;
}>;
type RpcResult = { data?: unknown; error?: unknown };

export type CustomerInformationRequestHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  idempotencyExpiresAt: () => string | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
  resolveEmailContext: (
    tenantExecution: Parameters<typeof resolveWorkflowEmailServerContext>[1],
  ) => Promise<WorkflowEmailServerContext | null>;
};

function serverEnvironment() {
  return { get: (name: string) => Deno.env.get(name) };
}

const DEFAULT_DEPENDENCIES: CustomerInformationRequestHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  idempotencyExpiresAt: configuredExpiry,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
  resolveEmailContext: (tenantExecution) =>
    resolveWorkflowEmailServerContext(serverEnvironment(), tenantExecution),
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= 1_000 &&
      !/[\u0000-\u001f\u007f]/u.test(text)
    ? text
    : null;
}

export function normalizeCustomerInformationRequest(
  value: unknown,
): NormalizedRequest | null {
  if (!isObject(value) || typeof value.action !== "string") return null;
  const action = value.action as Operation;
  const caseRef = typeof value.caseRef === "string" ? value.caseRef : "";
  if (
    !["create", "respond", "withdraw", "resolve"].includes(action) ||
    caseRef !== caseRef.trim() || !CASE_REFERENCE_RE.test(caseRef)
  ) return null;
  if (action === "create") {
    const question = normalizedText(value.question);
    return exactKeys(value, ["action", "caseRef", "question"]) && question
      ? Object.freeze({ action, caseRef, text: question })
      : null;
  }
  const requestRef = typeof value.requestRef === "string"
    ? value.requestRef
    : "";
  if (!REQUEST_REFERENCE_RE.test(requestRef)) return null;
  if (action === "respond") {
    const answer = normalizedText(value.answer);
    return exactKeys(value, ["action", "answer", "caseRef", "requestRef"]) &&
        answer
      ? Object.freeze({ action, caseRef, requestRef, text: answer })
      : null;
  }
  return exactKeys(value, ["action", "caseRef", "requestRef"])
    ? Object.freeze({ action, caseRef, requestRef })
    : null;
}

async function readBody(req: Request): Promise<unknown> {
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
  if (
    [
      "case_missing",
      "customer_case_access_denied",
      "information_request_not_found_or_forbidden",
    ].includes(code)
  ) return 404;
  if (code === "invalid_input") return 400;
  if (
    [
      "information_request_already_active",
      "information_request_conflict",
      "information_request_not_active",
      "information_request_not_answerable",
      "information_request_transition_invalid",
      "correction_handoff_active",
      "customer_context_unavailable",
      "idempotency_conflict",
    ].includes(code)
  ) return 409;
  return 500;
}

function safeFailure(req: Request, value: JsonObject): Response {
  const code = typeof value.code === "string" ? value.code : "internal_error";
  const status = safeStatus(code);
  const message = status === 400
    ? "Controleer de aanvraag."
    : status === 401
    ? "Authenticatie vereist."
    : status === 403 || status === 404
    ? "Deze informatievraag is niet beschikbaar."
    : status === 409
    ? "Deze informatievraag is gewijzigd. Vernieuw de pagina."
    : "De informatievraag is tijdelijk niet beschikbaar.";
  return appErrorResponse(
    req,
    status,
    message,
    status === 500 ? "internal_error" : code,
  );
}

function rpcFor(request: NormalizedRequest): {
  name: string;
  args: JsonObject;
} {
  if (request.action === "create") {
    return {
      name: "app_customer_information_request_create_v1",
      args: { p_question: request.text },
    };
  }
  if (request.action === "respond") {
    return {
      name: "app_customer_information_request_respond_v1",
      args: {
        p_request_ref: request.requestRef,
        p_response: request.text,
      },
    };
  }
  return {
    name: "app_customer_information_request_transition_v1",
    args: {
      p_request_ref: request.requestRef,
      p_action: request.action === "withdraw" ? "WITHDRAW" : "RESOLVE",
    },
  };
}

export function createHandler(
  overrides: Partial<CustomerInformationRequestHandlerDependencies> = {},
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
    const meta = await deps.requestMeta(req);
    if (meta instanceof Response) return meta;
    if (
      !meta.idempotency_key || meta.idempotency_key.length > 200 ||
      /\s/.test(meta.idempotency_key) || meta.request_id.length > 128
    ) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        "invalid_input",
      );
    }
    const request = normalizeCustomerInformationRequest(await readBody(req));
    if (!request) {
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
        "De informatievraag is tijdelijk niet beschikbaar.",
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
    const canonicalHash = await deps.hashPayload({
      contract_version: "customer-information-request-mutation-v1",
      caller: "api-app-customer-information-request",
      action: request.action,
      auth_user_id: verified.context.authUserId,
      case_ref: request.caseRef,
      request_ref: request.requestRef ?? null,
      text: request.text ?? null,
    });
    const emailContext = await deps.resolveEmailContext(meta.tenant_execution)
      .catch(() => null);
    const rpc = rpcFor(request);
    const result = await serviceClient.rpc(rpc.name, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: request.caseRef,
      ...rpc.args,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_payload_sha256: canonicalHash,
      p_idempotency_expires_at: expiresAt,
      p_email_context: emailContext,
    }) as RpcResult;
    if (result.error || !isObject(result.data)) {
      return appErrorResponse(
        req,
        500,
        "De informatievraag is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) return safeFailure(req, result.data);
    const code = typeof result.data.code === "string" ? result.data.code : "";
    const allowedCodes: Record<Operation, readonly string[]> = {
      create: ["created"],
      respond: ["answered"],
      withdraw: ["withdrawn"],
      resolve: ["resolved"],
    };
    if (!allowedCodes[request.action].includes(code)) {
      return appErrorResponse(
        req,
        500,
        "De informatievraag is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    const projectedRequest = "request" in result.data
      ? parseCustomerInformationRequestSource(result.data.request)
      : null;
    if (
      (request.action === "create" || request.action === "respond") &&
      !projectedRequest
    ) {
      return appErrorResponse(
        req,
        500,
        "De informatievraag is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    return appJsonResponse(req, request.action === "create" ? 201 : 200, {
      schemaVersion: "customer-information-request-mutation-v1",
      action: request.action,
      request: projectedRequest,
    });
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
