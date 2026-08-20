export const CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION =
  "customer-correction-handoff-v3" as const;

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
  currentValue?: unknown;
  correctionReason: CustomerCorrectionReason;
  correctionReasonLabel: string;
  correctionInstruction: string;
  responseRequirement: CustomerCorrectionResponseRequirement;
}>;

export type CustomerCorrectionHandoffResponse = Readonly<{
  schemaVersion: typeof CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION;
  caseRef: string;
  handoff:
    | null
    | Readonly<{
      handoffRef: string;
      publishedAt: string;
      signerAuthority:
        | Readonly<{
          status: "available";
          expectedSignerDisplayName: string;
        }>
        | Readonly<{ status: "unavailable" }>;
      items: readonly CustomerCorrectionHandoffItem[];
    }>;
}>;

type JsonObject = Record<string, unknown>;

const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const HANDOFF_REFERENCE_RE = /^CRH-[0-9A-F]{16}$/;
const ITEM_REFERENCE_RE = /^CCI-[A-F0-9]{32}$/;
const REASON_LABELS: Readonly<Record<CustomerCorrectionReason, string>> = Object
  .freeze({
    MISSING_INFORMATION: "Gegeven ontbreekt",
    INCORRECT_INFORMATION: "Gegeven onjuist",
    INCONSISTENT_INFORMATION: "Gegevens inconsistent",
    OTHER: "Aanpassing nodig",
  });

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: JsonObject,
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

function normalizedTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" || value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value)
  ) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeCurrentValue(value: unknown): unknown | null {
  if (value === undefined) return null;
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || encoded.length > 4_000) return null;
    return JSON.parse(encoded);
  } catch (_error) {
    return null;
  }
}

function parseItem(value: unknown): CustomerCorrectionHandoffItem | null {
  if (
    !isObject(value) || !exactKeys(value, [
      "correction_instruction",
      "correction_reason",
      "correction_reason_label",
      "document_label",
      "fact_label",
      "item_ref",
      "response_requirement",
    ], ["current_value"])
  ) return null;
  const itemRef = value.item_ref;
  const documentLabel = value.document_label;
  const factLabel = boundedString(value.fact_label, 240);
  const correctionReason = value.correction_reason as CustomerCorrectionReason;
  const correctionReasonLabel = boundedString(
    value.correction_reason_label,
    80,
  );
  const correctionInstruction = boundedString(
    value.correction_instruction,
    1_000,
  );
  const responseRequirement = value
    .response_requirement as CustomerCorrectionResponseRequirement;
  if (
    typeof itemRef !== "string" || !ITEM_REFERENCE_RE.test(itemRef) ||
    !["Energiedocument", "Installatiefactuur"].includes(
      String(documentLabel),
    ) || !factLabel ||
    !CUSTOMER_CORRECTION_REASONS.includes(correctionReason) ||
    !CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS.includes(responseRequirement) ||
    !correctionReasonLabel ||
    correctionReasonLabel !== REASON_LABELS[correctionReason] ||
    !correctionInstruction || !/[\p{L}\p{N}]/u.test(correctionInstruction)
  ) return null;
  const currentValue = "current_value" in value
    ? safeCurrentValue(value.current_value)
    : undefined;
  if ("current_value" in value && currentValue === null) return null;
  return Object.freeze({
    itemRef,
    documentLabel:
      documentLabel as CustomerCorrectionHandoffItem["documentLabel"],
    factLabel,
    ...(currentValue === undefined ? {} : { currentValue }),
    correctionReason,
    correctionReasonLabel,
    correctionInstruction,
    responseRequirement,
  });
}

function parseSignerAuthority(
  value: unknown,
):
  | NonNullable<CustomerCorrectionHandoffResponse["handoff"]>["signerAuthority"]
  | null {
  if (!isObject(value) || typeof value.status !== "string") return null;
  if (value.status === "unavailable" && exactKeys(value, ["status"])) {
    return Object.freeze({ status: "unavailable" as const });
  }
  if (
    value.status !== "available" ||
    !exactKeys(value, ["expected_signer_display_name", "status"])
  ) return null;
  const expectedSignerDisplayName = boundedString(
    value.expected_signer_display_name,
    200,
  );
  return expectedSignerDisplayName
    ? Object.freeze({
      status: "available" as const,
      expectedSignerDisplayName,
    })
    : null;
}

export function parseCustomerCorrectionHandoffSource(
  value: unknown,
): CustomerCorrectionHandoffResponse | null {
  if (
    !isObject(value) ||
    !exactKeys(value, ["case_ref", "code", "handoff", "ok", "status"]) ||
    value.ok !== true || value.status !== 200 ||
    !["ok", "not_available"].includes(String(value.code)) ||
    typeof value.case_ref !== "string" ||
    !CASE_REFERENCE_RE.test(value.case_ref)
  ) return null;
  if (value.code === "not_available") {
    if (value.handoff !== null) return null;
    return Object.freeze({
      schemaVersion: CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
      caseRef: value.case_ref,
      handoff: null,
    });
  }
  if (
    !isObject(value.handoff) || !exactKeys(value.handoff, [
      "handoff_ref",
      "items",
      "published_at",
      "signer_authority",
    ])
  ) return null;
  const handoffRef = value.handoff.handoff_ref;
  const publishedAt = normalizedTimestamp(value.handoff.published_at);
  if (
    typeof handoffRef !== "string" ||
    !HANDOFF_REFERENCE_RE.test(handoffRef) || !publishedAt ||
    !Array.isArray(value.handoff.items) || value.handoff.items.length < 1 ||
    value.handoff.items.length > 100
  ) return null;
  const items = value.handoff.items.map(parseItem);
  const signerAuthority = parseSignerAuthority(value.handoff.signer_authority);
  if (
    !signerAuthority || items.some((item) => !item) ||
    new Set(items.map((item) => item?.itemRef)).size !== items.length
  ) return null;
  return Object.freeze({
    schemaVersion: CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
    caseRef: value.case_ref,
    handoff: Object.freeze({
      handoffRef,
      publishedAt,
      signerAuthority,
      items: Object.freeze(items as CustomerCorrectionHandoffItem[]),
    }),
  });
}
