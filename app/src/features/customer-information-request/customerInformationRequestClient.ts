import {
  type CustomerInformationRequestV1,
  parseCustomerInformationRequestApi,
} from "../../../../supabase/functions/_shared/app_customer_information_request.ts";
import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";

export type CustomerInformationRequestAction =
  | "create"
  | "respond"
  | "withdraw"
  | "resolve";

export type CustomerInformationRequestMutation = Readonly<{
  action: CustomerInformationRequestAction;
  caseRef: string;
  requestRef?: string;
  text?: string;
}>;

export type CustomerInformationRequestMutationResult =
  | Readonly<{
    ok: true;
    request: CustomerInformationRequestV1 | null;
  }>
  | Readonly<{ ok: false; stale: boolean }>;

type RuntimeConfig = Readonly<{ anonKey: string; apiBaseUrl: string }>;
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function requestBody(
  mutation: CustomerInformationRequestMutation,
): JsonObject | null {
  const caseRef = mutation.caseRef.trim();
  const requestRef = mutation.requestRef?.trim();
  const text = mutation.text?.trim();
  if (!caseRef) return null;
  if (mutation.action === "create") {
    return text ? { action: mutation.action, caseRef, question: text } : null;
  }
  if (!requestRef) return null;
  if (mutation.action === "respond") {
    return text
      ? { action: mutation.action, caseRef, requestRef, answer: text }
      : null;
  }
  return { action: mutation.action, caseRef, requestRef };
}

export async function mutateCustomerInformationRequest({
  accessToken,
  idempotencyKey,
  mutation,
  fetchImpl = fetch,
  runtimeConfig,
}: Readonly<{
  accessToken: string;
  idempotencyKey: string;
  mutation: CustomerInformationRequestMutation;
  fetchImpl?: typeof fetch;
  runtimeConfig?: RuntimeConfig;
}>): Promise<CustomerInformationRequestMutationResult> {
  const body = requestBody(mutation);
  const token = accessToken.trim();
  const key = idempotencyKey.trim();
  if (!body || !token || !key || key.length > 200 || /\s/.test(key)) {
    return { ok: false, stale: false };
  }
  const runtime = runtimeConfig ?? (() => {
    const resolved = resolvePublicApiRuntimeConfig();
    return resolved.ok ? resolved : null;
  })();
  if (!runtime) return { ok: false, stale: false };

  let response: Response;
  try {
    response = await fetchImpl(
      `${runtime.apiBaseUrl}/api-app-customer-information-request`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: runtime.anonKey,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      },
    );
  } catch (_error) {
    return { ok: false, stale: false };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch (_error) {
    return { ok: false, stale: false };
  }
  if (!response.ok) {
    return {
      ok: false,
      stale: response.status === 404 || response.status === 409,
    };
  }
  if (
    !isObject(value) ||
    !exactKeys(value, ["action", "request", "schemaVersion"]) ||
    value.schemaVersion !== "customer-information-request-mutation-v1" ||
    value.action !== mutation.action
  ) return { ok: false, stale: false };
  const parsed = value.request === null
    ? null
    : parseCustomerInformationRequestApi(value.request);
  if (
    (mutation.action === "create" || mutation.action === "respond") &&
    !parsed
  ) return { ok: false, stale: false };
  if (
    (mutation.action === "withdraw" || mutation.action === "resolve") &&
    value.request !== null
  ) return { ok: false, stale: false };
  return { ok: true, request: parsed };
}
