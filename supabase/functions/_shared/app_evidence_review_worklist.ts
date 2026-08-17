export const EVIDENCE_REVIEW_WORKLIST_SCHEMA_VERSION =
  "evidence-review-worklist-v1" as const;

export const EVIDENCE_REVIEW_ATTENTION_REASONS = Object.freeze([
  "UNREVIEWED_EVIDENCE",
  "CORRECTION_REQUIRED",
  "NEW_EVIDENCE_VERSION_AFTER_REVIEW",
] as const);

export type EvidenceReviewAttentionReason =
  (typeof EVIDENCE_REVIEW_ATTENTION_REASONS)[number];

type JsonObject = Record<string, unknown>;

export type AuthorizedEvidenceReviewSourceRowV1 = Readonly<{
  caseRef: string;
  lifecycleState: "submitted_for_review";
  evidenceVersionRef: string;
  versionNumber: number;
  evidenceCreatedAt: string;
  currentDecision: "ACCEPTED" | "CORRECTION_REQUIRED" | null;
  currentDecidedAt: string | null;
  hasEarlierDecision: boolean;
}>;

export type EvidenceReviewWorklistCaseV1 = Readonly<{
  caseRef: string;
  lifecycleState: "submitted_for_review";
  unresolvedEvidenceCount: number;
  attentionReasons: readonly EvidenceReviewAttentionReason[];
  evidenceRefs: readonly string[];
  latestReviewActivityAt: string;
}>;

export type EvidenceReviewWorklistResponseV1 = Readonly<{
  schemaVersion: typeof EVIDENCE_REVIEW_WORKLIST_SCHEMA_VERSION;
  asOf: string;
  caseCount: number;
  cases: readonly EvidenceReviewWorklistCaseV1[];
}>;

const SOURCE_KEYS = [
  "case_ref",
  "current_decided_at",
  "current_decision",
  "evidence_created_at",
  "evidence_version_ref",
  "has_earlier_decision",
  "lifecycle_state",
  "version_number",
].sort().join("|");

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

function parseSourceRow(
  input: unknown,
): AuthorizedEvidenceReviewSourceRowV1 | null {
  if (!isObject(input) || Object.keys(input).sort().join("|") !== SOURCE_KEYS) {
    return null;
  }
  if (
    typeof input.case_ref !== "string" ||
    input.case_ref !== input.case_ref.trim() ||
    input.case_ref.length < 8 || input.case_ref.length > 64 ||
    input.lifecycle_state !== "submitted_for_review" ||
    !isUuid(input.evidence_version_ref) ||
    !Number.isInteger(input.version_number) ||
    (input.version_number as number) < 1 ||
    !isIsoTimestamp(input.evidence_created_at) ||
    ![null, "ACCEPTED", "CORRECTION_REQUIRED"].includes(
      input.current_decision as null | string,
    ) ||
    typeof input.has_earlier_decision !== "boolean"
  ) return null;
  if (
    (input.current_decision === null && input.current_decided_at !== null) ||
    (input.current_decision !== null && !isIsoTimestamp(input.current_decided_at))
  ) return null;

  return Object.freeze({
    caseRef: input.case_ref,
    lifecycleState: input.lifecycle_state,
    evidenceVersionRef: input.evidence_version_ref,
    versionNumber: input.version_number as number,
    evidenceCreatedAt: input.evidence_created_at,
    currentDecision: input.current_decision as
      | "ACCEPTED"
      | "CORRECTION_REQUIRED"
      | null,
    currentDecidedAt: input.current_decided_at as string | null,
    hasEarlierDecision: input.has_earlier_decision,
  });
}

export function parseAuthorizedEvidenceReviewSourceRows(
  input: unknown,
): readonly AuthorizedEvidenceReviewSourceRowV1[] | null {
  if (!isObject(input)) return null;
  if (
    Object.keys(input).sort().join("|") !== "code|ok|source_rows|status" ||
    input.ok !== true || input.status !== 200 || input.code !== "ok" ||
    !Array.isArray(input.source_rows)
  ) return null;

  const rows: AuthorizedEvidenceReviewSourceRowV1[] = [];
  const evidenceRefs = new Set<string>();
  for (const rawRow of input.source_rows) {
    const row = parseSourceRow(rawRow);
    if (!row || evidenceRefs.has(row.evidenceVersionRef)) return null;
    evidenceRefs.add(row.evidenceVersionRef);
    rows.push(row);
  }
  return Object.freeze(rows);
}

type MutableCaseProjection = {
  caseRef: string;
  unresolvedEvidenceCount: number;
  attentionReasons: Set<EvidenceReviewAttentionReason>;
  evidenceRefs: Set<string>;
  latestReviewActivityAt: string;
};

function latestTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function buildEvidenceReviewWorklistResponse(
  asOf: string,
  sourceRows: readonly AuthorizedEvidenceReviewSourceRowV1[],
): EvidenceReviewWorklistResponseV1 | null {
  if (!isIsoTimestamp(asOf)) return null;

  const byCase = new Map<string, MutableCaseProjection>();
  for (const row of sourceRows) {
    const reasons: EvidenceReviewAttentionReason[] = [];
    if (row.currentDecision === null) {
      reasons.push("UNREVIEWED_EVIDENCE");
      if (row.hasEarlierDecision) {
        reasons.push("NEW_EVIDENCE_VERSION_AFTER_REVIEW");
      }
    } else if (row.currentDecision === "CORRECTION_REQUIRED") {
      reasons.push("CORRECTION_REQUIRED");
    }
    if (reasons.length === 0) continue;

    const activityAt = row.currentDecidedAt ?? row.evidenceCreatedAt;
    const existing = byCase.get(row.caseRef);
    if (!existing) {
      byCase.set(row.caseRef, {
        caseRef: row.caseRef,
        unresolvedEvidenceCount: 1,
        attentionReasons: new Set(reasons),
        evidenceRefs: new Set([row.evidenceVersionRef]),
        latestReviewActivityAt: activityAt,
      });
      continue;
    }
    existing.unresolvedEvidenceCount += 1;
    reasons.forEach((reason) => existing.attentionReasons.add(reason));
    existing.evidenceRefs.add(row.evidenceVersionRef);
    existing.latestReviewActivityAt = latestTimestamp(
      existing.latestReviewActivityAt,
      activityAt,
    );
  }

  const reasonOrder = new Map<EvidenceReviewAttentionReason, number>(
    EVIDENCE_REVIEW_ATTENTION_REASONS.map((reason, index) => [reason, index]),
  );
  const cases = [...byCase.values()].map((item) => Object.freeze({
    caseRef: item.caseRef,
    lifecycleState: "submitted_for_review" as const,
    unresolvedEvidenceCount: item.unresolvedEvidenceCount,
    attentionReasons: Object.freeze(
      [...item.attentionReasons].sort((left, right) =>
        (reasonOrder.get(left) ?? 0) - (reasonOrder.get(right) ?? 0)
      ),
    ),
    evidenceRefs: Object.freeze([...item.evidenceRefs].sort()),
    latestReviewActivityAt: item.latestReviewActivityAt,
  })).sort((left, right) => {
    const activityOrder = Date.parse(right.latestReviewActivityAt) -
      Date.parse(left.latestReviewActivityAt);
    return activityOrder || left.caseRef.localeCompare(right.caseRef);
  });

  return Object.freeze({
    schemaVersion: EVIDENCE_REVIEW_WORKLIST_SCHEMA_VERSION,
    asOf,
    caseCount: cases.length,
    cases: Object.freeze(cases),
  });
}
