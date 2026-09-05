import { createHandler } from "../../supabase/functions/api-app-operator-context/index.ts";
import type { AppRequestMeta } from "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";
import {
  decodeOperatorContextResponse,
  loadOperatorContext,
} from "../../app/src/features/operator/operatorContextClient.ts";
import {
  SUPPORTED_DELIVERY_YEARS,
} from "../../supabase/functions/_shared/app_compliance_worklist.ts";

class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}

function q(value: number): void {
  console.log(`UI01B-Q${String(value).padStart(2, "0")}: PASS`);
}

const root = new URL("../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_HASH = "a".repeat(64);

const META = {
  request_id: "ui01b-request",
  idempotency_key: null,
  ip_hash: null,
  user_agent_hash: null,
  method: "GET",
  path: "/api-app-operator-context",
  url: "https://enval.local/api-app-operator-context",
  origin: "https://enval.local",
  timestamp: "2026-09-03T10:00:00.000Z",
  environment: "local",
  tenant_execution: {
    tenantId: TENANT_ID,
    environment: "local",
    trustedRoutingKey: "reference",
    routingProvenance: "DEPLOYMENT_FIXED",
    resolutionMode: "static_single_tenant_v1",
    dataPlaneLocatorId: "33333333-3333-4333-8333-333333333333",
    resolvedDataPlaneReference: "local",
    fixedDataPlaneReference: "local",
    providerType: "supabase",
    deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
  },
} as AppRequestMeta;

type AuthorityFixture = Readonly<{
  compliance: JsonObject;
  evidence: JsonObject;
  authenticated?: boolean;
}>;

function handlerFor(
  fixture: AuthorityFixture,
  calls: Array<Readonly<{ name: string; args: JsonObject }>> = [],
) {
  const client = {
    auth: { getUser: async () => ({}) },
    from: () => ({}),
    rpc: async (name: string, args: JsonObject) => {
      calls.push({ name, args });
      return {
        data: name === "app_compliance_worklist_source_events_read_v1"
          ? fixture.compliance
          : fixture.evidence,
      };
    },
  } as ServiceClient;
  return createHandler({
    createServiceClient: () => client,
    requestMeta: async () => META,
    verifyBearer: async () =>
      fixture.authenticated === false
        ? {
          ok: false,
          status: 401,
          code: "missing_authorization",
          message: "Niet geautoriseerd.",
        }
        : {
          ok: true,
          context: {
            authUserId: AUTH_USER_ID,
            emailNormalized: "[redacted]",
          },
        },
    hashTenantReference: async (value) => {
      assert(value === TENANT_ID, "server_tenant_not_hashed");
      return TENANT_HASH;
    },
  });
}

const denied = {
  compliance: { ok: false, code: "capability_not_authorized" },
  evidence: { ok: false, code: "capability_not_authorized" },
};

const unauthenticated = await handlerFor({
  ...denied,
  authenticated: false,
})(new Request("https://enval.local/api-app-operator-context"));
assert(unauthenticated.status === 401, "Q01_unauthenticated_not_denied");
q(1);

const customer = await handlerFor({
  compliance: { ok: false, code: "workforce_identity_missing" },
  evidence: { ok: false, code: "workforce_identity_missing" },
})(
  new Request("https://enval.local/api-app-operator-context", {
    headers: { Authorization: "Bearer redacted" },
  }),
);
assert(
  customer.status === 403 &&
    (await customer.json()).code === "workforce_identity_missing",
  "Q02_customer_not_denied",
);
q(2);

const calls: Array<Readonly<{ name: string; args: JsonObject }>> = [];
const workforce = await handlerFor({
  compliance: { ok: true, actor_ref: "workforce:redacted" },
  evidence: { ok: true, queue_rows: [] },
}, calls)(
  new Request("https://enval.local/api-app-operator-context", {
    headers: { Authorization: "Bearer redacted" },
  }),
);
const workforceBody = await workforce.json();
assert(
  workforce.status === 200 &&
    decodeOperatorContextResponse(workforceBody).ok &&
    workforceBody.effective_capabilities.join("|") ===
      "compliance.delivery_year.view|evidence.review.view",
  "Q03_authorized_workforce_not_allowed",
);
q(3);

assert(
  calls.length === 2 &&
    calls[0].name === "app_compliance_worklist_source_events_read_v1" &&
    calls[0].args.p_auth_user_id === AUTH_USER_ID &&
    calls[0].args.p_delivery_year === SUPPORTED_DELIVERY_YEARS[0] &&
    calls[1].name === "app_evidence_review_worklist_source_read_v4" &&
    calls[1].args.p_auth_user_id === AUTH_USER_ID &&
    workforceBody.tenant_reference === TENANT_HASH,
  "Q04_tenant_or_principal_not_server_bound",
);
q(4);

const tenantInjectionCalls: Array<
  Readonly<{ name: string; args: JsonObject }>
> = [];
const tenantInjection = await handlerFor(
  denied,
  tenantInjectionCalls,
)(
  new Request(
    "https://enval.local/api-app-operator-context?tenant=attacker",
    { headers: { Authorization: "Bearer redacted" } },
  ),
);
assert(
  tenantInjection.status === 400 && tenantInjectionCalls.length === 0,
  "Q05_browser_tenant_input_accepted",
);
q(5);

const capabilityInjection = await handlerFor(denied)(
  new Request(
    "https://enval.local/api-app-operator-context?capability=workforce.policy.manage",
    { headers: { Authorization: "Bearer redacted" } },
  ),
);
assert(
  capabilityInjection.status === 400,
  "Q06_browser_capability_input_accepted",
);
q(6);

const inactive = await handlerFor({
  compliance: { ok: false, code: "workforce_identity_inactive" },
  evidence: { ok: false, code: "workforce_identity_inactive" },
})(
  new Request("https://enval.local/api-app-operator-context", {
    headers: { Authorization: "Bearer redacted" },
  }),
);
assert(
  inactive.status === 403 &&
    (await inactive.json()).code === "workforce_identity_inactive",
  "Q07_inactive_workforce_not_denied",
);
q(7);

const crossTenant = await handlerFor(denied)(
  new Request(
    "https://enval.local/api-app-operator-context?tenant_id=other",
    { headers: { Authorization: "Bearer redacted" } },
  ),
);
assert(crossTenant.status === 400, "Q08_cross_tenant_input_accepted");
q(8);

assert(
  Object.keys(workforceBody).sort().join("|") ===
      "active|actor_type|authorized|effective_capabilities|schema_version|tenant_reference" &&
    !JSON.stringify(workforceBody).match(
      /email|token|secret|service_role|policy_version|assignment|membership|audit/i,
    ),
  "Q09_unsafe_operator_context_projection",
);
q(9);

const [
  complianceEndpoint,
  evidenceEndpoint,
  dashboardPage,
  dashboardSidebar,
  appSource,
  guardSource,
  endpointSource,
  complianceBoundary,
] = await Promise.all([
  source("supabase/functions/api-app-compliance-worklist/index.ts"),
  source("supabase/functions/api-app-evidence-review-worklist/index.ts"),
  source("app/src/pages/DashboardPage.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
  source("app/src/App.tsx"),
  source("app/src/features/operator/OperatorRouteGuard.tsx"),
  source("supabase/functions/api-app-operator-context/index.ts"),
  source("supabase/migrations/20260817210000_app_compliance_worklist_read.sql"),
]);

assert(
  complianceEndpoint.includes("requireVerifiedSupabaseAuthUser") &&
    complianceEndpoint.includes(
      "app_compliance_worklist_source_events_read_v1",
    ) &&
    evidenceEndpoint.includes("requireVerifiedSupabaseAuthUser") &&
    evidenceEndpoint.includes("app_evidence_review_worklist_source_read_v4") &&
    endpointSource.includes("app_compliance_worklist_source_events_read_v1") &&
    !endpointSource.includes("app_workforce_authorize_v1") &&
    complianceBoundary.includes("'CURRENT_TENANT_DATA_PLANE'") &&
    complianceBoundary.includes("public.app_workforce_authorize_v1("),
  "Q10_business_endpoint_authority_not_independent",
);
q(10);

assert(
  dashboardPage.includes("DashboardRouteGuard") &&
    appSource.includes('path === "/dashboard"') &&
    appSource.includes("<AuthProvider>"),
  "Q11_customer_dashboard_guard_changed",
);
q(11);

assert(
  !dashboardSidebar.includes("/beheer") &&
    !dashboardSidebar.includes("tenant_operator") &&
    !dashboardSidebar.includes("Dossiers voor bewijsbeoordeling"),
  "Q12_customer_shell_contains_operator_controls",
);
q(12);

assert(
  appSource.includes('path === "/beheer"') &&
    appSource.includes('path === "/intern/compliance"') &&
    appSource.includes(
      'path === "/beheer/dossiers" || path === "/intern/dossiers"',
    ) &&
    appSource.includes('<AuthProvider audience="operator">') &&
    guardSource.includes("loadOperatorContext") === false &&
    guardSource.includes("useOperatorContext"),
  "Q13_intern_operator_authority_not_unified",
);
q(13);

const decodedCapabilities = JSON.stringify(
  workforceBody.effective_capabilities,
);
assert(
  !endpointSource.includes("platform_support.request") &&
    !decodedCapabilities.includes("platform_support.request"),
  "Q14_platform_support_implicitly_granted",
);
q(14);

const clientDenial = await loadOperatorContext({
  accessToken: "redacted",
  runtimeConfig: { anonKey: "redacted", apiBaseUrl: "https://enval.local" },
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: "Beheer is niet toegestaan.",
        code: "workforce_identity_missing",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ),
});
assert(
  !clientDenial.ok && clientDenial.error.code === "not_workforce",
  "client_denial_not_fail_closed",
);

console.log("UI01B_OPERATOR_CONTEXT_Q01_Q14=PASS");
