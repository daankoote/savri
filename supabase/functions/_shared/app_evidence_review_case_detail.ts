export const EVIDENCE_REVIEW_CASE_DETAIL_SCHEMA_VERSION =
  "evidence-review-case-detail-v3" as const;

export const EVIDENCE_FACT_REVIEW_MANIFEST_VERSION =
  "fact-review-manifest-v1" as const;

export const EVIDENCE_REVIEW_STATUSES = Object.freeze([
  "PENDING",
  "ACCEPTED",
  "CORRECTION_REQUIRED",
] as const);

export const EVIDENCE_REVIEW_CORRECTION_REASONS = Object.freeze([
  "MISSING_INFORMATION",
  "INCORRECT_INFORMATION",
  "INCONSISTENT_INFORMATION",
  "UNREADABLE_DOCUMENT",
  "WRONG_DOCUMENT",
  "OTHER",
] as const);

export const EVIDENCE_REVIEW_CORRECTION_INSTRUCTION_MAX_LENGTH = 1_000;

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

export const EVIDENCE_FACT_REVIEW_VALUE_STATUSES = Object.freeze([
  "PRESENT",
  "REQUIRED_MISSING",
] as const);

export const EVIDENCE_FACT_REVIEW_SUGGESTIONS = Object.freeze([
  "ACCEPT",
  "NONE",
] as const);

export const EVIDENCE_FACT_REVIEW_CORRECTION_REASONS = Object.freeze([
  "MISSING_INFORMATION",
  "INCORRECT_INFORMATION",
  "INCONSISTENT_INFORMATION",
  "OTHER",
] as const);

type JsonObject = Record<string, unknown>;

export type EvidenceReviewStatus =
  (typeof EVIDENCE_REVIEW_STATUSES)[number];
export type EvidenceReviewCorrectionReason =
  (typeof EVIDENCE_REVIEW_CORRECTION_REASONS)[number];
export type EvidenceReviewFactCategory =
  (typeof EVIDENCE_REVIEW_FACT_CATEGORIES)[number];
export type EvidenceReviewFactTruthClass =
  (typeof EVIDENCE_REVIEW_FACT_TRUTH_CLASSES)[number];
export type EvidenceReviewReason =
  (typeof EVIDENCE_REVIEW_REASONS)[number];
export type EvidenceFactReviewValueStatus =
  (typeof EVIDENCE_FACT_REVIEW_VALUE_STATUSES)[number];
export type EvidenceFactReviewSuggestion =
  (typeof EVIDENCE_FACT_REVIEW_SUGGESTIONS)[number];
export type EvidenceFactReviewCorrectionReason =
  (typeof EVIDENCE_FACT_REVIEW_CORRECTION_REASONS)[number];

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
  canDecide: boolean;
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
  correctionReason?: EvidenceReviewCorrectionReason;
  correctionInstruction?: string;
  canonicalFacts: readonly EvidenceReviewCanonicalFactV1[];
}>;

export type EvidenceFactReviewSubjectV1 = Readonly<{
  subjectRef: string;
  subjectKind: "FACT";
  evidenceVersionRef: string;
  evidenceKind: string;
  factKey: string;
  factCategory: EvidenceReviewFactCategory;
  factLabel: string;
  scopeRef: string;
  value: string | null;
  valueStatus: EvidenceFactReviewValueStatus;
  required: boolean;
  truthClass: EvidenceReviewFactTruthClass;
  reviewReason?: EvidenceReviewReason | "REQUIRED_INFORMATION_MISSING";
  reviewReasonAuthority?:
    | "CUSTOMER_SIGNED_RESOLUTION"
    | "SERVER_REQUIRED_SLOT";
  reviewerSuggestion: EvidenceFactReviewSuggestion;
}>;

export type EvidenceFactReviewFinalizedDecisionV1 =
  | Readonly<{ subjectRef: string; disposition: "ACCEPTED" }>
  | Readonly<{
    subjectRef: string;
    disposition: "CORRECTION_REQUIRED";
    correctionReason: EvidenceFactReviewCorrectionReason;
    correctionInstruction: string;
  }>;

export type EvidenceFactReviewCurrentRoundV1 = Readonly<{
  roundRef: string;
  manifestVersion: typeof EVIDENCE_FACT_REVIEW_MANIFEST_VERSION;
  manifestHash: string;
  outcome: "ALL_FACTS_ACCEPTED" | "CORRECTIONS_REQUIRED";
  finalizedAt: string;
  decisions: readonly EvidenceFactReviewFinalizedDecisionV1[];
}>;

export type EvidenceReviewCaseDetailResponseV1 = Readonly<{
  schemaVersion: typeof EVIDENCE_REVIEW_CASE_DETAIL_SCHEMA_VERSION;
  asOf: string;
  case: EvidenceReviewCaseContextV1;
  evidence: readonly EvidenceReviewEvidenceV1[];
  reviewManifestVersion: typeof EVIDENCE_FACT_REVIEW_MANIFEST_VERSION;
  reviewManifestHash: string;
  reviewSubjects: readonly EvidenceFactReviewSubjectV1[];
  currentReviewRound: EvidenceFactReviewCurrentRoundV1 | null;
}>;

const CASE_SOURCE_KEYS = [
  "can_decide",
  "case_ref",
  "delivery_address",
  "delivery_address_truth_class",
  "lifecycle_state",
  "party_display_name",
  "party_truth_class",
].sort().join("|");

const EVIDENCE_SOURCE_KEYS = [
  "canonical_facts",
  "correction_instruction",
  "correction_reason",
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

const REVIEW_SUBJECT_SOURCE_KEYS = [
  "evidence_kind",
  "evidence_version_ref",
  "fact_category",
  "fact_key",
  "fact_label",
  "required",
  "review_reason",
  "review_reason_authority",
  "reviewer_suggestion",
  "scope_ref",
  "subject_kind",
  "subject_ref",
  "truth_class",
  "value",
  "value_status",
].sort().join("|");

const CURRENT_REVIEW_ROUND_SOURCE_KEYS = [
  "decisions",
  "finalized_at",
  "manifest_hash",
  "manifest_version",
  "outcome",
  "round_ref",
].join("|");

const REVIEW_FACT_KEYS = new Set([
  "partyName",
  "structuredAddress",
  "electricityEan",
  "energySupplier",
  "chargerBrand",
  "chargerModel",
  "midNumber",
  "serialNumber",
]);

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

  const correctionReason = value.correction_reason;
  const correctionInstruction = value.correction_instruction;
  const correctionDetailsAbsent = correctionReason === null &&
    correctionInstruction === null;
  const parsedInstruction = correctionDetailsAbsent
    ? null
    : boundedString(
      correctionInstruction,
      EVIDENCE_REVIEW_CORRECTION_INSTRUCTION_MAX_LENGTH,
    );
  if (
    (value.review_status !== "CORRECTION_REQUIRED" &&
      !correctionDetailsAbsent) ||
    (value.review_status === "CORRECTION_REQUIRED" &&
      !correctionDetailsAbsent &&
      (!EVIDENCE_REVIEW_CORRECTION_REASONS.includes(
        correctionReason as EvidenceReviewCorrectionReason,
      ) || !parsedInstruction || !/[\p{L}\p{N}]/u.test(parsedInstruction)))
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
    ...(correctionDetailsAbsent
      ? {}
      : {
        correctionReason: correctionReason as EvidenceReviewCorrectionReason,
        correctionInstruction: parsedInstruction as string,
      }),
    canonicalFacts: Object.freeze(facts),
  });
}

function parseReviewSubject(value: unknown): EvidenceFactReviewSubjectV1 | null {
  if (!isObject(value) || !hasExactKeys(value, REVIEW_SUBJECT_SOURCE_KEYS)) {
    return null;
  }
  const subjectRef = boundedString(value.subject_ref, 68);
  const scopeRef = boundedString(value.scope_ref, 73);
  const evidenceKind = boundedString(value.evidence_kind, 100);
  const factKey = boundedString(value.fact_key, 100);
  const factLabel = boundedString(value.fact_label, 240);
  const factCategory = value.fact_category as EvidenceReviewFactCategory;
  const valueStatus = value.value_status as EvidenceFactReviewValueStatus;
  const truthClass = value.truth_class as EvidenceReviewFactTruthClass;
  const suggestion = value.reviewer_suggestion as EvidenceFactReviewSuggestion;
  const reviewReason = value.review_reason;
  const reviewReasonAuthority = value.review_reason_authority;
  const factValue = value.value === null ? null : boundedString(value.value, 2_000);
  if (
    !subjectRef || !/^FRS-[0-9a-f]{64}$/.test(subjectRef) ||
    value.subject_kind !== "FACT" || !isUuid(value.evidence_version_ref) ||
    !evidenceKind || !factKey || !REVIEW_FACT_KEYS.has(factKey) || !factLabel ||
    !scopeRef || !/^FRSCOPE-[0-9a-f]{64}$/.test(scopeRef) ||
    !EVIDENCE_REVIEW_FACT_CATEGORIES.includes(factCategory) ||
    !EVIDENCE_FACT_REVIEW_VALUE_STATUSES.includes(valueStatus) ||
    typeof value.required !== "boolean" ||
    !EVIDENCE_REVIEW_FACT_TRUTH_CLASSES.includes(truthClass) ||
    !EVIDENCE_FACT_REVIEW_SUGGESTIONS.includes(suggestion) ||
    (valueStatus === "PRESENT" && !factValue) ||
    (valueStatus === "REQUIRED_MISSING" &&
      (value.value !== null || value.required !== true))
  ) return null;

  if (
    truthClass === "CUSTOMER_CONFIRMED" &&
    (valueStatus !== "PRESENT" || reviewReason !== null ||
      reviewReasonAuthority !== null || suggestion !== "ACCEPT")
  ) return null;
  if (truthClass === "REVIEW_REQUIRED") {
    if (suggestion !== "NONE") return null;
    if (valueStatus === "REQUIRED_MISSING") {
      if (
        reviewReason !== "REQUIRED_INFORMATION_MISSING" ||
        reviewReasonAuthority !== "SERVER_REQUIRED_SLOT"
      ) return null;
    } else if (
      !EVIDENCE_REVIEW_REASONS.includes(reviewReason as EvidenceReviewReason) ||
      (reviewReason === "GENERIC_REVIEW_REQUIRED" &&
        reviewReasonAuthority !== null) ||
      (reviewReason !== "GENERIC_REVIEW_REQUIRED" &&
        reviewReasonAuthority !== "CUSTOMER_SIGNED_RESOLUTION")
    ) return null;
  }

  return Object.freeze({
    subjectRef,
    subjectKind: "FACT",
    evidenceVersionRef: value.evidence_version_ref,
    evidenceKind,
    factKey,
    factCategory,
    factLabel,
    scopeRef,
    value: factValue,
    valueStatus,
    required: value.required,
    truthClass,
    ...(truthClass === "REVIEW_REQUIRED"
      ? {
        reviewReason: reviewReason as
          | EvidenceReviewReason
          | "REQUIRED_INFORMATION_MISSING",
        ...(reviewReasonAuthority === null
          ? {}
          : {
            reviewReasonAuthority: reviewReasonAuthority as
              | "CUSTOMER_SIGNED_RESOLUTION"
              | "SERVER_REQUIRED_SLOT",
          }),
      }
      : {}),
    reviewerSuggestion: suggestion,
  });
}

function parseCurrentReviewRound(
  value: unknown,
  manifestHash: string,
  subjectRefs: ReadonlySet<string>,
): EvidenceFactReviewCurrentRoundV1 | null | false {
  if (value === null) return null;
  if (
    !isObject(value) || !hasExactKeys(value, CURRENT_REVIEW_ROUND_SOURCE_KEYS) ||
    !isUuid(value.round_ref) ||
    value.manifest_version !== EVIDENCE_FACT_REVIEW_MANIFEST_VERSION ||
    value.manifest_hash !== manifestHash ||
    !["ALL_FACTS_ACCEPTED", "CORRECTIONS_REQUIRED"].includes(
      String(value.outcome),
    ) || !isIsoTimestamp(value.finalized_at) ||
    !Array.isArray(value.decisions) ||
    value.decisions.length !== subjectRefs.size
  ) return false;

  const decisions: EvidenceFactReviewFinalizedDecisionV1[] = [];
  const seen = new Set<string>();
  for (const rawDecision of value.decisions) {
    if (!isObject(rawDecision)) return false;
    const subjectRef = boundedString(rawDecision.subject_ref, 68);
    const disposition = rawDecision.disposition;
    if (
      !subjectRef || !/^FRS-[0-9a-f]{64}$/.test(subjectRef) ||
      !subjectRefs.has(subjectRef) || seen.has(subjectRef) ||
      !["ACCEPTED", "CORRECTION_REQUIRED"].includes(String(disposition))
    ) return false;
    seen.add(subjectRef);

    if (disposition === "ACCEPTED") {
      if (!hasExactKeys(rawDecision, "disposition|subject_ref")) return false;
      decisions.push(Object.freeze({ subjectRef, disposition: "ACCEPTED" }));
      continue;
    }

    if (
      !hasExactKeys(
        rawDecision,
        "correction_instruction|correction_reason|disposition|subject_ref",
      ) ||
      !EVIDENCE_FACT_REVIEW_CORRECTION_REASONS.includes(
        rawDecision.correction_reason as EvidenceFactReviewCorrectionReason,
      )
    ) return false;
    const correctionInstruction = boundedString(
      rawDecision.correction_instruction,
      EVIDENCE_REVIEW_CORRECTION_INSTRUCTION_MAX_LENGTH,
    );
    if (!correctionInstruction || !/[\p{L}\p{N}]/u.test(correctionInstruction)) {
      return false;
    }
    decisions.push(Object.freeze({
      subjectRef,
      disposition: "CORRECTION_REQUIRED",
      correctionReason:
        rawDecision.correction_reason as EvidenceFactReviewCorrectionReason,
      correctionInstruction,
    }));
  }

  if (seen.size !== subjectRefs.size) return false;
  const hasCorrection = decisions.some((decision) =>
    decision.disposition === "CORRECTION_REQUIRED"
  );
  if (
    (value.outcome === "ALL_FACTS_ACCEPTED" && hasCorrection) ||
    (value.outcome === "CORRECTIONS_REQUIRED" && !hasCorrection)
  ) return false;

  return Object.freeze({
    roundRef: value.round_ref,
    manifestVersion: EVIDENCE_FACT_REVIEW_MANIFEST_VERSION,
    manifestHash,
    outcome: value.outcome as
      | "ALL_FACTS_ACCEPTED"
      | "CORRECTIONS_REQUIRED",
    finalizedAt: value.finalized_at,
    decisions: Object.freeze(decisions),
  });
}

export function parseEvidenceReviewCaseDetailSource(
  input: unknown,
): EvidenceReviewCaseDetailResponseV1 | null {
  if (
    !isObject(input) ||
    !hasExactKeys(
      input,
      "as_of|case_context|code|current_review_round|evidence|ok|review_manifest_hash|review_manifest_version|review_subjects|status",
    ) ||
    input.ok !== true || input.status !== 200 || input.code !== "ok" ||
    !isIsoTimestamp(input.as_of) || !isObject(input.case_context) ||
    !hasExactKeys(input.case_context, CASE_SOURCE_KEYS) ||
    !Array.isArray(input.evidence) || input.evidence.length > 100 ||
    input.review_manifest_version !== EVIDENCE_FACT_REVIEW_MANIFEST_VERSION ||
    typeof input.review_manifest_hash !== "string" ||
    !/^[0-9a-f]{64}$/.test(input.review_manifest_hash) ||
    !Array.isArray(input.review_subjects) || input.review_subjects.length > 100
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
  if (
    !caseRef || !lifecycle || typeof input.case_context.can_decide !== "boolean" ||
    partyDisplayName === false || deliveryAddress === false
  ) {
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

  const reviewSubjects: EvidenceFactReviewSubjectV1[] = [];
  const subjectRefs = new Set<string>();
  for (const rawSubject of input.review_subjects) {
    const subject = parseReviewSubject(rawSubject);
    if (
      !subject || subjectRefs.has(subject.subjectRef) ||
      !versionRefs.has(subject.evidenceVersionRef)
    ) return null;
    subjectRefs.add(subject.subjectRef);
    reviewSubjects.push(subject);
  }
  if (reviewSubjects.length === 0) return null;

  const currentReviewRound = parseCurrentReviewRound(
    input.current_review_round,
    input.review_manifest_hash,
    subjectRefs,
  );
  if (currentReviewRound === false) return null;

  return Object.freeze({
    schemaVersion: EVIDENCE_REVIEW_CASE_DETAIL_SCHEMA_VERSION,
    asOf: input.as_of,
    case: Object.freeze({
      caseRef,
      lifecycle,
      canDecide: input.case_context.can_decide,
      ...(partyDisplayName === null
        ? {}
        : { partyDisplayName, partyDisplayNameTruth: "DECLARED" as const }),
      ...(deliveryAddress === null
        ? {}
        : { deliveryAddress, deliveryAddressTruth: "DECLARED" as const }),
    }),
    evidence: Object.freeze(evidence),
    reviewManifestVersion: EVIDENCE_FACT_REVIEW_MANIFEST_VERSION,
    reviewManifestHash: input.review_manifest_hash,
    reviewSubjects: Object.freeze(reviewSubjects),
    currentReviewRound,
  });
}
