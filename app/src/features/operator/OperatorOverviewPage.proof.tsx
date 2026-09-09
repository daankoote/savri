import { renderToStaticMarkup } from "react-dom/server";
import type {
  EvidenceReviewWorklistCaseV4,
  EvidenceReviewWorklistResponseV4,
} from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import { OperatorOverviewContent } from "./OperatorOverviewPage.tsx";
import { buildOperatorNavigation } from "./operatorNavigation.ts";

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

function evidenceCase(
  suffix: string,
  status: EvidenceReviewWorklistCaseV4["overallReviewStatus"],
): EvidenceReviewWorklistCaseV4 {
  const active = status === "TO_REVIEW";
  return {
    caseRef: `CASE-${suffix.padStart(12, "0")}`,
    lifecycleState: "submitted_for_review",
    overallReviewStatus: status,
    unresolvedFactCount: active ? 1 : 0,
    reviewAttentionReasons: active ? ["FACT_REVIEW_REQUIRED"] : [],
    latestReviewActivityAt: "2026-09-05T10:00:00.000Z",
  };
}

function evidenceResponse(
  cases: readonly EvidenceReviewWorklistCaseV4[],
): EvidenceReviewWorklistResponseV4 {
  return {
    schemaVersion: "evidence-review-worklist-v4",
    asOf: "2026-09-05T10:00:00.000Z",
    caseCount: cases.length,
    cases,
  };
}

function html(
  evidence: EvidenceReviewWorklistResponseV4 = evidenceResponse([]),
): string {
  return renderToStaticMarkup(
    <OperatorOverviewContent
      evidenceState={{ status: "ready", value: evidence, error: null }}
      onOpenCase={noop}
      onOpenDossiers={noop}
      onRefreshEvidence={noop}
    />,
  );
}

const previewHtml = html(
  evidenceResponse([
    evidenceCase("1", "TO_REVIEW"),
    evidenceCase("2", "TO_REVIEW"),
    evidenceCase("3", "TO_REVIEW"),
    evidenceCase("4", "TO_REVIEW"),
    evidenceCase("5", "WAITING_CUSTOMER"),
    evidenceCase("6", "CORRECTION_REQUIRED"),
    evidenceCase("7", "REVIEW_COMPLETE"),
    evidenceCase("8", "REVIEW_COMPLETE"),
    evidenceCase("9", "REVIEW_COMPLETE"),
    evidenceCase("10", "REVIEW_COMPLETE"),
  ]),
);
assert(
  previewHtml.includes("<h1>Overzicht</h1>") &&
    previewHtml.includes('<h2 id="toReview-title">Te beoordelen</h2>') &&
    previewHtml.includes(
      '<h2 id="waitingCustomer-title">Wacht op klant</h2>',
    ) &&
    previewHtml.includes('<h2 id="complete-title">Afgerond</h2>') &&
    !previewHtml.includes("Actuele aandachtspunten") &&
    previewHtml.includes(
      'href="/beheer/dossiers#interne-beoordeling"',
    ) &&
    previewHtml.includes('href="/beheer/dossiers#wacht-op-klant"') &&
    previewHtml.includes('href="/beheer/dossiers#afgerond"') &&
    previewHtml.includes('href="/beheer/dossiers/CASE-000000000001"') &&
    previewHtml.includes('href="/beheer/dossiers/CASE-000000000005"'),
  "Q01_dedicated_overview_or_safe_routes_missing",
);
assert(
  previewHtml.includes("CASE-000000000001") &&
    previewHtml.includes("CASE-000000000003") &&
    !previewHtml.includes("CASE-000000000004") &&
    previewHtml.includes("CASE-000000000005") &&
    !previewHtml.includes("CASE-000000000006") &&
    previewHtml.includes("CASE-000000000007") &&
    previewHtml.includes("CASE-000000000009") &&
    !previewHtml.includes("CASE-000000000010"),
  "Q02_preview_limit_or_status_semantics_invalid",
);
assert(
  !/(7 dossiers|12 bron|caseCount|sourceEventCount)/.test(previewHtml),
  "Q03_total_derived_or_exposed",
);

const emptyHtml = html();
assert(
  emptyHtml.includes("Geen dossiers te beoordelen") &&
    emptyHtml.includes("Geen dossiers wachten op klant") &&
    emptyHtml.includes("Geen afgeronde dossiers"),
  "Q04_empty_states_missing",
);

const loadingHtml = renderToStaticMarkup(
  <OperatorOverviewContent
    evidenceState={{ status: "loading", value: null, error: null }}
    onOpenCase={noop}
    onOpenDossiers={noop}
    onRefreshEvidence={noop}
  />,
);
assert(
  loadingHtml.includes("Dossiers laden") &&
    loadingHtml.split('role="status"').length - 1 === 1,
  "Q05_loading_states_missing",
);

const errorHtml = renderToStaticMarkup(
  <OperatorOverviewContent
    evidenceState={{
      status: "error",
      value: null,
      error: {
        code: "service_unavailable",
        message:
          "De dossierwerklijst is tijdelijk niet beschikbaar. Probeer het opnieuw.",
      },
    }}
    onOpenCase={noop}
    onOpenDossiers={noop}
    onRefreshEvidence={noop}
  />,
);
assert(
  errorHtml.includes('role="alert"') &&
    errorHtml.includes("Opnieuw laden") &&
    !errorHtml.includes("Actuele aandachtspunten"),
  "Q06_error_state_or_removed_compliance_work_invalid",
);

assert(
  previewHtml.split(">Alle dossiers</").length - 1 === 3 &&
    !previewHtml.includes("Aandachtspunten laden") &&
    !previewHtml.includes("Inboeking afronden"),
  "Q07_group_routes_or_compliance_presentation_invalid",
);

const navigationContext = {
  actorType: "tenant_workforce",
  tenantReference: "a".repeat(64),
  effectiveCapabilities: ["evidence.review.view"] as const,
  active: true,
  authorized: true,
} as const;
const activeNavigation = [
  ["/beheer", "Overzicht"],
  ["/intern/compliance", "Overzicht"],
  ["/beheer/dossiers", "Dossiers"],
  ["/beheer/dossiers/CASE-000000000001", "Dossiers"],
  ["/intern/dossiers", "Dossiers"],
  ["/intern/dossiers/CASE-000000000001", "Dossiers"],
] as const;
assert(
  activeNavigation.every(([path, label]) => {
    const items = buildOperatorNavigation(navigationContext, path);
    return items.filter((item) => item.active).length === 1 &&
      items.find((item) => item.label === label)?.active === true;
  }),
  "Q08_operator_active_navigation_invalid",
);

const [
  appSource,
  featureSource,
  pageSource,
  navigationSource,
  headerSource,
  worklistSource,
  statusSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/operator/OperatorOverviewPage.tsx"),
  source("app/src/pages/OperatorOverviewPage.tsx"),
  source("app/src/features/operator/operatorNavigation.ts"),
  source("app/src/shared/components/AppHeader.tsx"),
  source("supabase/functions/_shared/app_evidence_review_worklist.ts"),
  source(
    "app/src/features/evidence-review/evidenceReviewStatusPresentation.ts",
  ),
]);
assert(
  appSource.includes('if (path === "/beheer")') &&
    appSource.includes("<OperatorOverviewPage") &&
    pageSource.includes("OperatorRouteGuard") &&
    pageSource.includes('requiredCapability="evidence.review.view"') &&
    pageSource.includes('surface="tenant_operator"') &&
    pageSource.includes("platformAttribution") &&
    navigationSource.includes('label: "Overzicht"') &&
    navigationSource.includes('href: "/beheer"') &&
    navigationSource.includes('label: "Dossiers"') &&
    navigationSource.includes('href: "/beheer/dossiers"') &&
    navigationSource.includes('currentPath.startsWith("/beheer/dossiers/")') &&
    headerSource.includes("item.active ??") &&
    navigationSource.match(/evidence\.review\.view/g)?.length === 2,
  "Q08_route_shell_or_server_capability_boundary_invalid",
);
assert(
  worklistSource.includes('"WAITING_CUSTOMER"') &&
    worklistSource.includes("parseAuthorizedEvidenceReviewSourceRows") &&
    statusSource.includes("WAITING_CUSTOMER") &&
    featureSource.includes('overallReviewStatus === "TO_REVIEW"') &&
    featureSource.includes('overallReviewStatus === "WAITING_CUSTOMER"') &&
    !featureSource.includes("useComplianceWorklist") &&
    !featureSource.includes("ComplianceWorklist") &&
    featureSource.includes("onOpenDossiers") &&
    featureSource.includes("buildEvidenceReviewWorklistGroupRoute") &&
    !/(tenantId|tenant_id|role\s*===|localStorage|sessionStorage)/.test(
      featureSource,
    ),
  "Q09_authoritative_status_or_tenant_boundary_invalid",
);
assert(
  !featureSource.includes("style={{") &&
    !pageSource.includes("style={{") &&
    featureSource.includes("portal-content-stack") &&
    featureSource.includes("portal-card-compact") &&
    featureSource.includes("portal-row-list") &&
    featureSource.includes("review-panel") &&
    featureSource.includes("button button-secondary button-compact") &&
    featureSource.includes("buildEvidenceReviewWorklistGroupRoute"),
  "Q10_shared_primitive_or_inline_css_boundary_invalid",
);

console.log("OPERATOR_OVERVIEW_UI_Q01_Q10=PASS");
Deno.exit(0);
