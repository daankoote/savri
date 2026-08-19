export const EVIDENCE_REVIEW_WORKLIST_SCHEMA_VERSION =
  "evidence-review-worklist-v3" as const;

import {
  type EvidenceReviewOperationalStatus,
  isEvidenceReviewOperationalStatus,
} from "./app_evidence_review_overall_status.ts";

export const EVIDENCE_REVIEW_ATTENTION_REASONS = Object.freeze(
  [
    "FACT_REVIEW_REQUIRED",
    "REVIEW_MODEL_UNAVAILABLE",
  ] as const,
);

export type EvidenceReviewAttentionReason =
  (typeof EVIDENCE_REVIEW_ATTENTION_REASONS)[number];

type JsonObject = Record<string, unknown>;

export type AuthorizedEvidenceReviewSourceRowV3 = Readonly<{
  caseRef: string;
  lifecycleState: "submitted_for_review";
  overallReviewStatus: EvidenceReviewOperationalStatus;
  unresolvedFactCount: number;
  reviewAttentionReasons: readonly EvidenceReviewAttentionReason[];
  latestReviewActivityAt: string;
}>;

export type EvidenceReviewWorklistCaseV3 = Readonly<{
  caseRef: string;
  lifecycleState: "submitted_for_review";
  overallReviewStatus: "TO_REVIEW" | "REVIEW_MODEL_UNAVAILABLE";
  unresolvedFactCount: number;
  reviewAttentionReasons: readonly EvidenceReviewAttentionReason[];
  latestReviewActivityAt: string;
}>;

export type EvidenceReviewWorklistResponseV3 = Readonly<{
  schemaVersion: typeof EVIDENCE_REVIEW_WORKLIST_SCHEMA_VERSION;
  asOf: string;
  caseCount: number;
  cases: readonly EvidenceReviewWorklistCaseV3[];
}>;

const SOURCE_KEYS = [
  "case_ref",
  "latest_review_activity_at",
  "lifecycle_state",
  "overall_review_status",
  "review_attention_reasons",
  "unresolved_fact_count",
].sort().join("|");

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function parseSourceRow(
  input: unknown,
): AuthorizedEvidenceReviewSourceRowV3 | null {
  if (!isObject(input) || Object.keys(input).sort().join("|") !== SOURCE_KEYS) {
    return null;
  }
  if (
    typeof input.case_ref !== "string" ||
    input.case_ref !== input.case_ref.trim() ||
    input.case_ref.length < 8 || input.case_ref.length > 64 ||
    input.lifecycle_state !== "submitted_for_review" ||
    !isEvidenceReviewOperationalStatus(input.overall_review_status) ||
    !Number.isInteger(input.unresolved_fact_count) ||
    (input.unresolved_fact_count as number) < 0 ||
    !Array.isArray(input.review_attention_reasons) ||
    !input.review_attention_reasons.every((reason) =>
      EVIDENCE_REVIEW_ATTENTION_REASONS.includes(
        reason as EvidenceReviewAttentionReason,
      )
    ) ||
    new Set(input.review_attention_reasons).size !==
      input.review_attention_reasons.length ||
    !isIsoTimestamp(input.latest_review_activity_at)
  ) return null;

  const overallReviewStatus = input
    .overall_review_status as EvidenceReviewOperationalStatus;
  const reasons = input
    .review_attention_reasons as EvidenceReviewAttentionReason[];
  const unresolvedFactCount = input.unresolved_fact_count as number;
  if (
    (overallReviewStatus === "TO_REVIEW" &&
      (unresolvedFactCount < 1 ||
        reasons.join("|") !== "FACT_REVIEW_REQUIRED")) ||
    (overallReviewStatus === "REVIEW_MODEL_UNAVAILABLE" &&
      (unresolvedFactCount !== 0 ||
        reasons.join("|") !== "REVIEW_MODEL_UNAVAILABLE")) ||
    (["CORRECTION_REQUIRED", "WAITING_CUSTOMER", "REVIEW_COMPLETE"].includes(
      overallReviewStatus,
    ) &&
      (unresolvedFactCount !== 0 || reasons.length !== 0))
  ) return null;

  return Object.freeze({
    caseRef: input.case_ref,
    lifecycleState: input.lifecycle_state,
    overallReviewStatus,
    unresolvedFactCount,
    reviewAttentionReasons: Object.freeze([...reasons]),
    latestReviewActivityAt: input.latest_review_activity_at,
  });
}

export function parseAuthorizedEvidenceReviewSourceRows(
  input: unknown,
): readonly AuthorizedEvidenceReviewSourceRowV3[] | null {
  if (!isObject(input)) return null;
  if (
    Object.keys(input).sort().join("|") !== "code|ok|queue_rows|status" ||
    input.ok !== true || input.status !== 200 || input.code !== "ok" ||
    !Array.isArray(input.queue_rows)
  ) return null;

  const rows: AuthorizedEvidenceReviewSourceRowV3[] = [];
  const caseRefs = new Set<string>();
  for (const rawRow of input.queue_rows) {
    const row = parseSourceRow(rawRow);
    if (!row || caseRefs.has(row.caseRef)) return null;
    caseRefs.add(row.caseRef);
    rows.push(row);
  }
  return Object.freeze(rows);
}

export function buildEvidenceReviewWorklistResponse(
  asOf: string,
  sourceRows: readonly AuthorizedEvidenceReviewSourceRowV3[],
): EvidenceReviewWorklistResponseV3 | null {
  if (!isIsoTimestamp(asOf)) return null;

  const cases = sourceRows.filter((row): row is
    & AuthorizedEvidenceReviewSourceRowV3
    & Readonly<{
      overallReviewStatus: "TO_REVIEW" | "REVIEW_MODEL_UNAVAILABLE";
    }> =>
    row.overallReviewStatus === "TO_REVIEW" ||
    row.overallReviewStatus === "REVIEW_MODEL_UNAVAILABLE"
  ).map((row) =>
    Object.freeze({
      caseRef: row.caseRef,
      lifecycleState: row.lifecycleState,
      overallReviewStatus: row.overallReviewStatus,
      unresolvedFactCount: row.unresolvedFactCount,
      reviewAttentionReasons: row.reviewAttentionReasons,
      latestReviewActivityAt: row.latestReviewActivityAt,
    })
  ).sort((left, right) => {
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
