import { parseEvidenceReviewDetailRoute } from "../evidence-review/evidenceReviewRoutes.ts";
import { parseDashboardApplicationsRoute } from "../dashboard/dashboardRoutes.ts";
import { AUTH_LOGIN_ROUTE } from "./authUxFlow.ts";
import type {
  AuthorizedPortal,
  AuthorizedPortalNavigation,
} from "./authTypes.ts";

export const DEFAULT_POST_LOGIN_DESTINATION = "/dashboard";
export const INTERNAL_LOGIN_ROUTE = AUTH_LOGIN_ROUTE;
export const POST_LOGIN_RETURN_QUERY_KEY = "returnTo";

const SAFE_INTERNAL_RETURN_ROUTES = new Set([
  "/beheer",
  "/beheer/dossiers",
  "/intern/compliance",
  "/intern/dossiers",
]);

const WORKFORCE_RETURN_ROUTES = new Set(SAFE_INTERNAL_RETURN_ROUTES);

export type AuthorizedPostLoginDecision =
  | Readonly<{ kind: "redirect"; destination: string }>
  | Readonly<{ kind: "choose"; portals: readonly AuthorizedPortal[] }>
  | Readonly<{ kind: "denied" }>;

export function canSwitchAuthorizedPortal(
  navigation: AuthorizedPortalNavigation | null,
): boolean {
  return new Set(navigation?.portals ?? []).size > 1;
}

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

function portalForRoute(route: string): AuthorizedPortal | null {
  if (
    WORKFORCE_RETURN_ROUTES.has(route) ||
    parseEvidenceReviewDetailRoute(route)
  ) return "workforce";
  return parseDashboardApplicationsRoute(route)?.kind === "detail"
    ? "customer"
    : null;
}

export function readRequestedPortal(search: string): AuthorizedPortal | null {
  const returnTo = readSafePostLoginReturnRoute(search);
  return returnTo ? portalForRoute(returnTo) : null;
}

export function resolveAuthorizedPostLoginDecision(
  search: string,
  navigation: AuthorizedPortalNavigation,
): AuthorizedPostLoginDecision {
  const portals = [...new Set(navigation.portals)];
  const returnTo = readSafePostLoginReturnRoute(search);
  const returnPortal = readRequestedPortal(search);
  const customerRoute = returnTo
    ? parseDashboardApplicationsRoute(returnTo)
    : null;
  const workforceDetail = returnTo
    ? parseEvidenceReviewDetailRoute(returnTo)
    : null;
  const returnAuthorized = returnPortal === "customer"
    ? customerRoute?.kind === "detail" &&
      navigation.customerCaseReferences.includes(customerRoute.caseReference)
    : returnPortal === "workforce"
    ? (workforceDetail !== null && navigation.workforceEvidenceReview &&
      navigation.workforceCaseReferences.includes(
        workforceDetail,
      )) ||
      (returnTo === "/beheer" && navigation.workforceEvidenceReview) ||
      (["/beheer/dossiers", "/intern/dossiers"].includes(returnTo ?? "") &&
        navigation.workforceEvidenceReview) ||
      (returnTo === "/intern/compliance" && navigation.workforceCompliance)
    : false;
  if (
    returnTo && returnPortal && portals.includes(returnPortal) &&
    returnAuthorized
  ) {
    return { kind: "redirect", destination: returnTo };
  }
  if (portals.length === 1) {
    if (
      portals[0] === "workforce" &&
      !navigation.workforceDefaultDestination
    ) return { kind: "denied" };
    return {
      kind: "redirect",
      destination: portals[0] === "workforce"
        ? navigation.workforceDefaultDestination!
        : DEFAULT_POST_LOGIN_DESTINATION,
    };
  }
  if (portals.length > 1) {
    return { kind: "choose", portals: Object.freeze(portals) };
  }
  return { kind: "denied" };
}
