import { renderToStaticMarkup } from "react-dom/server";
import type {
  ComplianceWorklistResponseV1,
  SafeComplianceWorklistItemV1,
} from "../../../../supabase/functions/_shared/app_compliance_worklist.ts";
import { ComplianceWorklistContent } from "./ComplianceWorklistPage.tsx";
import {
  decodeComplianceWorklistResponse,
  loadComplianceWorklist,
  type ComplianceWorklistSafeError,
} from "./complianceWorklistClient.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const root = new URL("../../../../", import.meta.url);

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, root));
}

const noop = () => undefined;

function item(
  actionKind: SafeComplianceWorklistItemV1["actionKind"],
  overrides: Partial<SafeComplianceWorklistItemV1> = {},
): SafeComplianceWorklistItemV1 {
  const milestone = actionKind === "YEAR_END_OPERATIONAL_ATTENTION";
  const verifier = actionKind === "VERIFIER_REV_REGISTRATION_ATTENTION";
  const findings = actionKind === "FINDINGS_REPORT_ATTENTION";
  return {
    schemaVersion: "compliance-worklist-item-v1",
    classification: milestone ? "INFORMATIONAL_MILESTONE" : "ACTIVE_ATTENTION",
    scope: "DELIVERY_YEAR_TENANT_SCOPED",
    actionKind,
    deliveryYear: 2026,
    obligationKind: milestone
      ? "YEAR_END_BOUNDARY"
      : verifier
      ? "VERIFIER_REV_REGISTRATION"
      : findings
      ? "FINDINGS_REPORT"
      : actionKind === "INBOOKING_CUTOFF_ATTENTION"
      ? "INBOOKING_CUTOFF"
      : actionKind === "STATEMENT_POSSESSION_ATTENTION"
      ? "STATEMENT_POSSESSION"
      : "STATEMENT_SUBMISSION",
    responsibleActor: milestone ? "SYSTEM_CALENDAR" : verifier ? "VERIFIER" : "INBOEKER",
    coordinationMode: milestone
      ? "OPERATIONAL_MILESTONE"
      : verifier
      ? "VERIFIER_COORDINATION"
      : findings
      ? "INTERNAL_COMPLIANCE_ATTENTION"
      : actionKind === "STATEMENT_POSSESSION_ATTENTION"
      ? "VERIFIER_COORDINATION"
      : "DIRECT_INBOEKER_OPERATION",
    temporalStatus: milestone ? "REACHED" : findings ? "BLOCKED" : "UPCOMING",
    boundary: findings ? null : "2026-04-01",
    boundarySemantics: milestone ? "CALENDAR_BOUNDARY" : findings ? "IMMEDIATE_ATTENTION" : "INCLUSIVE_CUTOFF",
    ...overrides,
  };
}

function response(
  activeAttention: readonly SafeComplianceWorklistItemV1[],
  milestones: readonly SafeComplianceWorklistItemV1[] = [],
): ComplianceWorklistResponseV1 {
  return {
    schemaVersion: "compliance-worklist-response-v1",
    deliveryYear: 2026,
    asOf: "2026-08-17T10:00:00.000Z",
    calendarVersion: "proof-calendar-version",
    sourceEventCount: 2,
    evidenceStatus: "ACCEPTED_SOURCE_FACTS_REPLAYED",
    activeAttention,
    milestones,
  };
}

function readyHtml(value: ComplianceWorklistResponseV1): string {
  return renderToStaticMarkup(
    <ComplianceWorklistContent
      onRefresh={noop}
      state={{ status: "ready", value, error: null }}
    />,
  );
}

function errorHtml(error: ComplianceWorklistSafeError): string {
  return renderToStaticMarkup(
    <ComplianceWorklistContent
      onRefresh={noop}
      state={{ status: "error", value: null, error }}
    />,
  );
}

const loadingHtml = renderToStaticMarkup(
  <ComplianceWorklistContent
    onRefresh={noop}
    state={{ status: "loading", value: null, error: null }}
  />,
);
assert(
  loadingHtml.includes("Werklijst laden") &&
    loadingHtml.includes('role="status"') &&
    !loadingHtml.includes("Inboeking afronden"),
  "Q01_loading_state_invalid",
);

const activeItems = [
  item("INBOOKING_CUTOFF_ATTENTION"),
  item("STATEMENT_POSSESSION_ATTENTION"),
  item("STATEMENT_SUBMISSION_ATTENTION"),
  item("VERIFIER_REV_REGISTRATION_ATTENTION"),
  item("FINDINGS_REPORT_ATTENTION"),
];
const fullHtml = readyHtml(response(activeItems, [item("YEAR_END_OPERATIONAL_ATTENTION")]));
for (const label of [
  "Inboeking afronden",
  "Verificatieverklaring beschikbaar hebben",
  "Verificatieverklaring indienen bij NEa",
  "REV-registratie door verificateur bewaken",
  "Bevindingenrapport vraagt interne aandacht",
]) {
  assert(fullHtml.includes(label), `Q02_missing_action_${label}`);
}
assert(
  fullHtml.includes("Leveringsjaar 2026") &&
    fullHtml.includes("Actuele aandachtspunten") &&
    fullHtml.includes("Informatieve mijlpalen") &&
    fullHtml.includes("geen taken of aftekenmomenten"),
  "Q03_context_or_milestone_separation_invalid",
);
assert(
  fullHtml.includes("Verificateur voert uit; ENVAL bewaakt de afstemming") &&
    fullHtml.includes("niet door ENVAL uitgevoerd"),
  "Q04_verifier_actor_semantics_changed",
);
assert(
  fullHtml.includes("niet-positieve verificatie-uitkomst") &&
    fullHtml.includes("herstel- of afsluitworkflow is nog niet onderdeel"),
  "Q05_findings_state_invalid",
);

const emptyHtml = readyHtml({
  ...response([], [item("YEAR_END_OPERATIONAL_ATTENTION")]),
  sourceEventCount: 0,
  evidenceStatus: "NO_ACCEPTED_SOURCE_FACTS_RECORDED",
});
assert(
  emptyHtml.includes("Geen actuele aandachtspunten op basis van de geregistreerde compliancegegevens.") &&
    emptyHtml.includes("bewijst niet dat alle externe handelingen zijn voltooid") &&
    emptyHtml.includes("Informatieve mijlpalen") &&
    !/alles is compliant/i.test(emptyHtml),
  "Q06_empty_state_overclaims_compliance",
);

const unauthorizedHtml = errorHtml({
  code: "unauthorized",
  message: "Log opnieuw in om de compliancewerklijst te bekijken.",
});
const forbiddenHtml = errorHtml({
  code: "forbidden",
  message: "U heeft geen toegang tot de compliancewerklijst.",
});
const serverErrorHtml = errorHtml({
  code: "service_unavailable",
  message: "De compliancewerklijst is tijdelijk niet beschikbaar. Probeer het opnieuw.",
});
assert(
  unauthorizedHtml.includes("Inloggen vereist") &&
    forbiddenHtml.includes("Geen toegang") &&
    !/(aanvragen|verhogen|admin)/i.test(forbiddenHtml),
  "Q07_auth_error_states_invalid",
);
assert(
  serverErrorHtml.includes("Compliancewerklijst niet beschikbaar") &&
    serverErrorHtml.includes("Opnieuw laden") &&
    !/(\bsql\b|postgres|service[_ .-]?role|credential)/i.test(serverErrorHtml),
  "Q08_safe_server_error_invalid",
);

let fetchCount = 0;
let requestedUrl = "";
let requestedInit: RequestInit | undefined;
const fetchImpl: typeof fetch = async (input, init) => {
  fetchCount += 1;
  requestedUrl = String(input);
  requestedInit = init;
  return new Response(JSON.stringify(response(activeItems)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const clientConfig = {
  accessToken: "proof-access-token",
  fetchImpl,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
};
const firstLoad = await loadComplianceWorklist(clientConfig);
const secondLoad = await loadComplianceWorklist(clientConfig);
assert(firstLoad.ok && secondLoad.ok && fetchCount === 2, "Q09_refresh_did_not_refetch");
const headers = new Headers(requestedInit?.headers);
assert(
  requestedUrl === "https://local-proof.invalid/functions/v1/api-app-compliance-worklist?deliveryYear=2026" &&
    requestedInit?.method === "GET" &&
    headers.get("authorization") === "Bearer proof-access-token" &&
    headers.get("apikey") === "proof-anon-key" &&
    !requestedInit?.body,
  "Q10_authenticated_request_contract_invalid",
);

for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [422, "unsupported_delivery_year"]] as const) {
  const result = await loadComplianceWorklist({
    ...clientConfig,
    fetchImpl: async () => new Response("{}", { status }),
  });
  assert(!result.ok && result.error.code === code, `Q11_http_${status}_mapping_invalid`);
}
const corrupt = decodeComplianceWorklistResponse({ ...response([]), deliveryYear: 2027 });
assert(!corrupt.ok && corrupt.error.code === "invalid_response", "Q12_corrupt_response_not_fail_closed");

const [appSource, clientSource, hookSource, pageSource, routeSource, headerSource, sidebarSource, endpointSource] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/compliance/complianceWorklistClient.ts"),
  source("app/src/features/compliance/useComplianceWorklist.ts"),
  source("app/src/features/compliance/ComplianceWorklistPage.tsx"),
  source("app/src/pages/ComplianceWorklistPage.tsx"),
  source("app/src/shared/components/AppHeader.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
  source("supabase/functions/api-app-compliance-worklist/index.ts"),
]);
assert(
  appSource.includes('path === "/beheer" || path === "/intern/compliance"') &&
    routeSource.includes("OperatorRouteGuard") &&
    routeSource.includes('surface="tenant_operator"') &&
    routeSource.includes("AppHeader") &&
    !headerSource.includes("/intern/compliance") && !sidebarSource.includes("/intern/compliance"),
  "Q13_route_or_navigation_boundary_invalid",
);
assert(
  clientSource.includes("resolvePublicApiRuntimeConfig") &&
    clientSource.includes("api-app-compliance-worklist?deliveryYear=${COMPLIANCE_WORKLIST_DELIVERY_YEAR}") &&
    clientSource.includes('method: "GET"') &&
    endpointSource.includes('req.method !== "GET"'),
  "Q14_existing_endpoint_or_runtime_config_not_reused",
);
assert(
  [clientSource, hookSource, pageSource].every((value) =>
    !/(localStorage|sessionStorage|role\s*===|email\s*===|capabilit(?:y|ies)|tenantId|tenant_id)/.test(value)
  ),
  "Q15_client_authorization_or_compliance_truth_present",
);
assert(
  !/(setDate|setUTCDate|Date\.UTC|86400000|\+\s*14|1\s+april|1\s+mei)/i.test(pageSource + clientSource + hookSource) &&
    !clientSource.includes("asOf=") && !clientSource.includes("calendarVersion=") &&
    !clientSource.includes("scope=") && !clientSource.includes("tenant="),
  "Q16_client_deadline_or_server_input_reconstruction_present",
);
assert(
  !/(api-app-compliance-source-event|Markeer|Toewijzen|Erkennen|Negeren|Snoozen|Goedkeuren|Oplossen)/i.test(pageSource) &&
    !pageSource.includes("style={{") &&
    hookSource.includes("setRefreshNonce") && hookSource.includes("loadComplianceWorklist") &&
    !hookSource.includes("localStorage"),
  "Q17_mutation_inline_css_or_persistent_cache_present",
);
assert(
  !fullHtml.includes("proof-calendar-version") &&
    !/(sourceReference|sourceResultReference|actionKey|tenant|credential|service.role)/i.test(fullHtml),
  "Q18_internal_provenance_exposed",
);

console.log("COMPLIANCE_WORKLIST_UI_Q01_Q18=PASS");
Deno.exit(0);
