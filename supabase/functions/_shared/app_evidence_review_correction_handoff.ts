import {
  type DocumentFactKey,
  isDocumentFactKey,
} from "../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";

export const CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION =
  "customer-correction-handoff-v5" as const;

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
  factKey: DocumentFactKey;
  documentLabel: "Energiedocument" | "Installatiefactuur";
  factLabel: string;
  currentValue?: unknown;
  correctionReason: CustomerCorrectionReason;
  correctionReasonLabel: string;
  correctionInstruction: string;
  responseRequirement: CustomerCorrectionResponseRequirement;
  replacementTarget?: Readonly<{
    replacementTargetRef: string;
    documentLabel: "Energiedocument" | "Installatiefactuur";
    acceptedMimeTypes: readonly ["application/pdf"];
    maximumFileSize: number;
  }>;
}>;

export type CustomerCorrectionCurrentReplacementCandidate = Readonly<{
  replacementTargetRef: string;
  candidateRef: string;
  fileName: string;
  contentFingerprint: string | null;
  parserObservation:
    | null
    | Readonly<{
      schemaVersion: "customer-correction-replacement-observation-v1";
      parserProfile:
        | "energy_document_v1"
        | "installation_invoice_v1"
        | "kvk_extract_v1"
        | "generic_charger_evidence_v1";
      outcome: "completed" | "completed_with_limitations" | "failed";
      observedFacts: ReadonlyArray<
        Readonly<{
          factKey: DocumentFactKey;
          status: "observed" | "not_observed";
          observedValue: string | null;
          extractionMethod: string | null;
        }>
      >;
    }>;
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
      currentReplacementCandidates:
        readonly CustomerCorrectionCurrentReplacementCandidate[];
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

function parseReplacementTarget(
  value: unknown,
): NonNullable<CustomerCorrectionHandoffItem["replacementTarget"]> | null {
  if (
    !isObject(value) || !exactKeys(value, [
      "accepted_mime_types",
      "document_label",
      "maximum_file_size",
      "replacement_target_ref",
    ]) ||
    typeof value.replacement_target_ref !== "string" ||
    !/^CRT-[A-F0-9]{32}$/.test(value.replacement_target_ref) ||
    !["Energiedocument", "Installatiefactuur"].includes(
      String(value.document_label),
    ) ||
    !Array.isArray(value.accepted_mime_types) ||
    value.accepted_mime_types.length !== 1 ||
    value.accepted_mime_types[0] !== "application/pdf" ||
    !Number.isInteger(value.maximum_file_size) ||
    Number(value.maximum_file_size) !== 15 * 1024 * 1024
  ) return null;
  return Object.freeze({
    replacementTargetRef: value.replacement_target_ref,
    documentLabel: value.document_label as
      | "Energiedocument"
      | "Installatiefactuur",
    acceptedMimeTypes: Object.freeze(["application/pdf"] as const),
    maximumFileSize: Number(value.maximum_file_size),
  });
}

function parseItem(value: unknown): CustomerCorrectionHandoffItem | null {
  if (
    !isObject(value) || !exactKeys(value, [
      "correction_instruction",
      "correction_reason",
      "correction_reason_label",
      "document_label",
      "fact_key",
      "fact_label",
      "item_ref",
      "response_requirement",
    ], ["current_value", "replacement_target"])
  ) return null;
  const itemRef = value.item_ref;
  const documentLabel = value.document_label;
  const factKey = value.fact_key;
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
  const requiresReplacement = [
    "DOCUMENT_REPLACEMENT",
    "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  ].includes(responseRequirement);
  const replacementTarget = "replacement_target" in value
    ? parseReplacementTarget(value.replacement_target)
    : null;
  if (
    typeof itemRef !== "string" || !ITEM_REFERENCE_RE.test(itemRef) ||
    !isDocumentFactKey(factKey) ||
    !["Energiedocument", "Installatiefactuur"].includes(
      String(documentLabel),
    ) || !factLabel ||
    !CUSTOMER_CORRECTION_REASONS.includes(correctionReason) ||
    !CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS.includes(responseRequirement) ||
    !correctionReasonLabel ||
    correctionReasonLabel !== REASON_LABELS[correctionReason] ||
    !correctionInstruction || !/[\p{L}\p{N}]/u.test(correctionInstruction) ||
    (requiresReplacement ? !replacementTarget : replacementTarget !== null)
  ) return null;
  const currentValue = "current_value" in value
    ? safeCurrentValue(value.current_value)
    : undefined;
  if ("current_value" in value && currentValue === null) return null;
  return Object.freeze({
    itemRef,
    factKey,
    documentLabel:
      documentLabel as CustomerCorrectionHandoffItem["documentLabel"],
    factLabel,
    ...(currentValue === undefined ? {} : { currentValue }),
    correctionReason,
    correctionReasonLabel,
    correctionInstruction,
    responseRequirement,
    ...(replacementTarget ? { replacementTarget } : {}),
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

function parseCurrentReplacementCandidate(
  value: unknown,
): CustomerCorrectionCurrentReplacementCandidate | null {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "candidate_ref",
      "file_name",
      "parser_observation",
      "replacement_target_ref",
    ]) ||
    typeof value.replacement_target_ref !== "string" ||
    !/^CRT-[A-F0-9]{32}$/.test(value.replacement_target_ref) ||
    typeof value.candidate_ref !== "string" ||
    !/^CRC-[A-F0-9]{32}$/.test(value.candidate_ref) ||
    !boundedString(value.file_name, 180)
  ) return null;
  if (value.parser_observation === null) {
    return Object.freeze({
      replacementTargetRef: value.replacement_target_ref,
      candidateRef: value.candidate_ref,
      fileName: value.file_name as string,
      contentFingerprint: null,
      parserObservation: null,
    });
  }
  const observation = value.parser_observation;
  if (
    !isObject(observation) ||
    !exactKeys(observation, [
      "observed_facts",
      "outcome",
      "parser_profile",
      "schema_version",
    ]) ||
    observation.schema_version !==
      "customer-correction-replacement-observation-v1" ||
    ![
      "energy_document_v1",
      "installation_invoice_v1",
      "kvk_extract_v1",
      "generic_charger_evidence_v1",
    ].includes(String(observation.parser_profile)) ||
    !["completed", "completed_with_limitations", "failed"].includes(
      String(observation.outcome),
    ) ||
    !Array.isArray(observation.observed_facts)
  ) return null;
  const observedFacts = observation.observed_facts.map((fact) => {
    if (
      !isObject(fact) ||
      !exactKeys(fact, [
        "extraction_method",
        "fact_key",
        "observed_value",
        "status",
      ]) ||
      !isDocumentFactKey(fact.fact_key) ||
      !["observed", "not_observed"].includes(String(fact.status)) ||
      !(fact.observed_value === null ||
        typeof fact.observed_value === "string") ||
      (fact.status === "observed" &&
        (typeof fact.observed_value !== "string" ||
          fact.observed_value.trim().length < 1)) ||
      (fact.status === "not_observed" && fact.observed_value !== null) ||
      !(fact.extraction_method === null ||
        boundedString(fact.extraction_method, 120))
    ) return null;
    return Object.freeze({
      factKey: fact.fact_key,
      status: fact.status as "observed" | "not_observed",
      observedValue: fact.observed_value,
      extractionMethod: fact.extraction_method as string | null,
    });
  });
  if (
    observedFacts.some((fact) => fact === null) ||
    new Set(observedFacts.map((fact) => fact?.factKey)).size !==
      observedFacts.length
  ) return null;
  return Object.freeze({
    replacementTargetRef: value.replacement_target_ref,
    candidateRef: value.candidate_ref,
    fileName: value.file_name as string,
    contentFingerprint: null,
    parserObservation: Object.freeze({
      schemaVersion: observation.schema_version,
      parserProfile: observation.parser_profile as NonNullable<
        CustomerCorrectionCurrentReplacementCandidate["parserObservation"]
      >["parserProfile"],
      outcome: observation.outcome as NonNullable<
        CustomerCorrectionCurrentReplacementCandidate["parserObservation"]
      >["outcome"],
      observedFacts: Object.freeze(
        observedFacts as Array<
          NonNullable<
            NonNullable<
              CustomerCorrectionCurrentReplacementCandidate["parserObservation"]
            >["observedFacts"][number]
          >
        >,
      ),
    }),
  });
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
      "current_replacement_candidates",
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
  if (!Array.isArray(value.handoff.current_replacement_candidates)) return null;
  const currentReplacementCandidates = value.handoff
    .current_replacement_candidates.map(parseCurrentReplacementCandidate);
  const signerAuthority = parseSignerAuthority(value.handoff.signer_authority);
  if (
    !signerAuthority || items.some((item) => !item) ||
    new Set(items.map((item) => item?.itemRef)).size !== items.length ||
    currentReplacementCandidates.some((candidate) => !candidate) ||
    new Set(
        currentReplacementCandidates.map((candidate) =>
          candidate?.replacementTargetRef
        ),
      ).size !== currentReplacementCandidates.length
  ) return null;
  const parsedItems = items as CustomerCorrectionHandoffItem[];
  for (const candidate of currentReplacementCandidates) {
    if (!candidate) return null;
    const targetItems = parsedItems.filter((item) =>
      item.replacementTarget?.replacementTargetRef ===
        candidate.replacementTargetRef
    );
    if (
      targetItems.length < 1 ||
      candidate.parserObservation?.observedFacts.some((fact) =>
        !targetItems.some((item) => item.factKey === fact.factKey)
      )
    ) return null;
  }
  return Object.freeze({
    schemaVersion: CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
    caseRef: value.case_ref,
    handoff: Object.freeze({
      handoffRef,
      publishedAt,
      signerAuthority,
      items: Object.freeze(parsedItems),
      currentReplacementCandidates: Object.freeze(
        currentReplacementCandidates as CustomerCorrectionCurrentReplacementCandidate[],
      ),
    }),
  });
}
