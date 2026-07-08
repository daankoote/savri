import type { SignupSubmitPayloadV3 } from "./signupSubmitMapper";

export type SignupSubmitClientConfig = {
  endpointUrl: string;
  anonKey: string;
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
};

export type SignupSubmitSuccess = {
  ok: true;
  mode: "write_v3";
  request_id: string;
  customer_id: string;
  dossier_id: string;
  location_count: number;
  charger_count: number;
  document_slot_count: number;
  legal_acceptance_count: number;
  payload_hash: string;
  message: string;
};

export type SignupSubmitErrorCode =
  | "invalid_json_response"
  | "invalid_response"
  | "idempotency_conflict"
  | "service_unavailable"
  | "http_error"
  | "network_error";

export type SignupSubmitError = {
  ok: false;
  code: SignupSubmitErrorCode;
  message: string;
  status?: number;
};

export type SignupSubmitResult = SignupSubmitSuccess | SignupSubmitError;

type UnknownJsonObject = Record<string, unknown>;

const GENERIC_ERROR_MESSAGE = "Aanmelding tijdelijk niet beschikbaar.";

function isRecord(value: unknown): value is UnknownJsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringField(body: UnknownJsonObject, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function numberField(body: UnknownJsonObject, key: string): number {
  return typeof body[key] === "number" && Number.isFinite(body[key]) ? body[key] : Number.NaN;
}

function safeError(
  code: SignupSubmitErrorCode,
  message = GENERIC_ERROR_MESSAGE,
  status?: number,
): SignupSubmitError {
  return {
    ok: false,
    code,
    message,
    ...(status ? { status } : {}),
  };
}

function headersFor(config: SignupSubmitClientConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.anonKey}`,
    apikey: config.anonKey,
    "Content-Type": "application/json",
    "Idempotency-Key": config.idempotencyKey,
  };
}

function validateSuccessBody(body: UnknownJsonObject): SignupSubmitSuccess | SignupSubmitError {
  const result: SignupSubmitSuccess = {
    ok: true,
    mode: "write_v3",
    request_id: stringField(body, "request_id"),
    customer_id: stringField(body, "customer_id"),
    dossier_id: stringField(body, "dossier_id"),
    location_count: numberField(body, "location_count"),
    charger_count: numberField(body, "charger_count"),
    document_slot_count: numberField(body, "document_slot_count"),
    legal_acceptance_count: numberField(body, "legal_acceptance_count"),
    payload_hash: stringField(body, "payload_hash"),
    message: stringField(body, "message"),
  };

  if (
    body.ok !== true ||
    body.mode !== "write_v3" ||
    !result.request_id ||
    !result.customer_id ||
    !result.dossier_id ||
    !Number.isFinite(result.location_count) ||
    !Number.isFinite(result.charger_count) ||
    !Number.isFinite(result.document_slot_count) ||
    !Number.isFinite(result.legal_acceptance_count) ||
    !result.payload_hash ||
    !result.message
  ) {
    return safeError("invalid_response", "Controleer de aanmelding.");
  }

  return result;
}

function mapHttpError(status: number, body: unknown): SignupSubmitError {
  const response = isRecord(body) ? body : {};
  const code = stringField(response, "code");

  if (status === 409 && code === "idempotency_conflict") {
    return safeError("idempotency_conflict", "Deze aanvraag hoort bij een andere payload.", status);
  }

  if (status >= 500 || code === "service_unavailable") {
    return safeError("service_unavailable", GENERIC_ERROR_MESSAGE, status);
  }

  return safeError("http_error", "Controleer de aanmelding.", status);
}

async function parseJsonResponse(
  response: Response,
): Promise<{ ok: true; body: unknown } | { ok: false; error: SignupSubmitError }> {
  try {
    return { ok: true, body: await response.json() };
  } catch (_error) {
    return {
      ok: false,
      error: safeError("invalid_json_response", "Ongeldig antwoord van de server.", response.status),
    };
  }
}

export async function submitSignupPayload(
  payload: SignupSubmitPayloadV3,
  config: SignupSubmitClientConfig,
): Promise<SignupSubmitResult> {
  const endpointUrl = config.endpointUrl.trim();
  const anonKey = config.anonKey.trim();
  const idempotencyKey = config.idempotencyKey.trim();

  if (!endpointUrl || !anonKey || !idempotencyKey) {
    return safeError("invalid_response", "Controleer de aanmelding.");
  }

  const fetchImpl = config.fetchImpl || fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: headersFor({ ...config, endpointUrl, anonKey, idempotencyKey }),
      body: JSON.stringify(payload),
    });
  } catch (_error) {
    return safeError("network_error", GENERIC_ERROR_MESSAGE);
  }

  const parsed = await parseJsonResponse(response);
  if (!parsed.ok) return parsed.error;

  if (isRecord(parsed.body) && "ok" in parsed.body) {
    if (!response.ok) return mapHttpError(response.status, parsed.body);
    return validateSuccessBody(parsed.body);
  }

  if (isRecord(parsed.body) && !response.ok) {
    return mapHttpError(response.status, parsed.body);
  }

  if (!isRecord(parsed.body)) {
    return safeError("invalid_response", "Controleer de aanmelding.", response.status);
  }

  return safeError("invalid_response", "Controleer de aanmelding.", response.status);
}
