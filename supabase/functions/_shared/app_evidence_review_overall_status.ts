export const EVIDENCE_REVIEW_OVERALL_STATUSES = Object.freeze(
  [
    "TO_REVIEW",
    "CORRECTION_REQUIRED",
    "WAITING_CUSTOMER",
    "REVIEW_COMPLETE",
  ] as const,
);

export type EvidenceReviewOverallStatus =
  (typeof EVIDENCE_REVIEW_OVERALL_STATUSES)[number];

export type EvidenceReviewOperationalStatus =
  | EvidenceReviewOverallStatus
  | "REVIEW_MODEL_UNAVAILABLE";

export function isEvidenceReviewOperationalStatus(
  value: unknown,
): value is EvidenceReviewOperationalStatus {
  return value === "REVIEW_MODEL_UNAVAILABLE" ||
    EVIDENCE_REVIEW_OVERALL_STATUSES.includes(
      value as EvidenceReviewOverallStatus,
    );
}
