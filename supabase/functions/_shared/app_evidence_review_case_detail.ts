export const EVIDENCE_REVIEW_CASE_DETAIL_SCHEMA_VERSION =
  "evidence-review-case-detail-v1" as const;

export const EVIDENCE_REVIEW_STATUSES = Object.freeze([
  "PENDING",
  "ACCEPTED",
  "CORRECTION_REQUIRED",
] as const);

export const EVIDENCE_REVIEW_FACT_CATEGORIES = Object.freeze([
  "PARTY_NAME",
  "ADDRESS",
  "EAN",
  "ENERGY_SUPPLIER",
  "CHARGER_BRAND",
  "CHARGER_MODEL",
  "MID",
  "SERIAL",
] as const);

export const EVIDENCE_REVIEW_FACT_TRUTH_CLASSES = Object.freeze([
  "CUSTOMER_CONFIRMED",
  "REVIEW_REQUIRED",
] as const);

export const EVIDENCE_REVIEW_REASONS = Object.freeze([
  "GENERIC_REVIEW_REQUIRED",
  "USER_OVERRIDE",
  "USER_SUPPLIED_WITHOUT_DOCUMENT",
  "DOCUMENT_CONFLICT_RESOLVED",
  "PROBABLE_IDENTITY_MATCH",
  "PROBABLE_ADDRESS_MATCH",
] as const);

type JsonObject = Record<string, unknown>;

export type EvidenceReviewStatus =
  (typeof EVIDENCE_REVIEW_STATUSES)[number];
export type EvidenceReviewFactCategory =
  (typeof EVIDENCE_REVIEW_FACT_CATEGORIES)[number];
export type EvidenceReviewFactTruthClass =
  (typeof EVIDENCE_REVIEW_FACT_TRUTH_CLASSES)[number];
export type EvidenceReviewReason =
  (typeof EVIDENCE_REVIEW_REASONS)[number];

export type EvidenceReviewCanonicalFactV1 = Readonly<{
  category: EvidenceReviewFactCategory;
  value: string;
  truthClass: EvidenceReviewFactTruthClass;
  reviewReason?: EvidenceReviewReason;
  reviewReasonAuthority?: "CUSTOMER_SIGNED_RESOLUTION";
}>;

export type EvidenceReviewCaseContextV1 = Readonly<{
  caseRef: string;
  lifecycle: string;
  partyDisplayName?: string;
  partyDisplayNameTruth?: "DECLARED";
  deliveryAddress?: string;
  deliveryAddressTruth?: "DECLARED";
}>;

export type EvidenceReviewEvidenceV1 = Readonly<{
  evidenceRef: string;
  evidenceVersionRef: string;
  kind: string;
  mime: string;
  uploadedAt: string;
  integrityAvailable: boolean;
  reviewStatus: EvidenceReviewStatus;
  decidedAt?: string;
  canonicalFacts: readonly EvidenceReviewCanonicalFactV1[];
}>;

export type EvidenceReviewCaseDetailResponseV1 = Readonly<{
  schemaVersion: typeof EVIDENCE_REVIEW_CASE_DETAIL_SCHEMA_VERSION;
  asOf: string;
  case: EvidenceReviewCaseContextV1;
  evidence: readonly EvidenceReviewEvidenceV1[];
}>;

const CASE_SOURCE_KEYS = [
  "case_ref",
  "delivery_address",
  "delivery_address_truth_class",
  "lifecycle_state",
  "party_display_name",
  "party_truth_class",
].sort().join("|");

const EVIDENCE_SOURCE_KEYS = [
  "canonical_facts",
  "decided_at",
  "evidence_file_ref",
  "evidence_version_ref",
  "kind",
  "mime_type",
  "review_status",
  "sha256_present",
  "uploaded_at",
].sort().join("|");

const FACT_SOURCE_KEYS = [
  "category",
  "review_reason",
  "truth_class",
  "value",
].join("|");

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: string): boolean {
  return Object.keys(value).sort().join("|") === keys;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value === value.trim() && value.length > 0 &&
      value.length <= maxLength
    ? value
    : null;
}

function optionalDeclared(
  value: unknown,
  truth: unknown,
  maxLength: number,
): string | null | false {
  if (value === null && truth === null) return null;
  const parsed = boundedString(value, maxLength);
  return parsed && truth === "DECLARED" ? parsed : false;
}

function parseFact(value: unknown): EvidenceReviewCanonicalFactV1 | null {
  if (!isObject(value) || !hasExactKeys(value, FACT_SOURCE_KEYS)) return null;
  if (
    !EVIDENCE_REVIEW_FACT_CATEGORIES.includes(
      value.category as EvidenceReviewFactCategory,
    ) ||
    !EVIDENCE_REVIEW_FACT_TRUTH_CLASSES.includes(
      value.truth_class as EvidenceReviewFactTruthClass,
    )
  ) return null;
  const factValue = boundedString(value.value, 2_000);
  const truthClass = value.truth_class as EvidenceReviewFactTruthClass;
  const reviewReason = value.review_reason;
  if (
    !factValue ||
    (truthClass === "REVIEW_REQUIRED" &&
      !EVIDENCE_REVIEW_REASONS.includes(reviewReason as EvidenceReviewReason)) ||
    (truthClass === "CUSTOMER_CONFIRMED" && reviewReason !== null)
  ) return null;
  return Object.freeze({
    category: value.category as EvidenceReviewFactCategory,
    value: factValue,
    truthClass,
    ...(truthClass === "REVIEW_REQUIRED"
      ? {
        reviewReason: reviewReason as EvidenceReviewReason,
        ...(reviewReason === "GENERIC_REVIEW_REQUIRED"
          ? {}
          : { reviewReasonAuthority: "CUSTOMER_SIGNED_RESOLUTION" as const }),
      }
      : {}),
  });
}

function parseEvidence(value: unknown): EvidenceReviewEvidenceV1 | null {
  if (!isObject(value) || !hasExactKeys(value, EVIDENCE_SOURCE_KEYS)) return null;
  if (
    !isUuid(value.evidence_file_ref) || !isUuid(value.evidence_version_ref) ||
    !boundedString(value.kind, 100) || !boundedString(value.mime_type, 200) ||
    !isIsoTimestamp(value.uploaded_at) ||
    typeof value.sha256_present !== "boolean" || value.sha256_present !== true ||
    !EVIDENCE_REVIEW_STATUSES.includes(value.review_status as EvidenceReviewStatus) ||
    !Array.isArray(value.canonical_facts) || value.canonical_facts.length > 100 ||
    (value.decided_at !== null && !isIsoTimestamp(value.decided_at)) ||
    (value.review_status === "PENDING" && value.decided_at !== null) ||
    (value.review_status !== "PENDING" && value.decided_at === null)
  ) return null;

  const facts: EvidenceReviewCanonicalFactV1[] = [];
  const seen = new Set<string>();
  for (const rawFact of value.canonical_facts) {
    const fact = parseFact(rawFact);
    if (!fact) return null;
    const key = `${fact.category}\u0000${fact.value}\u0000${fact.truthClass}`;
    if (seen.has(key)) return null;
    seen.add(key);
    facts.push(fact);
  }

  return Object.freeze({
    evidenceRef: value.evidence_file_ref,
    evidenceVersionRef: value.evidence_version_ref,
    kind: value.kind as string,
    mime: value.mime_type as string,
    uploadedAt: value.uploaded_at,
    integrityAvailable: true,
    reviewStatus: value.review_status as EvidenceReviewStatus,
    ...(value.decided_at === null ? {} : { decidedAt: value.decided_at as string }),
    canonicalFacts: Object.freeze(facts),
  });
}

export function parseEvidenceReviewCaseDetailSource(
  input: unknown,
): EvidenceReviewCaseDetailResponseV1 | null {
  if (
    !isObject(input) ||
    !hasExactKeys(input, "as_of|case_context|code|evidence|ok|status") ||
    input.ok !== true || input.status !== 200 || input.code !== "ok" ||
    !isIsoTimestamp(input.as_of) || !isObject(input.case_context) ||
    !hasExactKeys(input.case_context, CASE_SOURCE_KEYS) ||
    !Array.isArray(input.evidence) || input.evidence.length > 100
  ) return null;

  const caseRef = boundedString(input.case_context.case_ref, 64);
  const lifecycle = boundedString(input.case_context.lifecycle_state, 80);
  const partyDisplayName = optionalDeclared(
    input.case_context.party_display_name,
    input.case_context.party_truth_class,
    500,
  );
  const deliveryAddress = optionalDeclared(
    input.case_context.delivery_address,
    input.case_context.delivery_address_truth_class,
    500,
  );
  if (!caseRef || !lifecycle || partyDisplayName === false || deliveryAddress === false) {
    return null;
  }

  const evidence: EvidenceReviewEvidenceV1[] = [];
  const fileRefs = new Set<string>();
  const versionRefs = new Set<string>();
  for (const rawEvidence of input.evidence) {
    const parsed = parseEvidence(rawEvidence);
    if (
      !parsed || fileRefs.has(parsed.evidenceRef) ||
      versionRefs.has(parsed.evidenceVersionRef)
    ) return null;
    fileRefs.add(parsed.evidenceRef);
    versionRefs.add(parsed.evidenceVersionRef);
    evidence.push(parsed);
  }

  return Object.freeze({
    schemaVersion: EVIDENCE_REVIEW_CASE_DETAIL_SCHEMA_VERSION,
    asOf: input.as_of,
    case: Object.freeze({
      caseRef,
      lifecycle,
      ...(partyDisplayName === null
        ? {}
        : { partyDisplayName, partyDisplayNameTruth: "DECLARED" as const }),
      ...(deliveryAddress === null
        ? {}
        : { deliveryAddress, deliveryAddressTruth: "DECLARED" as const }),
    }),
    evidence: Object.freeze(evidence),
  });
}
