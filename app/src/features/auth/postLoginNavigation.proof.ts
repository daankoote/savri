import {
  buildInternalLoginRoute,
  DEFAULT_POST_LOGIN_DESTINATION,
  INTERNAL_LOGIN_ROUTE,
  normalizeSafeInternalReturnRoute,
  readSafePostLoginReturnRoute,
  resolvePostLoginDestination,
} from "./postLoginNavigation.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));

const dossiersLogin = buildInternalLoginRoute("/intern/dossiers");
const complianceLogin = buildInternalLoginRoute("/intern/compliance");
const detailRoute = "/intern/dossiers/CASE-7E4CC75CD19F";
const detailLogin = buildInternalLoginRoute(detailRoute);
const operatorLogin = buildInternalLoginRoute("/beheer");
const operatorDossiersLogin = buildInternalLoginRoute("/beheer/dossiers");
assert(
  dossiersLogin === "/inloggen?returnTo=%2Fintern%2Fdossiers" &&
    resolvePostLoginDestination(new URL(dossiersLogin, "https://enval.local").search) ===
      "/intern/dossiers",
  "Q01_dossiers_login_return_invalid",
);
assert(
  complianceLogin === "/inloggen?returnTo=%2Fintern%2Fcompliance" &&
    resolvePostLoginDestination(new URL(complianceLogin, "https://enval.local").search) ===
      "/intern/compliance",
  "Q02_compliance_login_return_invalid",
);
assert(
  detailLogin ===
      "/inloggen?returnTo=%2Fintern%2Fdossiers%2FCASE-7E4CC75CD19F" &&
    resolvePostLoginDestination(new URL(detailLogin, "https://enval.local").search) ===
      detailRoute,
  "Q02b_detail_login_return_invalid",
);
assert(
  resolvePostLoginDestination("") === DEFAULT_POST_LOGIN_DESTINATION &&
    DEFAULT_POST_LOGIN_DESTINATION === "/dashboard" &&
    INTERNAL_LOGIN_ROUTE === "/inloggen",
  "Q03_normal_login_destination_changed",
);
assert(
  operatorLogin === "/inloggen?returnTo=%2Fbeheer" &&
    operatorDossiersLogin === "/inloggen?returnTo=%2Fbeheer%2Fdossiers" &&
    resolvePostLoginDestination(
      new URL(operatorDossiersLogin, "https://enval.local").search,
    ) === "/beheer/dossiers",
  "Q03b_operator_login_return_invalid",
);

for (const target of [
  "https://attacker.invalid/intern/dossiers",
  "http://attacker.invalid/intern/dossiers",
  "//attacker.invalid/intern/dossiers",
  "javascript:alert(1)",
  "data:text/html,invalid",
  "/intern/dossiers/../compliance",
  "/intern/dossiers/CASE-NOT-HEX",
  "/intern/dossiers/CASE-7E4CC75CD19F/extra",
  "/intern/dossiers/CASE-7E4CC75CD19F?next=/dashboard",
  "/intern/dossiers/CASE-7E4CC75CD19F/",
  "/intern/dossiers?next=https://attacker.invalid",
  "/intern/%E0%A4%A",
  " /intern/dossiers",
  "/account",
  "/inloggen",
  "/dashboard",
]) {
  assert(
    normalizeSafeInternalReturnRoute(target) === null &&
      buildInternalLoginRoute(target) === INTERNAL_LOGIN_ROUTE,
    `Q04_unsafe_target_accepted:${target}`,
  );
}
assert(
  readSafePostLoginReturnRoute(
    "?returnTo=%2Fintern%2Fdossiers&returnTo=%2Fintern%2Fcompliance",
  ) === null &&
    resolvePostLoginDestination("?returnTo=%2F%2Fattacker.invalid") ===
      DEFAULT_POST_LOGIN_DESTINATION,
  "Q05_ambiguous_or_protocol_relative_target_accepted",
);

const [
  appSource,
  routeTypesSource,
  guardSource,
  accountSource,
  authProviderSource,
  dossiersPageSource,
  dossierDetailPageSource,
  dossierRouteSource,
  compliancePageSource,
  dashboardPageSource,
  signupSource,
  evidenceEndpointSource,
  complianceEndpointSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/routes/types.ts"),
  source("app/src/features/operator/OperatorRouteGuard.tsx"),
  source("app/src/features/auth/AccountPage.tsx"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("app/src/pages/EvidenceReviewWorklistPage.tsx"),
  source("app/src/pages/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/features/evidence-review/evidenceReviewRoutes.ts"),
  source("app/src/pages/ComplianceWorklistPage.tsx"),
  source("app/src/pages/DashboardPage.tsx"),
  source("app/src/features/signup/SignupPageShell.tsx"),
  source("supabase/functions/api-app-evidence-review-worklist/index.ts"),
  source("supabase/functions/api-app-compliance-worklist/index.ts"),
]);

assert(
  guardSource.includes("buildInternalLoginRoute(returnTo)") &&
    guardSource.includes('auth.status === "signed_out"') &&
    dossiersPageSource.includes("returnTo={currentPath}") &&
    dossierDetailPageSource.includes("returnTo={currentPath}") &&
    compliancePageSource.includes("returnTo={currentPath}") &&
    dossierRouteSource.includes("DETAIL_ROUTE_RE") &&
    !dashboardPageSource.includes("returnTo="),
  "Q06_shared_guard_return_intent_not_reused",
);
assert(
  accountSource.includes("resolvePostLoginDestination(") &&
    accountSource.includes("window.location.search") &&
    accountSource.includes("navigate(postLoginDestination, { replace: true })") &&
    accountSource.includes("auth.signInWithPassword") &&
    authProviderSource.includes("signInWithSupabasePassword") &&
    authProviderSource.includes("bootstrapAppCustomerAuth"),
  "Q07_existing_auth_flow_not_reused",
);
assert(
  appSource.includes("path === AUTH_ACCOUNT_COMPATIBILITY_ROUTE") &&
    appSource.includes("path === AUTH_LOGIN_ROUTE") &&
    appSource.includes("parseEvidenceReviewDetailRoute(path)") &&
    appSource.includes("target.search") &&
    appSource.includes("window.history.replaceState") &&
    appSource.includes("window.history.pushState") &&
    appSource.includes('window.addEventListener("popstate"'),
  "Q08_router_refresh_or_history_model_invalid",
);
assert(
  routeTypesSource.includes("replace?: boolean") &&
    guardSource.includes("replace: true") &&
    accountSource.includes("{ replace: true }") &&
    accountSource.includes("hasNavigatedRef.current") &&
    !guardSource.includes("window.location") &&
    !accountSource.includes("window.location.href"),
  "Q09_redirect_loop_or_external_navigation_risk",
);
assert(
  ![guardSource, accountSource, appSource].some((value) =>
    /(localStorage|sessionStorage|role\s*===|email\s*===|capability\s*===|tenantId|tenant_id)/i
      .test(value)
  ),
  "Q10_client_authority_or_long_lived_state_added",
);
assert(
  evidenceEndpointSource.includes("requireVerifiedSupabaseAuthUser") &&
    evidenceEndpointSource.includes("app_evidence_review_worklist_source_read_v4") &&
    complianceEndpointSource.includes("requireVerifiedSupabaseAuthUser") &&
    complianceEndpointSource.includes(
      "app_compliance_worklist_source_events_read_v1",
    ),
  "Q11_server_authority_changed",
);
assert(
  authProviderSource.includes('setStatus("signed_out")') &&
    guardSource.includes("buildInternalLoginRoute") &&
    !guardSource.includes("setTimeout") &&
    !accountSource.includes("setTimeout"),
  "Q12_expired_auth_or_redirect_loop_behavior_invalid",
);
assert(
  signupSource.includes('navigate("/dashboard")') &&
    dashboardPageSource.includes("DashboardPageShell") &&
    !signupSource.includes("returnTo") &&
    !dashboardPageSource.includes("postLogin"),
  "Q13_customer_signup_or_dashboard_flow_changed",
);

console.log("AUTHENTICATED_INTERNAL_NAVIGATION_Q01_Q13=PASS");
Deno.exit(0);
