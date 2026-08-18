const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const DETAIL_ROUTE_RE =
  /^\/intern\/dossiers\/(CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/i;

export function isEvidenceReviewCaseRef(value: string): boolean {
  return value === value.trim() && CASE_REFERENCE_RE.test(value);
}

export function buildEvidenceReviewDetailRoute(caseRef: string): string | null {
  return isEvidenceReviewCaseRef(caseRef)
    ? `/intern/dossiers/${caseRef}`
    : null;
}

export function parseEvidenceReviewDetailRoute(path: string): string | null {
  if (path !== path.trim()) return null;
  return path.match(DETAIL_ROUTE_RE)?.[1] ?? null;
}
