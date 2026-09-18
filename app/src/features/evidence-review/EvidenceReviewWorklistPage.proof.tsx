import { renderToStaticMarkup } from "react-dom/server";
import type {
  EvidenceReviewAttentionReason,
  EvidenceReviewWorklistCaseV4,
  EvidenceReviewWorklistResponseV4,
} from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import { EvidenceReviewWorklistContent } from "./EvidenceReviewWorklistPage.tsx";
import {
  decodeEvidenceReviewWorklistResponse,
  type EvidenceReviewWorklistSafeError,
  loadEvidenceReviewWorklist,
} from "./evidenceReviewWorklistClient.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const root = new URL("../../../../", import.meta.url);
const noop = () => undefined;

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, root));
}

function caseItem(
  caseRef: string,
  reasons: readonly EvidenceReviewAttentionReason[],
  overrides: Partial<EvidenceReviewWorklistCaseV4> = {},
): EvidenceReviewWorklistCaseV4 {
  return {
    caseRef,
    lifecycleState: "submitted_for_review",
    overallReviewStatus: reasons[0] === "REVIEW_MODEL_UNAVAILABLE"
      ? "REVIEW_MODEL_UNAVAILABLE"
      : "TO_REVIEW",
    unresolvedFactCount: reasons[0] === "REVIEW_MODEL_UNAVAILABLE" ? 0 : 1,
    reviewAttentionReasons: reasons,
    latestReviewActivityAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

function response(
  cases: readonly EvidenceReviewWorklistCaseV4[],
): EvidenceReviewWorklistResponseV4 {
  return {
    schemaVersion: "evidence-review-worklist-v4",
    asOf: "2026-08-18T12:00:00.000Z",
    caseCount: cases.length,
    cases,
  };
}

function readyHtml(value: EvidenceReviewWorklistResponseV4): string {
  return renderToStaticMarkup(
    <EvidenceReviewWorklistContent
      onOpenCase={noop}
      onRefresh={noop}
      state={{ status: "ready", value, error: null }}
    />,
  );
}

function errorHtml(error: EvidenceReviewWorklistSafeError): string {
  return renderToStaticMarkup(
    <EvidenceReviewWorklistContent
      onOpenCase={noop}
      onRefresh={noop}
      state={{ status: "error", value: null, error }}
    />,
  );
}

const loadingHtml = renderToStaticMarkup(
  <EvidenceReviewWorklistContent
    onOpenCase={noop}
    onRefresh={noop}
    state={{ status: "loading", value: null, error: null }}
  />,
);
assert(
  loadingHtml.includes("Werklijst laden") &&
    loadingHtml.includes('role="status"') &&
    !loadingHtml.includes("CASE-PROOF"),
  "Q01_loading_state_invalid",
);

const activeHtml = readyHtml(response([
  caseItem("CASE-PROOF-ACTIVE", ["FACT_REVIEW_REQUIRED"]),
]));
assert(
  activeHtml.includes("Factbeoordeling nodig") &&
    activeHtml.includes("1 gegeven vraagt beoordeling"),
  "Q02_active_fact_presentation_invalid",
);

const unavailableHtml = readyHtml(response([
  caseItem("CASE-PROOF-UNAVAILABLE", ["REVIEW_MODEL_UNAVAILABLE"]),
]));
assert(
  unavailableHtml.includes("Beoordelingsmodel niet beschikbaar") &&
    unavailableHtml.includes(
      "Aantal te beoordelen gegevens niet beschikbaar",
    ) &&
    unavailableHtml.includes("status-pill-danger"),
  "Q03_unavailable_attention_invalid",
);

const terminalQueueState = decodeEvidenceReviewWorklistResponse({
  ...response([]),
  caseCount: 1,
  cases: [{
    ...caseItem("CASE-PROOF-WAITING", [], {
      unresolvedFactCount: 0,
    }),
    overallReviewStatus: "CORRECTION_REQUIRED",
  }],
});
assert(
  terminalQueueState.ok,
  "Q04_authoritative_dossier_state_rejected",
);

const groupedHtml = readyHtml(response([
  caseItem("CASE-PROOF-REVIEW", ["FACT_REVIEW_REQUIRED"]),
  caseItem("CASE-PROOF-WAITING", [], {
    overallReviewStatus: "WAITING_CUSTOMER",
    unresolvedFactCount: 0,
  }),
  caseItem("CASE-PROOF-COMPLETE", [], {
    overallReviewStatus: "REVIEW_COMPLETE",
    unresolvedFactCount: 0,
  }),
  caseItem("CASE-PROOF-CORRECTION", [], {
    overallReviewStatus: "CORRECTION_REQUIRED",
    unresolvedFactCount: 0,
  }),
  caseItem("CASE-PROOF-MODEL", ["REVIEW_MODEL_UNAVAILABLE"]),
]));
assert(
  groupedHtml.includes('id="interne-beoordeling"') &&
    groupedHtml.includes('id="wacht-op-klant"') &&
    groupedHtml.includes('id="afgerond"') &&
    groupedHtml.includes('id="overige-actieve-dossiers"') &&
    groupedHtml.includes("Interne beoordeling") &&
    groupedHtml.includes("Wacht op klant") &&
    groupedHtml.includes("Afgerond") &&
    groupedHtml.includes("Beoordeling afgerond") &&
    groupedHtml.includes("Overige actieve dossiers") &&
    [
      "CASE-PROOF-REVIEW",
      "CASE-PROOF-WAITING",
      "CASE-PROOF-COMPLETE",
      "CASE-PROOF-CORRECTION",
      "CASE-PROOF-MODEL",
    ].every((caseRef) => groupedHtml.split(caseRef).length - 1 === 1),
  "Q04_status_groups_or_exclusive_partition_invalid",
);

const oneCaseHtml = readyHtml(response([
  caseItem("CASE-PROOF-ONE", ["FACT_REVIEW_REQUIRED"]),
]));
assert(
  oneCaseHtml.split("CASE-PROOF-ONE").length - 1 === 1,
  "Q05_case_duplicated",
);

const orderedRefs = [
  "CASE-AAAA00000001",
  "CASE-BBBB00000002",
  "CASE-CCCC00000003",
];
const orderedHtml = readyHtml(
  response(
    orderedRefs.map((caseRef, index) =>
      caseItem(caseRef, ["FACT_REVIEW_REQUIRED"], {
        latestReviewActivityAt: `2026-08-18T10:0${index}:00.000Z`,
      })
    ),
  ),
);
assert(
  orderedHtml.indexOf(orderedRefs[0]) < orderedHtml.indexOf(orderedRefs[1]) &&
    orderedHtml.indexOf(orderedRefs[1]) < orderedHtml.indexOf(orderedRefs[2]),
  "Q06_server_order_not_preserved",
);

const serverCountHtml = readyHtml(response([
  caseItem("CASE-PROOF-SERVER-COUNT", ["FACT_REVIEW_REQUIRED"], {
    unresolvedFactCount: 7,
  }),
]));
assert(
  serverCountHtml.includes("7 gegevens vragen beoordeling"),
  "Q07_server_count_not_reused",
);

const emptyHtml = readyHtml(response([]));
assert(
  emptyHtml.includes("Interne beoordeling") &&
    emptyHtml.includes("Wacht op klant") &&
    emptyHtml.includes("Afgerond") &&
    emptyHtml.includes("Overige actieve dossiers") &&
    emptyHtml.split("Geen dossiers in deze groep.").length - 1 === 4 &&
    !/(alle dossiers zijn beoordeeld|alles is goedgekeurd|alles is compliant)/i
      .test(emptyHtml),
  "Q08_empty_state_overclaims",
);

const unauthorizedHtml = errorHtml({
  code: "unauthorized",
  message: "Log opnieuw in om de dossierwerklijst te bekijken.",
});
const forbiddenHtml = errorHtml({
  code: "forbidden",
  message: "U heeft geen toegang tot de dossierwerklijst.",
});
const serverErrorHtml = errorHtml({
  code: "service_unavailable",
  message:
    "De dossierwerklijst is tijdelijk niet beschikbaar. Probeer het opnieuw.",
});
assert(
  unauthorizedHtml.includes("Inloggen vereist") &&
    forbiddenHtml.includes("Geen toegang") &&
    !/(aanvragen|verhogen|admin)/i.test(forbiddenHtml),
  "Q09_auth_states_invalid",
);
assert(
  serverErrorHtml.includes("Dossierwerklijst niet beschikbaar") &&
    serverErrorHtml.includes("Opnieuw laden") &&
    !/(\bsql\b|postgres|service[_ .-]?role|credential)/i.test(serverErrorHtml),
  "Q10_safe_error_state_invalid",
);

let fetchCount = 0;
let requestedUrl = "";
let requestedInit: RequestInit | undefined;
const fetchImpl: typeof fetch = async (input, init) => {
  fetchCount += 1;
  requestedUrl = String(input);
  requestedInit = init;
  return new Response(JSON.stringify(response([])), {
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
const firstLoad = await loadEvidenceReviewWorklist(clientConfig);
const secondLoad = await loadEvidenceReviewWorklist(clientConfig);
assert(
  firstLoad.ok && secondLoad.ok && fetchCount === 2,
  "Q11_refresh_not_refetched",
);
const headers = new Headers(requestedInit?.headers);
assert(
  requestedUrl ===
      "https://local-proof.invalid/functions/v1/api-app-evidence-review-worklist" &&
    requestedInit?.method === "GET" && !requestedInit.body &&
    headers.get("authorization") === "Bearer proof-access-token" &&
    headers.get("apikey") === "proof-anon-key",
  "Q12_authenticated_get_contract_invalid",
);

for (
  const [status, code] of [[401, "unauthorized"], [403, "forbidden"]] as const
) {
  const result = await loadEvidenceReviewWorklist({
    ...clientConfig,
    fetchImpl: async () => new Response("{}", { status }),
  });
  assert(
    !result.ok && result.error.code === code,
    `Q13_http_${status}_mapping_invalid`,
  );
}
const malformedCount = decodeEvidenceReviewWorklistResponse({
  ...response([]),
  caseCount: 1,
});
const malformedReason = decodeEvidenceReviewWorklistResponse(response([
  caseItem("CASE-PROOF-MALFORMED", [
    "AUTOMATIC_CHECK_FAILED" as EvidenceReviewAttentionReason,
  ]),
]));
const extraField = decodeEvidenceReviewWorklistResponse({
  ...response([]),
  customerDisplayLabel: "not-approved",
});
assert(
  !malformedCount.ok && !malformedReason.ok && !extraField.ok,
  "Q14_malformed_response_not_closed",
);

const [
  appSource,
  clientSource,
  hookSource,
  featureSource,
  pageSource,
  headerSource,
  sidebarSource,
  layoutCss,
  componentsCss,
  endpointSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/evidence-review/evidenceReviewWorklistClient.ts"),
  source("app/src/features/evidence-review/useEvidenceReviewWorklist.ts"),
  source("app/src/features/evidence-review/EvidenceReviewWorklistPage.tsx"),
  source("app/src/pages/EvidenceReviewWorklistPage.tsx"),
  source("app/src/shared/components/AppHeader.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
  source("app/src/styles/layout.css"),
  source("app/src/styles/components.css"),
  source("supabase/functions/api-app-evidence-review-worklist/index.ts"),
]);
assert(
  appSource.includes(
    'path === "/beheer/dossiers" || path === "/intern/dossiers"',
  ) &&
    pageSource.includes("OperatorRouteGuard") &&
    pageSource.includes('surface="tenant_operator"') &&
    pageSource.includes("AppHeader") &&
    !headerSource.includes("/intern/dossiers") &&
    !sidebarSource.includes("/intern/dossiers"),
  "Q15_route_only_boundary_invalid",
);
assert(
  clientSource.includes("resolvePublicApiRuntimeConfig") &&
    clientSource.includes("api-app-evidence-review-worklist") &&
    clientSource.includes('method: "GET"') &&
    endpointSource.includes('req.method !== "GET"') &&
    !/(caseId|case_id|workforce|capabilit(?:y|ies)|tenantId|tenant_id|role=)/
      .test(clientSource),
  "Q16_endpoint_or_authority_contract_invalid",
);
assert(
  [clientSource, hookSource, featureSource, pageSource].every((value) =>
    !/(localStorage|sessionStorage|style=\{\{|automaticCheck|CheckExecution)/
      .test(value)
  ) &&
    !/(Goedkeuren|Afwijzen|Toewijzen|Beoordeling opslaan|Opnieuw uitvoeren)/i
      .test(featureSource) &&
    hookSource.includes("setRefreshNonce") &&
    hookSource.includes("loadEvidenceReviewWorklist"),
  "Q17_mutation_cache_or_check_claim_present",
);
assert(
  featureSource.includes("portal-content-stack") &&
    featureSource.includes("portal-card-compact") &&
    featureSource.includes("portal-section-stack") &&
    featureSource.includes("portal-row-list") &&
    featureSource.includes("portal-row") &&
    featureSource.includes("status-pill") &&
    featureSource.includes("review-panel") &&
    layoutCss.includes("@media (max-width: 900px)") &&
    layoutCss.includes("@media (max-width: 620px)") &&
    componentsCss.includes(".portal-card-compact") &&
    componentsCss.includes(".status-pill") &&
    featureSource.includes("STATUS_GROUP") &&
    featureSource.includes("EVIDENCE_REVIEW_WORKLIST_GROUP_ANCHORS"),
  "Q18_shared_css_or_responsive_boundary_missing",
);
assert(
  orderedHtml.includes("<h1>") && orderedHtml.includes("<h2") &&
    orderedHtml.includes("<h3>") && orderedHtml.includes("<ul") &&
    orderedHtml.includes("<li") &&
    orderedHtml.includes(
      'aria-label="Dossieracties en redenen voor aandacht"',
    ) &&
    orderedHtml.includes("Dossier openen") &&
    featureSource.includes("buildEvidenceReviewDetailRoute") &&
    featureSource.includes("event.preventDefault()") &&
    featureSource.includes("navigate(route)"),
  "Q19_accessible_case_navigation_invalid",
);

console.log("EVIDENCE_REVIEW_WORKLIST_UI_Q01_Q19=PASS");
Deno.exit(0);
