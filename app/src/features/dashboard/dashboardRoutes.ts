export const DASHBOARD_APPLICATIONS_ROUTE = "/dashboard/aanvragen";

const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type DashboardApplicationsRoute =
  | { kind: "index" }
  | { kind: "detail"; caseReference: string }
  | { kind: "unknown" };

export function buildDashboardApplicationRoute(caseReference: string): string {
  const normalized = caseReference.trim();
  if (!CASE_REFERENCE_RE.test(normalized)) return DASHBOARD_APPLICATIONS_ROUTE;
  return `${DASHBOARD_APPLICATIONS_ROUTE}/${normalized}`;
}

export function parseDashboardApplicationsRoute(
  path: string,
): DashboardApplicationsRoute | null {
  if (path === DASHBOARD_APPLICATIONS_ROUTE) return { kind: "index" };
  const prefix = `${DASHBOARD_APPLICATIONS_ROUTE}/`;
  if (!path.startsWith(prefix)) return null;
  const caseReference = path.slice(prefix.length);
  if (!CASE_REFERENCE_RE.test(caseReference)) return { kind: "unknown" };
  return { kind: "detail", caseReference };
}
