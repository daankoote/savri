import {
  type DocumentFactKey,
  isDocumentFactKey,
} from "../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";

export const CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION =
  "customer-correction-handoff-v8" as const;

export function isCorrectionCoverMessage(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const length = [...value].length;
  return length >= 1 && length <= 1_000 && /[\p{L}\p{N}]/u.test(value) &&
    !/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u.test(value);
}

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
  sourceFacts: ReadonlyArray<
    Readonly<{
      factKey: DocumentFactKey;
      documentLabel: "Energiedocument" | "Installatiefactuur";
      observedValue: string | null;
      relationship: "direct" | null;
      sourceRef: string;
      transcriptionAllowed: boolean;
    }>
  >;
}>;

export type CustomerCorrectionFactProjection = Readonly<{
  factRef: string;
  sourceRef: string;
  replacementTargetRef: string;
  factKey: DocumentFactKey;
  factLabel: string;
  value: string | null;
  sources: readonly Readonly<{
    sourceRef: string;
    documentLabel: "Energiedocument" | "Installatiefactuur";
    value: string | null;
    relationship: "direct" | "supporting";
  }>[];
  envalStatus:
    | "Wacht op klant"
    | "Nog te beoordelen"
    | "Correctie nodig"
    | "Akkoord";
}>;

export type CustomerCorrectionHandoffResponse = Readonly<{
  schemaVersion: typeof CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION;
  caseRef: string;
  factProjections: readonly CustomerCorrectionFactProjection[];
  handoff:
    | null
    | Readonly<{
      coverMessage: string | null;
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
      factProjections: readonly CustomerCorrectionFactProjection[];
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
      "replacement_target_ref",
      "source_facts",
    ]) ||
    typeof value.replacement_target_ref !== "string" ||
    !/^CRT-[A-F0-9]{32}$/.test(value.replacement_target_ref) ||
    typeof value.candidate_ref !== "string" ||
    !/^CRC-[A-F0-9]{32}$/.test(value.candidate_ref) ||
    !boundedString(value.file_name, 180)
  ) return null;
  if (!Array.isArray(value.source_facts)) return null;
  const sourceFacts = value.source_facts.map((fact) => {
    if (
      !isObject(fact) ||
      !exactKeys(fact, [
        "document_label",
        "fact_key",
        "observed_value",
        "relationship",
        "source_ref",
        "transcription_allowed",
      ]) ||
      !isDocumentFactKey(fact.fact_key) ||
      !["Energiedocument", "Installatiefactuur"].includes(
        String(fact.document_label),
      ) ||
      !(fact.observed_value === null ||
        typeof fact.observed_value === "string") ||
      !(fact.relationship === null || fact.relationship === "direct") ||
      typeof fact.source_ref !== "string" ||
      !/^CRS-[A-F0-9]{32}$/.test(fact.source_ref) ||
      typeof fact.transcription_allowed !== "boolean" ||
      (fact.relationship === "direct" &&
        (typeof fact.observed_value !== "string" ||
          fact.observed_value.trim().length < 1)) ||
      (fact.transcription_allowed !== (fact.relationship === null))
    ) return null;
    return Object.freeze({
      factKey: fact.fact_key,
      documentLabel: fact.document_label as
        | "Energiedocument"
        | "Installatiefactuur",
      observedValue: fact.observed_value,
      relationship: fact.relationship as "direct" | null,
      sourceRef: fact.source_ref,
      transcriptionAllowed: fact.transcription_allowed,
    });
  });
  if (
    sourceFacts.some((fact) => fact === null) ||
    new Set(sourceFacts.map((fact) => fact?.factKey)).size !==
      sourceFacts.length
  ) return null;
  return Object.freeze({
    replacementTargetRef: value.replacement_target_ref,
    candidateRef: value.candidate_ref,
    fileName: value.file_name as string,
    sourceFacts: Object.freeze(
      sourceFacts as NonNullable<
        CustomerCorrectionCurrentReplacementCandidate["sourceFacts"]
      >[number][],
    ),
  });
}

function parseFactProjection(
  value: unknown,
): CustomerCorrectionFactProjection | null {
  if (
    !isObject(value) || !exactKeys(value, [
      "enval_status",
      "fact_key",
      "fact_label",
      "fact_ref",
      "replacement_target_ref",
      "source_ref",
      "sources",
      "value",
    ]) || !isDocumentFactKey(value.fact_key) ||
    typeof value.fact_ref !== "string" ||
    !/^CFR-[A-F0-9]{32}$/.test(value.fact_ref) ||
    typeof value.source_ref !== "string" ||
    !/^CES-[A-F0-9]{32}$/.test(value.source_ref) ||
    typeof value.replacement_target_ref !== "string" ||
    !/^CRT-[A-F0-9]{32}$/.test(value.replacement_target_ref) ||
    !boundedString(value.fact_label, 240) ||
    !["Wacht op klant", "Nog te beoordelen", "Correctie nodig", "Akkoord"]
      .includes(String(value.enval_status)) ||
    !Array.isArray(value.sources) || value.sources.length !== 1
  ) return null;
  const source = value.sources[0];
  if (
    !isObject(source) || !exactKeys(source, [
      "document_label",
      "relationship",
      "source_ref",
      "value",
    ]) ||
    source.source_ref !== value.source_ref ||
    !["Energiedocument", "Installatiefactuur"].includes(
      String(source.document_label),
    ) ||
    !["direct", "supporting"].includes(String(source.relationship)) ||
    (value.enval_status === "Akkoord" && source.relationship !== "direct")
  ) return null;
  const safeValue = value.value === null
    ? null
    : typeof value.value === "string" && boundedString(value.value, 2_000)
    ? value.value
    : null;
  const safeSourceValue = source.value === null
    ? null
    : typeof source.value === "string" && boundedString(source.value, 2_000)
    ? source.value
    : null;
  if (
    (value.value !== null && safeValue === null) ||
    (source.value !== null && safeSourceValue === null) ||
    JSON.stringify(safeValue) !== JSON.stringify(safeSourceValue) ||
    (source.relationship === "direct" && safeValue === null) ||
    (value.enval_status === "Akkoord" && safeValue === null)
  ) return null;
  return Object.freeze({
    factRef: value.fact_ref,
    sourceRef: value.source_ref,
    replacementTargetRef: value.replacement_target_ref,
    factKey: value.fact_key,
    factLabel: value.fact_label as string,
    value: safeValue,
    sources: Object.freeze([Object.freeze({
      sourceRef: source.source_ref as string,
      documentLabel: source.document_label as
        | "Energiedocument"
        | "Installatiefactuur",
      value: safeSourceValue,
      relationship: source.relationship as "direct" | "supporting",
    })]),
    envalStatus: value
      .enval_status as CustomerCorrectionFactProjection["envalStatus"],
  });
}

export function parseCustomerCorrectionHandoffSource(
  value: unknown,
): CustomerCorrectionHandoffResponse | null {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "case_ref",
      "code",
      "fact_projections",
      "handoff",
      "ok",
      "status",
    ]) ||
    value.ok !== true || value.status !== 200 ||
    !["ok", "not_available"].includes(String(value.code)) ||
    typeof value.case_ref !== "string" ||
    !CASE_REFERENCE_RE.test(value.case_ref)
  ) return null;
  if (!Array.isArray(value.fact_projections)) return null;
  const rootFactProjections = value.fact_projections.map(parseFactProjection);
  if (
    rootFactProjections.some((fact) => !fact) ||
    new Set(rootFactProjections.map((fact) => fact?.factRef)).size !==
      rootFactProjections.length
  ) return null;
  if (value.code === "not_available") {
    if (value.handoff !== null) return null;
    return Object.freeze({
      schemaVersion: CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
      caseRef: value.case_ref,
      factProjections: Object.freeze(
        rootFactProjections as CustomerCorrectionFactProjection[],
      ),
      handoff: null,
    });
  }
  if (
    !isObject(value.handoff) || !exactKeys(value.handoff, [
      "bundle_version",
      "cover_message",
      "current_replacement_candidates",
      "customer_publication_snapshot_sha256",
      "fact_projections",
      "handoff_ref",
      "items",
      "published_at",
      "signer_authority",
    ])
  ) return null;
  const handoffRef = value.handoff.handoff_ref;
  const publishedAt = normalizedTimestamp(value.handoff.published_at);
  const coverMessage = value.handoff.cover_message;
  const publicationHash = value.handoff.customer_publication_snapshot_sha256;
  if (
    typeof handoffRef !== "string" ||
    !HANDOFF_REFERENCE_RE.test(handoffRef) || !publishedAt ||
    !(
      (coverMessage === null && publicationHash === null) ||
      (isCorrectionCoverMessage(coverMessage) &&
        typeof publicationHash === "string" &&
        /^[0-9a-f]{64}$/.test(publicationHash))
    ) ||
    !Array.isArray(value.handoff.items) || value.handoff.items.length < 1 ||
    value.handoff.items.length > 100
  ) return null;
  const items = value.handoff.items.map(parseItem);
  if (!Array.isArray(value.handoff.current_replacement_candidates)) return null;
  const currentReplacementCandidates = value.handoff
    .current_replacement_candidates.map(parseCurrentReplacementCandidate);
  if (!Array.isArray(value.handoff.fact_projections)) return null;
  const factProjections = value.handoff.fact_projections.map(
    parseFactProjection,
  );
  const signerAuthority = parseSignerAuthority(value.handoff.signer_authority);
  if (
    !signerAuthority || items.some((item) => !item) ||
    new Set(items.map((item) => item?.itemRef)).size !== items.length ||
    currentReplacementCandidates.some((candidate) => !candidate) ||
    factProjections.some((fact) => !fact) ||
    JSON.stringify(factProjections) !== JSON.stringify(rootFactProjections) ||
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
      candidate.sourceFacts.some((fact) =>
        !targetItems.some((item) => item.factKey === fact.factKey)
      )
    ) return null;
  }
  return Object.freeze({
    schemaVersion: CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
    caseRef: value.case_ref,
    factProjections: Object.freeze(
      rootFactProjections as CustomerCorrectionFactProjection[],
    ),
    handoff: Object.freeze({
      coverMessage,
      handoffRef,
      publishedAt,
      signerAuthority,
      items: Object.freeze(parsedItems),
      currentReplacementCandidates: Object.freeze(
        currentReplacementCandidates as CustomerCorrectionCurrentReplacementCandidate[],
      ),
      factProjections: Object.freeze(
        factProjections as CustomerCorrectionFactProjection[],
      ),
    }),
  });
}
