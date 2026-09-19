import {
  buildInternalLoginRoute,
  canSwitchAuthorizedPortal,
  DEFAULT_POST_LOGIN_DESTINATION,
  INTERNAL_LOGIN_ROUTE,
  normalizeSafeInternalReturnRoute,
  readRequestedPortal,
  readSafePostLoginReturnRoute,
  resolveAuthorizedPostLoginDecision,
  resolvePostLoginDestination,
} from "./postLoginNavigation.ts";
import {
  clearAuthorizedPortalAccessSessionCache,
  resolveAuthorizedPortalAccess,
  resolveAuthorizedPortalAccessOnce,
} from "./authorizedPortalAccess.ts";
import type { AuthBootstrapResult } from "./authBootstrapClient.ts";
import type { OperatorContextLoadResult } from "../operator/operatorContextClient.ts";
import type { EvidenceReviewWorklistLoadResult } from "../evidence-review/evidenceReviewWorklistClient.ts";
import type { AuthorizedPortalNavigation } from "./authTypes.ts";

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
const customerDetailRoute = "/dashboard/aanvragen/CASE-7E4CC75CD19F";
const customerDetailLogin = buildInternalLoginRoute(customerDetailRoute);
const customerNavigation: AuthorizedPortalNavigation = {
  portals: ["customer"],
  customerCaseReferences: ["CASE-7E4CC75CD19F"],
  workforceCaseReferences: [],
  workforceDefaultDestination: null,
  workforceEvidenceReview: false,
  workforceCompliance: false,
};
const workforceEvidenceNavigation: AuthorizedPortalNavigation = {
  portals: ["workforce"],
  customerCaseReferences: [],
  workforceCaseReferences: ["CASE-7E4CC75CD19F"],
  workforceDefaultDestination: "/beheer",
  workforceEvidenceReview: true,
  workforceCompliance: false,
};
const workforceComplianceNavigation: AuthorizedPortalNavigation = {
  portals: ["workforce"],
  customerCaseReferences: [],
  workforceCaseReferences: [],
  workforceDefaultDestination: "/intern/compliance",
  workforceEvidenceReview: false,
  workforceCompliance: true,
};
const bothNavigation: AuthorizedPortalNavigation = {
  ...workforceEvidenceNavigation,
  portals: ["customer", "workforce"],
  customerCaseReferences: customerNavigation.customerCaseReferences,
};
const noNavigation: AuthorizedPortalNavigation = {
  portals: [],
  customerCaseReferences: [],
  workforceCaseReferences: [],
  workforceDefaultDestination: null,
  workforceEvidenceReview: false,
  workforceCompliance: false,
};
assert(
  dossiersLogin === "/inloggen?returnTo=%2Fintern%2Fdossiers" &&
    resolvePostLoginDestination(
        new URL(dossiersLogin, "https://enval.local").search,
      ) ===
      "/intern/dossiers",
  "Q01_dossiers_login_return_invalid",
);
assert(
  complianceLogin === "/inloggen?returnTo=%2Fintern%2Fcompliance" &&
    resolvePostLoginDestination(
        new URL(complianceLogin, "https://enval.local").search,
      ) ===
      "/intern/compliance",
  "Q02_compliance_login_return_invalid",
);
assert(
  detailLogin ===
      "/inloggen?returnTo=%2Fintern%2Fdossiers%2FCASE-7E4CC75CD19F" &&
    resolvePostLoginDestination(
        new URL(detailLogin, "https://enval.local").search,
      ) ===
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
assert(
  customerDetailLogin ===
      "/inloggen?returnTo=%2Fdashboard%2Faanvragen%2FCASE-7E4CC75CD19F" &&
    resolvePostLoginDestination(
        new URL(customerDetailLogin, "https://enval.local").search,
      ) === customerDetailRoute,
  "Q03c_customer_detail_login_return_invalid",
);

for (
  const target of [
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
    "/dashboard/aanvragen",
    "/dashboard/aanvragen/CASE-NOT-HEX",
    "/dashboard/aanvragen/CASE-7E4CC75CD19F?next=/beheer",
    "/dashboard/aanvragen/CASE-7E4CC75CD19F/extra",
  ]
) {
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
assert(
  readRequestedPortal(`?returnTo=${encodeURIComponent(detailRoute)}`) ===
      "workforce" &&
    readRequestedPortal(
        `?returnTo=${encodeURIComponent(customerDetailRoute)}`,
      ) === "customer" &&
    readRequestedPortal("?returnTo=https%3A%2F%2Fattacker.invalid") === null,
  "Q05a_requested_portal_presentation_intent_invalid",
);

assert(
  JSON.stringify(
        resolveAuthorizedPostLoginDecision(
          `?returnTo=${encodeURIComponent(customerDetailRoute)}`,
          customerNavigation,
        ),
      ) ===
      JSON.stringify({ kind: "redirect", destination: customerDetailRoute }) &&
    JSON.stringify(
        resolveAuthorizedPostLoginDecision(
          `?returnTo=${encodeURIComponent(detailRoute)}`,
          workforceEvidenceNavigation,
        ),
      ) === JSON.stringify({ kind: "redirect", destination: detailRoute }),
  "Q05b_authorized_return_route_not_followed_exactly",
);
assert(
  JSON.stringify(
        resolveAuthorizedPostLoginDecision(
          `?returnTo=${encodeURIComponent(customerDetailRoute)}`,
          workforceEvidenceNavigation,
        ),
      ) === JSON.stringify({ kind: "redirect", destination: "/beheer" }) &&
    JSON.stringify(
        resolveAuthorizedPostLoginDecision(
          `?returnTo=${encodeURIComponent(detailRoute)}`,
          customerNavigation,
        ),
      ) === JSON.stringify({ kind: "redirect", destination: "/dashboard" }),
  "Q05c_stale_cross_portal_return_not_replaced_safely",
);
assert(
  JSON.stringify(resolveAuthorizedPostLoginDecision("", customerNavigation)) ===
      JSON.stringify({ kind: "redirect", destination: "/dashboard" }) &&
    JSON.stringify(
        resolveAuthorizedPostLoginDecision("", workforceEvidenceNavigation),
      ) ===
      JSON.stringify({ kind: "redirect", destination: "/beheer" }) &&
    JSON.stringify(
        resolveAuthorizedPostLoginDecision("", bothNavigation),
      ) ===
      JSON.stringify({ kind: "choose", portals: ["customer", "workforce"] }) &&
    JSON.stringify(resolveAuthorizedPostLoginDecision("", noNavigation)) ===
      JSON.stringify({ kind: "denied" }),
  "Q05d_portal_count_decision_invalid",
);
assert(
  canSwitchAuthorizedPortal(bothNavigation) &&
    !canSwitchAuthorizedPortal(customerNavigation) &&
    !canSwitchAuthorizedPortal(workforceEvidenceNavigation) &&
    !canSwitchAuthorizedPortal(noNavigation) &&
    !canSwitchAuthorizedPortal(null),
  "Q05da_portal_switch_visibility_not_authority_bounded",
);
for (
  const search of [
    "?returnTo=https%3A%2F%2Fattacker.invalid",
    "?returnTo=%2F%2Fattacker.invalid",
    "?returnTo=%2Fonbekend",
    "?returnTo=%E0%A4%A",
  ]
) {
  assert(
    JSON.stringify(
      resolveAuthorizedPostLoginDecision(search, customerNavigation),
    ) ===
      JSON.stringify({ kind: "redirect", destination: "/dashboard" }),
    `Q05e_unsafe_return_changed_portal_authority:${search}`,
  );
}
assert(
  JSON.stringify(
        resolveAuthorizedPostLoginDecision("", workforceComplianceNavigation),
      ) ===
      JSON.stringify({ kind: "redirect", destination: "/intern/compliance" }) &&
    JSON.stringify(
        resolveAuthorizedPostLoginDecision(
          "?returnTo=%2Fbeheer%2Fdossiers",
          workforceComplianceNavigation,
        ),
      ) ===
      JSON.stringify({ kind: "redirect", destination: "/intern/compliance" }) &&
    JSON.stringify(
        resolveAuthorizedPostLoginDecision(
          "?returnTo=%2Fintern%2Fcompliance",
          workforceEvidenceNavigation,
        ),
      ) === JSON.stringify({ kind: "redirect", destination: "/beheer" }),
  "Q05i_workforce_capability_routes_or_landing_invalid",
);
assert(
  JSON.stringify(
    resolveAuthorizedPostLoginDecision(
      "?returnTo=%2Fdashboard%2Faanvragen%2FCASE-000000000001",
      customerNavigation,
    ),
  ) === JSON.stringify({ kind: "redirect", destination: "/dashboard" }),
  "Q05j_foreign_customer_case_return_followed",
);
assert(
  JSON.stringify(
    resolveAuthorizedPostLoginDecision(
      "?returnTo=%2Fintern%2Fdossiers%2FCASE-000000000001",
      workforceEvidenceNavigation,
    ),
  ) === JSON.stringify({ kind: "redirect", destination: "/beheer" }),
  "Q05k_foreign_workforce_case_return_followed",
);

const customerAllow: AuthBootstrapResult = {
  ok: true,
  summary: {
    schema_version: "auth_bootstrap_browser_v3",
    authenticated: true,
    binding_status: "bound",
    portal_contexts: ["customer"],
    dossiers: [{
      dossier_id: "11111111-1111-4111-8111-111111111111",
      dossier_number: "D-1",
      account_type: "particulier",
      portal_context: "customer",
      status: "ACTIVE",
      case_id: "22222222-2222-4222-8222-222222222222",
      case_reference: "CASE-7E4CC75CD19F",
    }],
  },
};
const customerDeny: AuthBootstrapResult = {
  ok: false,
  error: {
    code: "portal_context_not_authorized",
    message: "safe denial",
  },
  status: 403,
  bindingStatus: "denied",
};
const workforceAllow: OperatorContextLoadResult = {
  ok: true,
  value: {
    actorType: "tenant_workforce",
    tenantReference: "a".repeat(64),
    effectiveCapabilities: ["evidence.review.view"],
    active: true,
    authorized: true,
  },
};
const workforceDeny: OperatorContextLoadResult = {
  ok: false,
  error: { code: "not_workforce", message: "safe denial" },
  status: 403,
};
const complianceWorkforceAllow: OperatorContextLoadResult = {
  ok: true,
  value: {
    actorType: "tenant_workforce",
    tenantReference: "b".repeat(64),
    effectiveCapabilities: ["compliance.delivery_year.view"],
    active: true,
    authorized: true,
  },
};
const evidenceWorklistAllow: EvidenceReviewWorklistLoadResult = {
  ok: true,
  value: {
    schemaVersion: "evidence-review-worklist-v4",
    asOf: "2026-09-18T08:00:00.000Z",
    caseCount: 1,
    cases: [{
      caseRef: "CASE-7E4CC75CD19F",
      lifecycleState: "submitted_for_review",
      overallReviewStatus: "TO_REVIEW",
      unresolvedFactCount: 1,
      reviewAttentionReasons: ["FACT_REVIEW_REQUIRED"],
      latestReviewActivityAt: "2026-09-18T08:00:00.000Z",
    }],
  },
};
const evidenceWorklistUnavailable: EvidenceReviewWorklistLoadResult = {
  ok: false,
  error: {
    code: "service_unavailable",
    message: "safe failure",
  },
};

async function resolvedPortals(
  customer: AuthBootstrapResult,
  workforce: OperatorContextLoadResult,
  evidenceWorklist: EvidenceReviewWorklistLoadResult = evidenceWorklistAllow,
) {
  return await resolveAuthorizedPortalAccess({
    accessToken: "local-proof-token",
    idempotencyKey: "local-proof-idempotency",
    loadCustomer: async () => customer,
    loadWorkforce: async () => workforce,
    loadEvidenceWorklist: async () => evidenceWorklist,
  });
}

const customerOnly = await resolvedPortals(customerAllow, workforceDeny);
const workforceOnly = await resolvedPortals(customerDeny, workforceAllow);
const bothPortals = await resolvedPortals(customerAllow, workforceAllow);
const noPortals = await resolvedPortals(customerDeny, workforceDeny);
const complianceOnly = await resolvedPortals(
  customerDeny,
  complianceWorkforceAllow,
);
const workforceWithoutSafeCases = await resolvedPortals(
  customerDeny,
  workforceAllow,
  evidenceWorklistUnavailable,
);
assert(
  customerOnly.ok &&
    customerOnly.navigation.portals.join(",") === "customer" &&
    customerOnly.navigation.customerCaseReferences.join(",") ===
      "CASE-7E4CC75CD19F" &&
    workforceOnly.ok &&
    workforceOnly.navigation.portals.join(",") === "workforce" &&
    workforceOnly.navigation.workforceDefaultDestination === "/beheer" &&
    workforceOnly.navigation.workforceCaseReferences.join(",") ===
      "CASE-7E4CC75CD19F" &&
    bothPortals.ok &&
    bothPortals.navigation.portals.join(",") === "customer,workforce" &&
    noPortals.ok && noPortals.navigation.portals.length === 0 &&
    complianceOnly.ok &&
    complianceOnly.navigation.workforceDefaultDestination ===
      "/intern/compliance" &&
    complianceOnly.navigation.workforceCompliance &&
    !complianceOnly.navigation.workforceEvidenceReview &&
    workforceWithoutSafeCases.ok &&
    workforceWithoutSafeCases.navigation.workforceCaseReferences.length ===
      0 &&
    JSON.stringify(
        resolveAuthorizedPostLoginDecision(
          `?returnTo=${encodeURIComponent(detailRoute)}`,
          workforceWithoutSafeCases.navigation,
        ),
      ) === JSON.stringify({ kind: "redirect", destination: "/beheer" }),
  "Q05f_server_authority_portal_matrix_invalid",
);
const unsafeAuthorityFailure = await resolvedPortals(
  {
    ok: false,
    error: { code: "invalid_response", message: "safe failure" },
  },
  workforceDeny,
);
assert(
  !unsafeAuthorityFailure.ok &&
    unsafeAuthorityFailure.error.code === "invalid_response",
  "Q05g_invalid_authority_response_not_fail_closed",
);
const customerDespiteWorkforceFailure = await resolvedPortals(customerAllow, {
  ok: false,
  error: { code: "service_unavailable", message: "safe failure" },
});
assert(
  customerDespiteWorkforceFailure.ok &&
    customerDespiteWorkforceFailure.navigation.portals.join(",") ===
      "customer",
  "Q05h_proven_portal_lost_to_unrelated_authority_failure",
);

clearAuthorizedPortalAccessSessionCache();
let cachedCustomerReads = 0;
let cachedWorkforceReads = 0;
let cachedWorklistReads = 0;
const cachedInput = {
  accessToken: "local-session-cache-token",
  idempotencyKey: "local-session-cache-idempotency",
  loadCustomer: async () => {
    cachedCustomerReads += 1;
    return customerAllow;
  },
  loadWorkforce: async () => {
    cachedWorkforceReads += 1;
    return workforceAllow;
  },
  loadEvidenceWorklist: async () => {
    cachedWorklistReads += 1;
    return evidenceWorklistAllow;
  },
};
const firstPortalResolution = resolveAuthorizedPortalAccessOnce(cachedInput);
const reusedPortalResolution = resolveAuthorizedPortalAccessOnce(cachedInput);
const [firstPortalResult, reusedPortalResult] = await Promise.all([
  firstPortalResolution,
  reusedPortalResolution,
]);
assert(
  firstPortalResolution === reusedPortalResolution &&
    firstPortalResult.ok && reusedPortalResult.ok &&
    cachedCustomerReads === 1 && cachedWorkforceReads === 1 &&
    cachedWorklistReads === 1,
  "Q05l_same_session_portal_resolution_not_reused",
);
clearAuthorizedPortalAccessSessionCache();
await resolveAuthorizedPortalAccessOnce(cachedInput);
assert(
  Number(cachedCustomerReads) === 2 && Number(cachedWorkforceReads) === 2 &&
    Number(cachedWorklistReads) === 2,
  "Q05m_portal_resolution_cache_not_cleared_with_session",
);
clearAuthorizedPortalAccessSessionCache();

const [
  appSource,
  routeTypesSource,
  guardSource,
  accountSource,
  authProviderSource,
  portalAccessSource,
  dossiersPageSource,
  dossierDetailPageSource,
  dossierRouteSource,
  compliancePageSource,
  dashboardPageSource,
  dashboardSidebarSource,
  signupSource,
  evidenceEndpointSource,
  complianceEndpointSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/routes/types.ts"),
  source("app/src/features/operator/OperatorRouteGuard.tsx"),
  source("app/src/features/auth/AccountPage.tsx"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("app/src/features/auth/authorizedPortalAccess.ts"),
  source("app/src/pages/EvidenceReviewWorklistPage.tsx"),
  source("app/src/pages/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/features/evidence-review/evidenceReviewRoutes.ts"),
  source("app/src/pages/ComplianceWorklistPage.tsx"),
  source("app/src/pages/DashboardPage.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
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
    dashboardPageSource.includes("returnTo={currentPath}"),
  "Q06_shared_guard_return_intent_not_reused",
);
assert(
  accountSource.includes("resolveAuthorizedPostLoginDecision(") &&
    accountSource.includes("readRequestedPortal(") &&
    accountSource.includes("showCustomerAccountActions") &&
    accountSource.includes("window.location.search") &&
    accountSource.includes("navigate(destination, { replace: true })") &&
    accountSource.includes("auth.signInWithPassword") &&
    authProviderSource.includes("signInWithSupabasePassword") &&
    authProviderSource.includes("resolveAuthorizedPortalAccessOnce") &&
    authProviderSource.includes("clearAuthorizedPortalAccessSessionCache") &&
    portalAccessSource.includes("bootstrapAppCustomerAuth") &&
    portalAccessSource.includes("loadOperatorContext") &&
    portalAccessSource.includes("loadEvidenceReviewWorklistOnce"),
  "Q07_existing_auth_flow_not_reused",
);
assert(
  guardSource.includes("canSwitchAuthorizedPortal(auth.portalNavigation)") &&
    guardSource.includes("navigate(AUTH_LOGIN_ROUTE)") &&
    dashboardSidebarSource.includes(
      "canSwitchAuthorizedPortal(auth.portalNavigation)",
    ) &&
    dashboardSidebarSource.includes("navigate(AUTH_LOGIN_ROUTE)") &&
    !dashboardSidebarSource.includes("signInWithPassword"),
  "Q07a_portal_switch_not_reusing_active_session_and_choice_route",
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
    /(localStorage|sessionStorage|user_metadata|raw_user_meta_data|role\s*===|email\s*===|capability\s*===|tenantId|tenant_id)/i
      .test(value)
  ) &&
    portalAccessSource.includes("CUSTOMER_ACCESS_DENIALS") &&
    portalAccessSource.includes("WORKFORCE_ACCESS_DENIALS"),
  "Q10_client_authority_or_long_lived_state_added",
);
assert(
  evidenceEndpointSource.includes("requireVerifiedSupabaseAuthUser") &&
    evidenceEndpointSource.includes(
      "app_evidence_review_worklist_source_read_v4",
    ) &&
    complianceEndpointSource.includes("requireVerifiedSupabaseAuthUser") &&
    complianceEndpointSource.includes(
      "app_compliance_worklist_source_events_read_v1",
    ),
  "Q11_server_authority_changed",
);
assert(
  authProviderSource.includes('setStatus("signed_out")') &&
    authProviderSource.includes("portalNavigationRef.current = null") &&
    authProviderSource.includes("setPortalNavigation(null)") &&
    authProviderSource.includes("bootstrapGenerationRef.current += 1") &&
    authProviderSource.includes(
      "clearEvidenceReviewWorklistSessionCache();",
    ) &&
    authProviderSource.match(
        /bootstrapGenerationRef\.current !== generation/g,
      )?.length === 4 &&
    authProviderSource.indexOf(
        "bootstrapGenerationRef.current !== generation",
      ) <
      authProviderSource.indexOf(
        "portalNavigationRef.current = result.navigation",
      ) &&
    accountSource.includes("logoutRunningRef.current") &&
    accountSource.includes("completeAuthLogout") &&
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
