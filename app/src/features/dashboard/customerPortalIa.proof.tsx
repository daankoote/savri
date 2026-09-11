import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider } from "../auth/AuthProvider";
import { CustomerApplicationList } from "./CustomerApplicationList";
import { DashboardSidebar } from "./DashboardSidebar";
import {
  buildDashboardApplicationRoute,
  DASHBOARD_APPLICATIONS_ROUTE,
  parseDashboardApplicationsRoute,
} from "./dashboardRoutes";
import type { DashboardDossierSummary } from "./dashboardTypes";
import { PresentationBrandProvider } from "../../shared/presentation/PresentationBrandProvider";
import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../../../../platform/runtime/presentation/enval_presentation_defaults";
import { projectPresentationBrand } from "../../../../platform/runtime/presentation/presentation_brand_config";

declare const Deno: {
  exit(code: number): never;
  readTextFile(path: URL): Promise<string>;
};

const root = new URL("../../../../", import.meta.url);

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: {
      hash: "",
      origin: "https://proof.invalid",
      pathname: "/dashboard/aanvragen",
      search: "",
    },
  },
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, root));
}

const application = (
  index: number,
  accountType: DashboardDossierSummary["account_type"],
): DashboardDossierSummary => ({
  dossier_id: `10000000-0000-4000-8000-00000000000${index}`,
  dossier_number: index === 1 ? "D-001" : null,
  account_type: accountType,
  portal_context: accountType === "particulier" ? "customer" : "business",
  status: "submitted",
  document_changes_allowed: true,
  case_id: `20000000-0000-4000-8000-00000000000${index}`,
  case_reference: `CASE-10000000-0000-4000-8000-00000000000${index}`,
  application_label: index === 1
    ? "Proofstraat 10, 1000AA Proefstad"
    : "Aanvraag 2026-09-11 - 000002",
});

const applications = [
  application(1, "particulier"),
  application(2, "zakelijk"),
];
const detailRoute = buildDashboardApplicationRoute(
  applications[0].case_reference,
);
assert(
  detailRoute ===
      `${DASHBOARD_APPLICATIONS_ROUTE}/${applications[0].case_reference}` &&
    parseDashboardApplicationsRoute(DASHBOARD_APPLICATIONS_ROUTE)?.kind ===
      "index" &&
    parseDashboardApplicationsRoute(detailRoute)?.kind === "detail" &&
    parseDashboardApplicationsRoute(
        "/dashboard/aanvragen/geen-geldige-reference",
      )?.kind === "unknown",
  "Q01_dashboard_application_routes_invalid",
);

const navigate = () => undefined;
const listHtml = renderToStaticMarkup(
  <CustomerApplicationList applications={applications} navigate={navigate} />,
);
assert(
  listHtml.includes("Proofstraat 10, 1000AA Proefstad") &&
    listHtml.includes("Aanvraag 2026-09-11 - 000002") &&
    listHtml.includes("Particulier") && listHtml.includes("Zakelijk") &&
    listHtml.includes('href="/dashboard/aanvragen/CASE-') &&
    !listHtml.includes("MID") && !listHtml.includes("<select"),
  "Q02_customer_application_list_contract_invalid",
);

const presentation = projectPresentationBrand(
  ENVAL_PRESENTATION_BRAND_CONFIG_V1,
);
const sidebarHtml = renderToStaticMarkup(
  <PresentationBrandProvider presentation={presentation}>
    <AuthProvider>
      <DashboardSidebar
        activeSection="active"
        applications={applications}
        currentCaseReference={applications[0].case_reference}
        navigate={navigate}
        onSelectSection={() => undefined}
      />
    </AuthProvider>
  </PresentationBrandProvider>,
);
assert(
  sidebarHtml.includes("Nieuwe aanvraag") &&
    sidebarHtml.includes("Aanvragen") &&
    sidebarHtml.includes("Contact ENVAL") &&
    sidebarHtml.includes("Naar website") &&
    sidebarHtml.includes("Uitloggen") &&
    sidebarHtml.includes('aria-current="page"') &&
    applications.every((item) => sidebarHtml.includes(item.application_label)),
  "Q03_sidebar_application_composition_invalid",
);

const [
  appSource,
  shellSource,
  detailSource,
  cacheSource,
  edgeSource,
  migrationSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/dashboard/DashboardPageShell.tsx"),
  source("app/src/features/dashboard/ActivePrivateDashboard.tsx"),
  source("app/src/features/dashboard/dashboardReadCache.ts"),
  source("supabase/functions/api-app-dashboard-get/index.ts"),
  source(
    "supabase/migrations/20260911103144_app_customer_application_index_read_v1.sql",
  ),
]);

assert(
  appSource.includes('if (path !== "/dashboard") return;') &&
    appSource.includes("window.history.replaceState") &&
    appSource.includes("parseDashboardApplicationsRoute(path)"),
  "Q04_dashboard_replace_redirect_missing",
);
assert(
  shellSource.includes("useDashboardApplications") &&
    shellSource.includes(
      "application.case_reference === route.caseReference",
    ) &&
    !shellSource.includes("auth.summary?.dossiers") &&
    !detailSource.includes("<select") &&
    detailSource.includes("application.application_label") &&
    detailSource.includes(
      "dashboardRead.model?.selected_dossier.dossier_id ===",
    ),
  "Q05_index_authority_or_stale_detail_guard_missing",
);
assert(
  cacheSource.includes("inMemoryApplicationIndexes") &&
    cacheSource.includes("scopeGeneration(cacheScope) === generation") &&
    cacheSource.includes(
      "pendingApplicationIndexes.get(cacheScope) === pending",
    ) &&
    cacheSource.includes("pendingDashboardReads.get(key) === pending"),
  "Q06_actor_scoped_index_cache_missing",
);
assert(
  edgeSource.includes('SB.rpc("app_customer_application_index_read_v1"') &&
    edgeSource.includes('normalized.payload.mode === "applications"') &&
    edgeSource.includes("if (!selectedApplication)") &&
    !edgeSource.includes("body.auth_user_id") &&
    !edgeSource.includes("body.customer_id") &&
    !edgeSource.includes("body.tenant_id"),
  "Q07_edge_index_contract_invalid",
);
assert(
  migrationSource.includes("stable") &&
    migrationSource.includes("security definer") &&
    migrationSource.includes("set search_path = ''") &&
    migrationSource.includes("access_grant.granted_case_id is null") &&
    migrationSource.includes("access_grant.granted_case_id = case_row.id") &&
    migrationSource.includes("from public;") &&
    migrationSource.includes("from anon;") &&
    migrationSource.includes("from authenticated;") &&
    migrationSource.includes("to service_role;") &&
    !/\b(insert|update|delete)\b/i.test(
      migrationSource.replace(/comment on function[\s\S]*?;/gi, ""),
    ),
  "Q08_service_role_read_only_R7_contract_invalid",
);

console.log("CUSTOMER_PORTAL_IA_V1_Q01_Q08=PASS");
Deno.exit(0);
