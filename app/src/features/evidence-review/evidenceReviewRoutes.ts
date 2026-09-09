const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const DETAIL_ROUTE_RE =
  /^\/(?:beheer|intern)\/dossiers\/(CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/i;

export const EVIDENCE_REVIEW_WORKLIST_GROUP_ANCHORS = Object.freeze(
  {
    toReview: "interne-beoordeling",
    waitingCustomer: "wacht-op-klant",
    complete: "afgerond",
    otherActive: "overige-actieve-dossiers",
  } as const,
);

export type EvidenceReviewWorklistGroup =
  keyof typeof EVIDENCE_REVIEW_WORKLIST_GROUP_ANCHORS;

export function isEvidenceReviewCaseRef(value: string): boolean {
  return value === value.trim() && CASE_REFERENCE_RE.test(value);
}

export function buildEvidenceReviewDetailRoute(caseRef: string): string | null {
  return isEvidenceReviewCaseRef(caseRef)
    ? `/beheer/dossiers/${caseRef}`
    : null;
}

export function buildEvidenceReviewWorklistGroupRoute(
  group: EvidenceReviewWorklistGroup,
): string {
  return `/beheer/dossiers#${EVIDENCE_REVIEW_WORKLIST_GROUP_ANCHORS[group]}`;
}

export function parseEvidenceReviewDetailRoute(path: string): string | null {
  if (path !== path.trim()) return null;
  return path.match(DETAIL_ROUTE_RE)?.[1] ?? null;
}
