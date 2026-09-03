import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider } from "../../features/auth/AuthProvider.tsx";
import { DashboardPageShell } from "../../features/dashboard/DashboardPageShell.tsx";
import { DashboardSidebar } from "../../features/dashboard/DashboardSidebar.tsx";
import { SignupPageShell } from "../../features/signup/SignupPageShell.tsx";
import { NotFoundPage } from "../../pages/NotFoundPage.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { SurfaceShell } from "../components/SurfaceShell.tsx";
import { APP_SURFACES } from "../surfaces/surfaceModel.ts";
import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../../../../platform/runtime/presentation/enval_presentation_defaults.ts";
import {
  projectPresentationBrand,
  validatePresentationBrandConfigV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";
import { PresentationBrandProvider } from "./PresentationBrandProvider.tsx";

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

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { origin: "https://proof.invalid" } },
});

const navigate = (_href: string) => undefined;
const selectSection = (_section: "active" | "contact") => undefined;

function renderConsumerSet(
  presentation = projectPresentationBrand(
    ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  ),
): string {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <SurfaceShell
        navigation={
          <AppHeader
            currentPath="/aanmelden"
            navigate={navigate}
            surface="tenant_public"
          />
        }
        platformAttribution
        surface="tenant_public"
      >
        <main>Surface proof</main>
      </SurfaceShell>
      <AuthProvider>
        <DashboardSidebar
          activeSection="active"
          navigate={navigate}
          onSelectSection={selectSection}
        />
      </AuthProvider>
      <NotFoundPage currentPath="/missing" navigate={navigate} />
    </PresentationBrandProvider>,
  );
}

function renderTenantPublicPath(
  presentation = projectPresentationBrand(
    ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  ),
): string {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <AuthProvider>
        <SignupPageShell currentPath="/aanmelden" navigate={navigate} />
      </AuthProvider>
    </PresentationBrandProvider>,
  );
}

function renderCustomerDashboardPath(
  presentation = projectPresentationBrand(
    ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  ),
): string {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <AuthProvider>
        <DashboardPageShell navigate={navigate} />
      </AuthProvider>
    </PresentationBrandProvider>,
  );
}

const syntheticResult = validatePresentationBrandConfigV1({
  schemaVersion: "presentation-brand-config-v1",
  configVersion: "example-mobility-presentation-v1",
  displayName: "Example Mobility",
  shortMark: "EM",
  productLabel: "Mobility portal",
  tagline: "Clean mobility service",
  assets: {
    logo: "/assets/brand/example-mobility.svg",
    altText: "Example Mobility",
  },
  exportBasename: "example-mobility-documents",
});
assert(syntheticResult.ok, "synthetic_presentation_invalid");

const envalHtml = renderConsumerSet();
const syntheticHtml = renderConsumerSet(
  projectPresentationBrand(syntheticResult.value),
);
const tenantPublicHtml = renderTenantPublicPath();
const customerDashboardHtml = renderCustomerDashboardPath();
assert(
  envalHtml.includes("ENVAL") && envalHtml.includes(">E<") &&
    envalHtml.includes("ERE inboekservice") &&
    envalHtml.includes("Klantportaal"),
  "Q01_enval_defaults_not_rendered",
);
assert(
  syntheticHtml.includes("Example Mobility") &&
    syntheticHtml.includes(">EM<") &&
    syntheticHtml.includes("Clean mobility service") &&
    syntheticHtml.includes("Mobility portal") &&
    !syntheticHtml.includes(
      "Deze pagina bestaat nog niet in de nieuwe ENVAL app",
    ),
  "Q02_synthetic_brand_not_rendered_in_migrated_consumers",
);
assert(
  envalHtml.includes("Contact ENVAL") &&
    syntheticHtml.includes("Contact ENVAL"),
  "Q03_support_identity_changed_with_presentation",
);
assert(
  envalHtml.includes("Nieuwe aanvraag") &&
    syntheticHtml.includes("Nieuwe aanvraag") &&
    envalHtml.includes("Overzicht") && syntheticHtml.includes("Overzicht") &&
    !envalHtml.includes("History") && !syntheticHtml.includes("Settings"),
  "Q04_auth_or_dashboard_behavior_changed_with_presentation",
);

const [
  providerSource,
  runtimeSource,
  bootstrapClientSource,
  mainSource,
  appSource,
  headerSource,
  sidebarSource,
  notFoundSource,
  authSource,
  tenantResolutionSource,
  legalSource,
  signingFinalizeSource,
  surfaceShellSource,
  surfaceModelSource,
  homePageSource,
  signupShellSource,
  dashboardShellSource,
  layoutSource,
] = await Promise.all([
  source("app/src/shared/presentation/PresentationBrandProvider.tsx"),
  source("app/src/shared/presentation/PresentationBrandRuntime.tsx"),
  source("app/src/shared/presentation/presentationBootstrapClient.ts"),
  source("app/src/main.tsx"),
  source("app/src/App.tsx"),
  source("app/src/shared/components/AppHeader.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
  source("app/src/pages/NotFoundPage.tsx"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("platform/runtime/tenant-resolution/tenant_resolution.ts"),
  source("supabase/functions/_shared/signing_legal_runtime.ts"),
  source("supabase/functions/api-app-signup-signing-finalize/index.ts"),
  source("app/src/shared/components/SurfaceShell.tsx"),
  source("app/src/shared/surfaces/surfaceModel.ts"),
  source("app/src/pages/HomePage.tsx"),
  source("app/src/features/signup/SignupPageShell.tsx"),
  source("app/src/features/dashboard/DashboardPageShell.tsx"),
  source("app/src/styles/layout.css"),
]);

assert(
  mainSource.includes("<PresentationBrandRuntime>") &&
    (mainSource.match(/<PresentationBrandRuntime/g) || []).length === 1 &&
    runtimeSource.includes(
      "<PresentationBrandProvider presentation={state.presentation}>",
    ) &&
    (providerSource.match(/createContext<\s*PublicPresentationBrandV1/g) || [])
        .length === 1 &&
    !providerSource.includes("ENVAL_PRESENTATION_BRAND_CONFIG_V1") &&
    providerSource.includes("presentation: PublicPresentationBrandV1"),
  "Q05_production_not_wired_to_server_presentation_runtime",
);
assert(
  [providerSource, runtimeSource, bootstrapClientSource, mainSource].every((
    value,
  ) =>
    !/(URLSearchParams|location\.search|localStorage|sessionStorage|document\.cookie)/
      .test(value)
  ),
  "Q06_browser_brand_selection_surface_present",
);
assert(
  !/(tenantId|routingIdentity|dataPlane|locator|secretReference|credential|legalOperator|representationAuthority|supportCapabilities)/
    .test(providerSource) &&
    [headerSource, sidebarSource, notFoundSource].every((value) =>
      !/displayName\s*===|shortMark\s*===|switch\s*\(.*(?:displayName|shortMark)/s
        .test(value)
    ),
  "Q07_branding_became_security_or_business_authority",
);
assert(
  appSource.includes('"/account"') && appSource.includes('"/dashboard"') &&
    appSource.includes('"/aanmelden"') && appSource.includes('"/privacy"') &&
    appSource.includes('"/voorwaarden"') &&
    !appSource.includes("PresentationBrand"),
  "Q08_routes_changed_or_brand_dependent",
);
assert(
  !authSource.includes("PresentationBrand") &&
    !tenantResolutionSource.includes("PresentationBrand") &&
    !legalSource.includes("PresentationBrand") &&
    !signingFinalizeSource.includes("PresentationBrand"),
  "Q09_auth_tenant_or_signing_legal_source_depends_on_branding",
);
assert(
  sidebarSource.includes("Contact ENVAL") &&
    !sidebarSource.includes("Contact ${presentation") &&
    legalSource.includes("ENVAL B.V.") &&
    signingFinalizeSource.includes("content_sha256") &&
    signingFinalizeSource.includes("canonical_snapshot"),
  "Q10_support_or_historical_legal_identity_changed",
);
assert(
  !providerSource.includes("useState") &&
    !providerSource.includes("useEffect") &&
    !providerSource.includes("fetch(") &&
    !providerSource.includes("window") &&
    !providerSource.includes("document") &&
    runtimeSource.includes("loadPresentationBootstrap") &&
    bootstrapClientSource.includes("api-app-presentation-bootstrap") &&
    bootstrapClientSource.includes("validatePresentationBrandConfigV1"),
  "Q11_runtime_bootstrap_or_provider_boundary_invalid",
);
assert(
  !headerSource.includes(">ENVAL</strong>") &&
    !sidebarSource.includes(">ENVAL</strong>") &&
    !notFoundSource.includes("nieuwe ENVAL app") &&
    !headerSource.includes("style={{") &&
    !sidebarSource.includes("style={{") &&
    !notFoundSource.includes("style={{"),
  "Q12_migrated_consumer_or_css_boundary_invalid",
);

assert(
  APP_SURFACES.join("|") ===
      "public|tenant_public|tenant_customer|tenant_operator|enval_control|verifier" &&
    syntheticHtml.includes('data-app-surface="tenant_public"') &&
    syntheticHtml.includes(">Powered by ENVAL</footer>") &&
    (syntheticHtml.match(/Powered by ENVAL/g) || []).length === 1,
  "Q13_surface_model_or_shared_attribution_invalid",
);
assert(
  homePageSource.includes("<SurfaceShell") &&
    signupShellSource.includes('surface="tenant_public"') &&
    dashboardShellSource.includes('surface="tenant_customer"') &&
    (dashboardShellSource.match(/platformAttribution/g) || []).length === 1 &&
    (surfaceShellSource.match(/Powered by ENVAL/g) || []).length === 1 &&
    !surfaceShellSource.match(/useAuth|Supabase|capability|tenantId/) &&
    !surfaceModelSource.match(/useAuth|Supabase|capability|tenantId/) &&
    !surfaceShellSource.includes("style={{"),
  "Q14_shared_shell_or_authority_boundary_invalid",
);
assert(
  (tenantPublicHtml.match(/Powered by ENVAL/g) || []).length === 1 &&
    tenantPublicHtml.includes('data-app-surface="tenant_public"') &&
    (customerDashboardHtml.match(/Powered by ENVAL/g) || []).length === 1 &&
    customerDashboardHtml.includes('data-app-surface="tenant_customer"'),
  "Q15_actual_surface_attribution_count_invalid",
);
assert(
  layoutSource.includes(
    ".portal-shell > .surface-attribution {\n  grid-column: 2;\n}",
  ) &&
    layoutSource.includes(
      ".portal-shell:not(.portal-shell--sidebar-collapsed) > .surface-attribution {\n    grid-column: 1;\n  }",
    ),
  "Q16_portal_attribution_grid_placement_invalid",
);
assert(
  appSource.includes('path === "/beheer" || path === "/intern/compliance"') &&
    appSource.includes(
      'path === "/beheer/dossiers" || path === "/intern/dossiers"',
    ) &&
    appSource.includes('<AuthProvider audience="operator">') &&
    sidebarSource.includes("Overzicht") &&
    (sidebarSource.match(/navigate\("\/account"\)/g) || []).length === 1 &&
    !sidebarSource.match(
      /onClick=\{\(\) => navigate\("\/account"\)\}[\s\S]{0,120}>\s*Account/,
    ) &&
    !sidebarSource.includes("Berichten") &&
    !sidebarSource.includes("Settings") &&
    !sidebarSource.includes("History"),
  "Q17_route_or_customer_navigation_scope_invalid",
);

console.log("CUSTOMER_DASHBOARD_ATTRIBUTION_COUNT=1");
console.log("TENANT_PUBLIC_ATTRIBUTION_COUNT=1");
console.log("PRESENTATION_BRAND_CONSUMERS_Q01_Q17=PASS");
Deno.exit(0);
