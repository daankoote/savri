export const EVIDENCE_REVIEW_WORKLIST_SCHEMA_VERSION =
  "evidence-review-worklist-v2" as const;

export const EVIDENCE_REVIEW_ATTENTION_REASONS = Object.freeze(
  [
    "FACT_REVIEW_REQUIRED",
    "REVIEW_MODEL_UNAVAILABLE",
  ] as const,
);

export type EvidenceReviewAttentionReason =
  (typeof EVIDENCE_REVIEW_ATTENTION_REASONS)[number];

type JsonObject = Record<string, unknown>;

export type EvidenceReviewQueueState =
  | "ACTIVE_REVIEW"
  | "WAITING_CUSTOMER"
  | "REVIEW_COMPLETE"
  | "REVIEW_MODEL_UNAVAILABLE";

export type AuthorizedEvidenceReviewSourceRowV2 = Readonly<{
  caseRef: string;
  lifecycleState: "submitted_for_review";
  queueState: EvidenceReviewQueueState;
  unresolvedFactCount: number;
  reviewAttentionReasons: readonly EvidenceReviewAttentionReason[];
  latestReviewActivityAt: string;
}>;

export type EvidenceReviewWorklistCaseV2 = Readonly<{
  caseRef: string;
  lifecycleState: "submitted_for_review";
  queueState: "ACTIVE_REVIEW" | "REVIEW_MODEL_UNAVAILABLE";
  unresolvedFactCount: number;
  reviewAttentionReasons: readonly EvidenceReviewAttentionReason[];
  latestReviewActivityAt: string;
}>;

export type EvidenceReviewWorklistResponseV2 = Readonly<{
  schemaVersion: typeof EVIDENCE_REVIEW_WORKLIST_SCHEMA_VERSION;
  asOf: string;
  caseCount: number;
  cases: readonly EvidenceReviewWorklistCaseV2[];
}>;

const SOURCE_KEYS = [
  "case_ref",
  "latest_review_activity_at",
  "lifecycle_state",
  "queue_state",
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
): AuthorizedEvidenceReviewSourceRowV2 | null {
  if (!isObject(input) || Object.keys(input).sort().join("|") !== SOURCE_KEYS) {
    return null;
  }
  if (
    typeof input.case_ref !== "string" ||
    input.case_ref !== input.case_ref.trim() ||
    input.case_ref.length < 8 || input.case_ref.length > 64 ||
    input.lifecycle_state !== "submitted_for_review" ||
    ![
      "ACTIVE_REVIEW",
      "WAITING_CUSTOMER",
      "REVIEW_COMPLETE",
      "REVIEW_MODEL_UNAVAILABLE",
    ].includes(input.queue_state as string) ||
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

  const queueState = input.queue_state as EvidenceReviewQueueState;
  const reasons = input
    .review_attention_reasons as EvidenceReviewAttentionReason[];
  const unresolvedFactCount = input.unresolved_fact_count as number;
  if (
    (queueState === "ACTIVE_REVIEW" &&
      (unresolvedFactCount < 1 ||
        reasons.join("|") !== "FACT_REVIEW_REQUIRED")) ||
    (queueState === "REVIEW_MODEL_UNAVAILABLE" &&
      (unresolvedFactCount !== 0 ||
        reasons.join("|") !== "REVIEW_MODEL_UNAVAILABLE")) ||
    (["WAITING_CUSTOMER", "REVIEW_COMPLETE"].includes(queueState) &&
      (unresolvedFactCount !== 0 || reasons.length !== 0))
  ) return null;

  return Object.freeze({
    caseRef: input.case_ref,
    lifecycleState: input.lifecycle_state,
    queueState,
    unresolvedFactCount,
    reviewAttentionReasons: Object.freeze([...reasons]),
    latestReviewActivityAt: input.latest_review_activity_at,
  });
}

export function parseAuthorizedEvidenceReviewSourceRows(
  input: unknown,
): readonly AuthorizedEvidenceReviewSourceRowV2[] | null {
  if (!isObject(input)) return null;
  if (
    Object.keys(input).sort().join("|") !== "code|ok|queue_rows|status" ||
    input.ok !== true || input.status !== 200 || input.code !== "ok" ||
    !Array.isArray(input.queue_rows)
  ) return null;

  const rows: AuthorizedEvidenceReviewSourceRowV2[] = [];
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
  sourceRows: readonly AuthorizedEvidenceReviewSourceRowV2[],
): EvidenceReviewWorklistResponseV2 | null {
  if (!isIsoTimestamp(asOf)) return null;

  const cases = sourceRows.filter((row): row is
    & AuthorizedEvidenceReviewSourceRowV2
    & Readonly<{
      queueState: "ACTIVE_REVIEW" | "REVIEW_MODEL_UNAVAILABLE";
    }> =>
    row.queueState === "ACTIVE_REVIEW" ||
    row.queueState === "REVIEW_MODEL_UNAVAILABLE"
  ).map((row) =>
    Object.freeze({
      caseRef: row.caseRef,
      lifecycleState: row.lifecycleState,
      queueState: row.queueState,
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
