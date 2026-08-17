import { renderToStaticMarkup } from "react-dom/server";
import type {
  EvidenceReviewAttentionReason,
  EvidenceReviewWorklistCaseV1,
  EvidenceReviewWorklistResponseV1,
} from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import { EvidenceReviewWorklistContent } from "./EvidenceReviewWorklistPage.tsx";
import {
  decodeEvidenceReviewWorklistResponse,
  loadEvidenceReviewWorklist,
  type EvidenceReviewWorklistSafeError,
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
  overrides: Partial<EvidenceReviewWorklistCaseV1> = {},
): EvidenceReviewWorklistCaseV1 {
  return {
    caseRef,
    lifecycleState: "submitted_for_review",
    unresolvedEvidenceCount: 1,
    attentionReasons: reasons,
    evidenceRefs: ["e1000000-0000-4000-8000-000000000001"],
    latestReviewActivityAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

function response(
  cases: readonly EvidenceReviewWorklistCaseV1[],
): EvidenceReviewWorklistResponseV1 {
  return {
    schemaVersion: "evidence-review-worklist-v1",
    asOf: "2026-08-18T12:00:00.000Z",
    caseCount: cases.length,
    cases,
  };
}

function readyHtml(value: EvidenceReviewWorklistResponseV1): string {
  return renderToStaticMarkup(
    <EvidenceReviewWorklistContent
      onRefresh={noop}
      state={{ status: "ready", value, error: null }}
    />,
  );
}

function errorHtml(error: EvidenceReviewWorklistSafeError): string {
  return renderToStaticMarkup(
    <EvidenceReviewWorklistContent
      onRefresh={noop}
      state={{ status: "error", value: null, error }}
    />,
  );
}

const loadingHtml = renderToStaticMarkup(
  <EvidenceReviewWorklistContent
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

const unreviewedHtml = readyHtml(response([
  caseItem("CASE-PROOF-UNREVIEWED", ["UNREVIEWED_EVIDENCE"]),
]));
assert(
  unreviewedHtml.includes("Bewijs nog te beoordelen") &&
    unreviewedHtml.includes("1 bewijsstuk vraagt aandacht"),
  "Q02_unreviewed_presentation_invalid",
);

const correctionHtml = readyHtml(response([
  caseItem("CASE-PROOF-CORRECTION", ["CORRECTION_REQUIRED"]),
]));
assert(
  correctionHtml.includes("Correctie nodig") &&
    correctionHtml.includes("status-pill-danger"),
  "Q03_correction_presentation_invalid",
);

const newVersionHtml = readyHtml(response([
  caseItem("CASE-PROOF-NEW-VERSION", [
    "NEW_EVIDENCE_VERSION_AFTER_REVIEW",
  ]),
]));
assert(
  newVersionHtml.includes("Nieuwe versie ontvangen"),
  "Q04_new_version_presentation_invalid",
);

const multipleHtml = readyHtml(response([
  caseItem("CASE-PROOF-MULTIPLE", [
    "UNREVIEWED_EVIDENCE",
    "NEW_EVIDENCE_VERSION_AFTER_REVIEW",
  ]),
]));
assert(
  multipleHtml.split("CASE-PROOF-MULTIPLE").length - 1 === 1 &&
    multipleHtml.includes("Bewijs nog te beoordelen") &&
    multipleHtml.includes("Nieuwe versie ontvangen"),
  "Q05_multiple_reasons_duplicated_case",
);

const orderedRefs = ["CASE-PROOF-C", "CASE-PROOF-A", "CASE-PROOF-B"];
const orderedHtml = readyHtml(response(orderedRefs.map((caseRef, index) =>
  caseItem(caseRef, ["UNREVIEWED_EVIDENCE"], {
    latestReviewActivityAt: `2026-08-18T10:0${index}:00.000Z`,
  })
)));
assert(
  orderedHtml.indexOf(orderedRefs[0]) < orderedHtml.indexOf(orderedRefs[1]) &&
    orderedHtml.indexOf(orderedRefs[1]) < orderedHtml.indexOf(orderedRefs[2]),
  "Q06_server_order_not_preserved",
);

const serverCountHtml = readyHtml(response([
  caseItem("CASE-PROOF-SERVER-COUNT", ["UNREVIEWED_EVIDENCE"], {
    unresolvedEvidenceCount: 7,
    evidenceRefs: ["e1000000-0000-4000-8000-000000000001"],
  }),
]));
assert(
  serverCountHtml.includes("7 bewijsstukken vragen aandacht"),
  "Q07_server_count_not_reused",
);

const emptyHtml = readyHtml(response([]));
assert(
  emptyHtml.includes(
    "Geen dossiers die op dit moment aan u zijn toegewezen voor bewijsbeoordeling.",
  ) &&
    !/(alle dossiers zijn beoordeeld|alles is goedgekeurd|er zijn geen dossiers|alles is compliant)/i
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
  message: "De dossierwerklijst is tijdelijk niet beschikbaar. Probeer het opnieuw.",
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
assert(firstLoad.ok && secondLoad.ok && fetchCount === 2, "Q11_refresh_not_refetched");
const headers = new Headers(requestedInit?.headers);
assert(
  requestedUrl ===
      "https://local-proof.invalid/functions/v1/api-app-evidence-review-worklist" &&
    requestedInit?.method === "GET" && !requestedInit.body &&
    headers.get("authorization") === "Bearer proof-access-token" &&
    headers.get("apikey") === "proof-anon-key",
  "Q12_authenticated_get_contract_invalid",
);

for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"]] as const) {
  const result = await loadEvidenceReviewWorklist({
    ...clientConfig,
    fetchImpl: async () => new Response("{}", { status }),
  });
  assert(!result.ok && result.error.code === code, `Q13_http_${status}_mapping_invalid`);
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
  appSource.includes('path === "/intern/dossiers"') &&
    pageSource.includes("DashboardRouteGuard") && pageSource.includes("AppHeader") &&
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
    featureSource.includes("portal-row-list") &&
    featureSource.includes("portal-row") &&
    featureSource.includes("status-pill") &&
    featureSource.includes("review-panel") &&
    layoutCss.includes("@media (max-width: 900px)") &&
    layoutCss.includes("@media (max-width: 620px)") &&
    componentsCss.includes(".portal-card-compact") &&
    componentsCss.includes(".status-pill"),
  "Q18_shared_css_or_responsive_boundary_missing",
);
assert(
  orderedHtml.includes("<h1>") && orderedHtml.includes("<h2") &&
    orderedHtml.includes("<h3>") && orderedHtml.includes("<ul") &&
    orderedHtml.includes("<li") &&
    orderedHtml.includes('aria-label="Redenen voor aandacht"') &&
    !featureSource.includes("navigate(") && !featureSource.includes("href="),
  "Q19_accessibility_or_no_navigation_boundary_invalid",
);

console.log("EVIDENCE_REVIEW_WORKLIST_UI_Q01_Q19=PASS");
Deno.exit(0);
