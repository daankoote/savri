// Read-only portal-context authority contract proof.
// Runtime positive/negative paths are exercised by api-app-auth-bootstrap.proof.ts
// and ui01b-operator-browser-fixture.ts after the local migration is applied.

class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}

function marker(index: number): void {
  console.log(`PORTAL_AUTH_Q${String(index).padStart(2, "0")}=PASS`);
}

const root = new URL("../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));

const [
  migration,
  bootstrapEndpoint,
  customerBoundary,
  bootstrapClient,
  authTypes,
  authProvider,
  authErrorMapping,
  customerGuard,
  operatorEndpoint,
  operatorProof,
  bootstrapProof,
  currentBaseline,
  fixture,
  browserCollector,
  dashboard,
  canon,
] = await Promise.all([
  source("supabase/migrations/20260909115342_app_portal_context_authority.sql"),
  source("supabase/functions/api-app-auth-bootstrap/index.ts"),
  source("supabase/functions/_shared/app_customer_auth.ts"),
  source("app/src/features/auth/authBootstrapClient.ts"),
  source("app/src/features/auth/authTypes.ts"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("app/src/features/auth/authErrorMapping.ts"),
  source("app/src/features/auth/DashboardRouteGuard.tsx"),
  source("supabase/functions/api-app-operator-context/index.ts"),
  source("scripts/proofs/app-operator-context.proof.ts"),
  source("scripts/proofs/api-app-auth-bootstrap.proof.ts"),
  source("supabase/migrations/20260816150000_app_current_baseline.sql"),
  source("scripts/proofs/ui01b-operator-browser-fixture.ts"),
  source("scripts/tools/enval-ui-review-collect.mjs"),
  source("app/src/features/dashboard/ActivePrivateDashboard.tsx"),
  source("docs/app/00_CANON.md"),
]);

const terminalClassifier = authErrorMapping.slice(
  authErrorMapping.indexOf("export function isTerminalBootstrapBindingError"),
);

assert(
  migration.includes("create function public.app_bootstrap_customer_auth_v7") &&
    migration.includes("public.app_bootstrap_customer_auth_v6(") &&
    !migration.includes("insert into public.app_customer_access_grants"),
  "existing_customer_authority_not_reused",
);
marker(1);

assert(
  migration.includes("'portal_context_not_authorized'") &&
    migration.includes("'status', 403") &&
    migration.includes("'customer_identity_not_found'") &&
    migration.includes("'customer_dossier_not_found'"),
  "auth_only_database_denial_missing",
);
marker(2);

assert(
  migration.includes("then 'customer'") &&
    migration.includes("else 'business'") &&
    migration.includes("'particulier',") &&
    migration.includes("'zakelijk',") &&
    migration.includes("'vve'"),
  "database_portal_classification_missing",
);
marker(3);

assert(
  migration.includes("left join public.app_cases app_case") &&
    migration.includes("left join public.app_customers customer_row") &&
    migration.includes("customer_row.status = 'active'") &&
    migration.includes(
      "customer_row.customer_type is distinct from dossier ->> 'account_type'",
    ) &&
    migration.includes("from public.app_customer_access_grants access_grant") &&
    migration.includes("access_grant.auth_user_id = p_auth_user_id") &&
    !migration.includes("access_grant.granted_case_id = app_case.id") &&
    bootstrapProof.includes(
      "B14 Zakelijk customer-wide grant returns both cases",
    ) &&
    bootstrapProof.includes(
      "B15A Customer/dossier account type mismatch denies",
    ),
  "portal_context_customer_grant_revalidation_missing",
);
marker(4);

assert(
  migration.includes("from public;") && migration.includes("from anon;") &&
    migration.includes("from authenticated;") &&
    migration.includes("to service_role;") &&
    migration.includes("security definer") &&
    migration.includes("set search_path = ''"),
  "portal_rpc_acl_not_fail_closed",
);
marker(5);

assert(
  bootstrapEndpoint.includes('SB.rpc("app_bootstrap_customer_auth_v7"') &&
    bootstrapEndpoint.includes(
      'SCHEMA_VERSION = "auth_bootstrap_browser_v3"',
    ) &&
    bootstrapEndpoint.includes("`D-${dossierId.slice(0, 8)}`") &&
    bootstrapEndpoint.includes('binding_status: "denied"') &&
    !bootstrapEndpoint.includes("unbound_no_cases"),
  "edge_portal_decision_not_database_backed",
);
marker(6);

assert(
  bootstrapClient.includes('SCHEMA_VERSION = "auth_bootstrap_browser_v3"') &&
    bootstrapClient.includes('value === "customer" || value === "business"') &&
    bootstrapClient.includes('bindingStatus?: "denied" | "blocked"') &&
    authTypes.includes('portal_context: "customer" | "business"') &&
    !authTypes.includes("unbound_no_cases") &&
    !authProvider.includes('setStatus("authenticated_unbound")') &&
    !terminalClassifier.includes('code === "portal_context_not_authorized"') &&
    !customerGuard.includes("authenticated_unbound"),
  "frontend_authority_decoder_not_strict",
);
marker(7);

assert(
  dashboard.includes(
    "portalContextLabel(application.portal_context)",
  ) &&
    dashboard.includes('return "Bedrijfsportaal"') &&
    dashboard.includes('return "Klantportaal"') &&
    !dashboard.includes("<p>0 dossiers</p>"),
  "frontend_does_not_present_server_decision",
);
marker(8);

assert(
  customerBoundary.includes('.from("app_customer_access_grants")') &&
    customerBoundary.includes("authContext.customerIds.includes") &&
    customerBoundary.includes('"dossier_not_found_or_forbidden"'),
  "direct_customer_case_boundary_missing",
);
marker(9);

assert(
  currentBaseline.includes(
    "ALTER TABLE public.app_party_organization_versions ENABLE ROW LEVEL SECURITY;",
  ) &&
    currentBaseline.includes(
      "CREATE POLICY deny_all ON public.app_party_organization_versions TO authenticated, anon USING (false) WITH CHECK (false);",
    ) &&
    currentBaseline.includes(
      "ALTER TABLE public.app_case_party_roles ENABLE ROW LEVEL SECURITY;",
    ) &&
    currentBaseline.includes(
      "CREATE POLICY deny_all ON public.app_case_party_roles TO authenticated, anon USING (false) WITH CHECK (false);",
    ) &&
    currentBaseline.includes(
      "GRANT SELECT,INSERT ON TABLE public.app_party_organization_versions TO service_role;",
    ),
  "direct_organization_or_case_role_boundary_missing",
);
marker(10);

assert(
  operatorEndpoint.includes("app_compliance_worklist_source_events_read_v1") &&
    operatorEndpoint.includes("app_evidence_review_worklist_source_read_v4") &&
    operatorProof.includes("Q02_customer_not_denied") &&
    operatorProof.includes("Q05_browser_tenant_input_accepted") &&
    operatorProof.includes("Q06_browser_capability_input_accepted") &&
    operatorProof.includes("Q08_cross_tenant_input_accepted"),
  "operator_workforce_tenant_capability_boundary_missing",
);
marker(11);

assert(
  fixture.includes('PORTAL_CUSTOMER_EMAIL = "klant.portal@enval.test"') &&
    fixture.includes('PORTAL_BUSINESS_EMAIL = "bedrijf.portal@enval.test"') &&
    fixture.includes('PORTAL_REVIEWER_EMAIL = "beheer.reviewer@enval.test"') &&
    fixture.includes("portal_customer_positive_failed") &&
    fixture.includes("portal_business_positive_failed") &&
    fixture.includes("portal_operator_matrix_failed") &&
    fixture.includes("portal_operator_scope_injection_allowed") &&
    fixture.includes("portal_cross_customer_read_allowed") &&
    fixture.includes("portal_authenticated_direct_table_read_allowed") &&
    fixture.includes(
      "portal_authenticated_direct_database_privilege_allowed",
    ) &&
    fixture.includes('from("app_party_organization_versions")') &&
    fixture.includes('from("app_case_party_roles")') &&
    fixture.includes("portal_fixture_partial_state_requires_cleanup") &&
    fixture.includes("portal_fixture_cleanup_residue") &&
    canon.includes("Portal authority matrix"),
  "fixture_or_test_matrix_missing",
);
marker(12);

assert(
  fixture.includes("customerSecondDossierId") &&
    fixture.includes("ACTIVATION_LOGIN_FILE") &&
    fixture.includes("CUSTOMER_CASE_SWITCH=AVAILABLE") &&
    browserCollector.includes("collectPortalAuthorityBrowserEvidence") &&
    browserCollector.includes("proveCustomerJourney") &&
    browserCollector.includes("proveBusinessJourney") &&
    browserCollector.includes("proveAuthOnlyJourney") &&
    browserCollector.includes("proveActivationJourney") &&
    browserCollector.includes("proveWorkforceJourney") &&
    browserCollector.includes("customer_case_scope_leak") &&
    browserCollector.includes("operator_scope_leak") &&
    browserCollector.includes("CONSOLE_ERROR_COUNT") &&
    browserCollector.includes("EXPECTED_SECURITY_DENIAL_COUNT") &&
    browserCollector.includes("UNEXPECTED_REQUEST_COUNT"),
  "portal_browser_regression_lock_missing",
);
marker(13);

console.log("APP_PORTAL_CONTEXT_AUTHORITY_PROOF=PASS");
