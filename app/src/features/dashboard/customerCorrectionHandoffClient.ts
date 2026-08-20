import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";

export const CUSTOMER_CORRECTION_REASONS = Object.freeze(
  [
    "MISSING_INFORMATION",
    "INCORRECT_INFORMATION",
    "INCONSISTENT_INFORMATION",
    "OTHER",
  ] as const,
);

export type CustomerCorrectionReason =
  (typeof CUSTOMER_CORRECTION_REASONS)[number];

export const CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS = Object.freeze(
  [
    "VALUE_CORRECTION",
    "MISSING_VALUE",
    "DOCUMENT_REPLACEMENT",
    "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  ] as const,
);

export type CustomerCorrectionResponseRequirement =
  (typeof CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS)[number];

export type CustomerCorrectionHandoffItem = Readonly<{
  itemRef: string;
  documentLabel: "Energiedocument" | "Installatiefactuur";
  factLabel: string;
  correctionReason: CustomerCorrectionReason;
  correctionInstruction: string;
  currentValue?: unknown;
  responseRequirement: CustomerCorrectionResponseRequirement;
}>;

export type CustomerCorrectionHandoffModel = Readonly<{
  caseRef: string;
  handoff:
    | null
    | Readonly<{
      items: readonly CustomerCorrectionHandoffItem[];
    }>;
}>;

export type CustomerCorrectionHandoffErrorCode =
  | "not_configured"
  | "inaccessible"
  | "invalid_response"
  | "service_unavailable";

export type CustomerCorrectionHandoffSafeError = Readonly<{
  code: CustomerCorrectionHandoffErrorCode;
  message: string;
}>;

export type CustomerCorrectionHandoffResult =
  | { ok: true; model: CustomerCorrectionHandoffModel }
  | {
    ok: false;
    error: CustomerCorrectionHandoffSafeError;
    status?: number;
  };

type UnknownRecord = Record<string, unknown>;

type CustomerCorrectionHandoffClientConfig = {
  accessToken: string;
  caseRef: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: { apiBaseUrl: string; anonKey: string };
};

const SCHEMA_VERSION = "customer-correction-handoff-v2";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const HANDOFF_REFERENCE_RE = /^CRH-[0-9A-F]{16}$/;
const ITEM_REFERENCE_RE = /^CCI-[A-F0-9]{32}$/;
const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const SERVER_REASON_LABELS: Readonly<Record<CustomerCorrectionReason, string>> =
  Object.freeze({
    MISSING_INFORMATION: "Gegeven ontbreekt",
    INCORRECT_INFORMATION: "Gegeven onjuist",
    INCONSISTENT_INFORMATION: "Gegevens inconsistent",
    OTHER: "Aanpassing nodig",
  });

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actual = Object.keys(value);
  return required.every((key) => actual.includes(key)) &&
    actual.every((key) => required.includes(key) || optional.includes(key));
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  return value.length >= 1 && value.length <= maximum ? value : null;
}

function safeJsonValue(value: unknown): boolean {
  try {
    const encoded = JSON.stringify(value);
    return encoded !== undefined && encoded.length <= 4_000;
  } catch (_error) {
    return false;
  }
}

function parseItem(value: unknown): CustomerCorrectionHandoffItem | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "correctionInstruction",
      "correctionReason",
      "correctionReasonLabel",
      "documentLabel",
      "factLabel",
      "itemRef",
      "responseRequirement",
    ], ["currentValue"])
  ) return null;

  const itemRef = value.itemRef;
  const documentLabel = value.documentLabel;
  const factLabel = boundedString(value.factLabel, 240);
  const correctionReason = value.correctionReason as CustomerCorrectionReason;
  const correctionInstruction = boundedString(
    value.correctionInstruction,
    1_000,
  );
  const responseRequirement =
    value.responseRequirement as CustomerCorrectionResponseRequirement;
  if (
    typeof itemRef !== "string" || !ITEM_REFERENCE_RE.test(itemRef) ||
    !["Energiedocument", "Installatiefactuur"].includes(
      String(documentLabel),
    ) ||
    !factLabel || !CUSTOMER_CORRECTION_REASONS.includes(correctionReason) ||
    !CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS.includes(responseRequirement) ||
    value.correctionReasonLabel !== SERVER_REASON_LABELS[correctionReason] ||
    !correctionInstruction || !/[\p{L}\p{N}]/u.test(correctionInstruction) ||
    ("currentValue" in value &&
      (value.currentValue === null || !safeJsonValue(value.currentValue)))
  ) return null;

  return Object.freeze({
    itemRef,
    documentLabel:
      documentLabel as CustomerCorrectionHandoffItem["documentLabel"],
    factLabel,
    correctionReason,
    correctionInstruction,
    ...(value.currentValue === undefined
      ? {}
      : { currentValue: value.currentValue }),
    responseRequirement,
  });
}

export function customerCorrectionHandoffSafeError(
  code: CustomerCorrectionHandoffErrorCode,
): CustomerCorrectionHandoffSafeError {
  const message = code === "not_configured"
    ? "Dossieracties zijn lokaal nog niet geconfigureerd."
    : code === "inaccessible"
    ? "De dossieractie is niet beschikbaar voor dit account."
    : "De dossieractie kon tijdelijk niet worden geladen. Probeer het opnieuw.";
  return Object.freeze({ code, message });
}

export function decodeCustomerCorrectionHandoffResponse(
  value: unknown,
  expectedCaseRef: string,
): CustomerCorrectionHandoffResult {
  if (
    !CASE_REFERENCE_RE.test(expectedCaseRef) || !isRecord(value) ||
    !exactKeys(value, ["caseRef", "handoff", "schemaVersion"]) ||
    value.schemaVersion !== SCHEMA_VERSION || value.caseRef !== expectedCaseRef
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }

  if (value.handoff === null) {
    return {
      ok: true,
      model: Object.freeze({ caseRef: expectedCaseRef, handoff: null }),
    };
  }

  if (
    !isRecord(value.handoff) ||
    !exactKeys(value.handoff, ["handoffRef", "items", "publishedAt"]) ||
    typeof value.handoff.handoffRef !== "string" ||
    !HANDOFF_REFERENCE_RE.test(value.handoff.handoffRef) ||
    typeof value.handoff.publishedAt !== "string" ||
    !TIMESTAMP_RE.test(value.handoff.publishedAt) ||
    !Number.isFinite(Date.parse(value.handoff.publishedAt)) ||
    !Array.isArray(value.handoff.items) || value.handoff.items.length < 1 ||
    value.handoff.items.length > 100
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }

  const items = value.handoff.items.map(parseItem);
  if (
    items.some((item) => !item) ||
    new Set(items.map((item) => item?.itemRef)).size !== items.length
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }

  return {
    ok: true,
    model: Object.freeze({
      caseRef: expectedCaseRef,
      handoff: Object.freeze({
        items: Object.freeze(items as CustomerCorrectionHandoffItem[]),
      }),
    }),
  };
}

export async function fetchCustomerCorrectionHandoff({
  accessToken,
  caseRef,
  fetchImpl = fetch,
  runtimeConfig,
}: CustomerCorrectionHandoffClientConfig): Promise<
  CustomerCorrectionHandoffResult
> {
  const runtime = runtimeConfig
    ? { ok: true as const, ...runtimeConfig }
    : resolvePublicApiRuntimeConfig();
  if (!runtime.ok) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("not_configured"),
    };
  }

  const bearerToken = accessToken.trim();
  const selectedCaseRef = caseRef.trim();
  if (
    !bearerToken || selectedCaseRef !== caseRef ||
    !CASE_REFERENCE_RE.test(selectedCaseRef)
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `${runtime.apiBaseUrl}/api-app-customer-correction-handoff?caseRef=${
        encodeURIComponent(selectedCaseRef)
      }`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          apikey: runtime.anonKey,
        },
      },
    );
  } catch (_error) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("service_unavailable"),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (_error) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
      status: response.status,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError(
        response.status === 401 || response.status === 404
          ? "inaccessible"
          : "service_unavailable",
      ),
      status: response.status,
    };
  }

  const decoded = decodeCustomerCorrectionHandoffResponse(
    body,
    selectedCaseRef,
  );
  return decoded.ok ? decoded : { ...decoded, status: response.status };
}
