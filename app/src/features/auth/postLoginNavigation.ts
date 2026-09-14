import { parseEvidenceReviewDetailRoute } from "../evidence-review/evidenceReviewRoutes.ts";
import { parseDashboardApplicationsRoute } from "../dashboard/dashboardRoutes.ts";
import { AUTH_LOGIN_ROUTE } from "./authUxFlow.ts";

export const DEFAULT_POST_LOGIN_DESTINATION = "/dashboard";
export const INTERNAL_LOGIN_ROUTE = AUTH_LOGIN_ROUTE;
export const POST_LOGIN_RETURN_QUERY_KEY = "returnTo";

const SAFE_INTERNAL_RETURN_ROUTES = new Set([
  "/beheer",
  "/beheer/dossiers",
  "/intern/compliance",
  "/intern/dossiers",
]);

export function normalizeSafeInternalReturnRoute(
  value: string | null | undefined,
): string | null {
  if (!value || value !== value.trim()) return null;
  const dashboardRoute = parseDashboardApplicationsRoute(value);
  return SAFE_INTERNAL_RETURN_ROUTES.has(value) ||
      parseEvidenceReviewDetailRoute(value) ||
      dashboardRoute?.kind === "detail"
    ? value
    : null;
}

export function buildInternalLoginRoute(returnTo: string): string {
  const safeReturnTo = normalizeSafeInternalReturnRoute(returnTo);
  if (!safeReturnTo) return INTERNAL_LOGIN_ROUTE;

  const query = new URLSearchParams({
    [POST_LOGIN_RETURN_QUERY_KEY]: safeReturnTo,
  });
  return `${INTERNAL_LOGIN_ROUTE}?${query.toString()}`;
}

export function readSafePostLoginReturnRoute(search: string): string | null {
  const query = new URLSearchParams(search);
  const values = query.getAll(POST_LOGIN_RETURN_QUERY_KEY);
  if (values.length !== 1) return null;
  return normalizeSafeInternalReturnRoute(values[0]);
}

export function resolvePostLoginDestination(search: string): string {
  return readSafePostLoginReturnRoute(search) ?? DEFAULT_POST_LOGIN_DESTINATION;
}
