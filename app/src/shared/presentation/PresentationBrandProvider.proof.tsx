import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider } from "../../features/auth/AuthProvider.tsx";
import { DashboardPageShell } from "../../features/dashboard/DashboardPageShell.tsx";
import { DashboardSidebar } from "../../features/dashboard/DashboardSidebar.tsx";
import { SignupPageShell } from "../../features/signup/SignupPageShell.tsx";
import { NotFoundPage } from "../../pages/NotFoundPage.tsx";
import { HomePage } from "../../pages/HomePage.tsx";
import { PrivacyPage } from "../../pages/PrivacyPage.tsx";
import { AccountPage } from "../../pages/AccountPage.tsx";
import { ContactChoicePanel } from "../../features/dashboard/ContactChoicePanel.tsx";
import { SignupSubmitStatusPanel } from "../../features/signup/SignupSubmitStatusPanel.tsx";
import { ConsentSignatureSection } from "../../features/signup/ConsentSignatureSection.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { SurfaceShell } from "../components/SurfaceShell.tsx";
import { APP_SURFACES } from "../surfaces/surfaceModel.ts";
import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../../../../platform/runtime/presentation/enval_presentation_defaults.ts";
import {
  projectPresentationBrand,
  validatePresentationBrandConfigV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";
import {
  formatPresentationBrandCopy,
  PresentationBrandProvider,
  projectPresentationSurfaceIdentity,
} from "./PresentationBrandProvider.tsx";

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
  value: {
    location: {
      hash: "",
      origin: "https://proof.invalid",
      pathname: "/",
      search: "",
    },
  },
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
          applications={[]}
          currentCaseReference={null}
          navigate={navigate}
          onSelectSection={selectSection}
        />
      </AuthProvider>
      <NotFoundPage currentPath="/missing" navigate={navigate} />
    </PresentationBrandProvider>,
  );
}

function renderAuthenticatedConsumerSet(
  presentation = projectPresentationBrand(
    ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  ),
): string {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <AppHeader
        currentPath="/beheer"
        identitySurface="tenant_operator"
        navigate={navigate}
        navigation={[]}
        surface="tenant_operator"
      />
      <AppHeader
        currentPath="/inloggen"
        identitySurface="public_auth"
        navigate={navigate}
        navigation={[]}
        surface="tenant_customer"
      />
      <AuthProvider>
        <DashboardSidebar
          activeSection="active"
          applications={[]}
          currentCaseReference={null}
          navigate={navigate}
          onSelectSection={selectSection}
        />
      </AuthProvider>
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
        <DashboardPageShell
          currentPath="/dashboard/aanvragen"
          navigate={navigate}
        />
      </AuthProvider>
    </PresentationBrandProvider>,
  );
}

function renderOrdinaryBrandCopy(
  presentation = projectPresentationBrand(
    ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  ),
): string {
  const previousHash = window.location.hash;
  window.location.hash = "#activeren";
  const html = renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <HomePage currentPath="/" navigate={navigate} />
      <PrivacyPage currentPath="/privacy" navigate={navigate} />
      <ContactChoicePanel />
      <AuthProvider audience="portal" intent="portal">
        <AccountPage currentPath="/inloggen" navigate={navigate} />
      </AuthProvider>
      <SignupSubmitStatusPanel
        state={{
          status: "success",
          result: {
            ok: true,
            mode: "write_v3",
            request_id: "request-proof",
            customer_id: "customer-proof",
            dossier_id: "dossier-proof",
            location_count: 1,
            charger_count: 1,
            document_slot_count: 1,
            legal_acceptance_count: 1,
            payload_hash: "hash-proof",
            message: "ok",
          },
        }}
      />
      <ConsentSignatureSection
        error={{
          id: "consents.terms.required",
          fieldPath: "consents.termsBundleAccepted",
          message:
            "Accepteer de voorwaarden voordat ENVAL uw dossier kan starten.",
          severity: "error",
        }}
        value={{ termsBundleAccepted: false }}
        onChange={() => undefined}
      />
    </PresentationBrandProvider>,
  );
  window.location.hash = previousHash;
  return html;
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
  identity: {
    websiteUrl: "https://example.test/",
    contactRoute: "/contact",
    mailDisplayName: "Example Mobility",
    mailAddress: "mail@example.test",
    legalName: "Example Mobility B.V.",
  },
  exportBasename: "example-mobility-documents",
});
assert(syntheticResult.ok, "synthetic_presentation_invalid");
const displayNameOnlyResult = validatePresentationBrandConfigV1({
  ...ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  configVersion: "testname-presentation-v1",
  displayName: "Testnaam",
});
assert(displayNameOnlyResult.ok, "display_name_only_config_invalid");

const envalHtml = renderConsumerSet();
const syntheticHtml = renderConsumerSet(
  projectPresentationBrand(syntheticResult.value),
);
const authenticatedEnvalHtml = renderAuthenticatedConsumerSet();
const authenticatedSyntheticHtml = renderAuthenticatedConsumerSet(
  projectPresentationBrand(syntheticResult.value),
);
const tenantPublicHtml = renderTenantPublicPath();
const customerDashboardHtml = renderCustomerDashboardPath();
const envalOrdinaryCopyHtml = renderOrdinaryBrandCopy();
const syntheticOrdinaryCopyHtml = renderOrdinaryBrandCopy(
  projectPresentationBrand(syntheticResult.value),
);
const displayNameOnlyHtml = renderOrdinaryBrandCopy(
  projectPresentationBrand(displayNameOnlyResult.value),
);
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
    syntheticHtml.includes("Klantportaal") &&
    !syntheticHtml.includes(
      "Deze pagina bestaat nog niet in de nieuwe ENVAL app",
    ),
  "Q02_synthetic_brand_not_rendered_in_migrated_consumers",
);
assert(
  envalHtml.includes("Contact ENVAL") &&
    syntheticHtml.includes("Contact Example Mobility") &&
    !syntheticHtml.includes("Contact ENVAL"),
  "Q03_product_contact_copy_not_branded",
);
assert(
  envalHtml.includes("Nieuwe aanvraag") &&
    syntheticHtml.includes("Nieuwe aanvraag") &&
    envalHtml.includes("Aanvragen") && syntheticHtml.includes("Aanvragen") &&
    !envalHtml.includes("History") && !syntheticHtml.includes("Settings"),
  "Q04_auth_or_dashboard_behavior_changed_with_presentation",
);
for (
  const [label, expected] of [
    ["home", "Waarom ENVAL"],
    ["privacy", "Privacyinformatie voor de ENVAL"],
    ["contact", "Contact ENVAL"],
    ["auth", "ENVAL-klantportaal"],
    ["signup", "ENVAL heeft je aanmelding ontvangen"],
    ["validation", "voordat ENVAL uw dossier kan starten"],
  ] as const
) {
  assert(
    envalOrdinaryCopyHtml.includes(expected),
    `Q04a_enval_ordinary_copy_missing:${label}`,
  );
}
for (
  const [label, expected, stale] of [
    ["home", "Waarom Example Mobility", "Waarom ENVAL"],
    [
      "privacy",
      "Privacyinformatie voor de Example Mobility",
      "Privacyinformatie voor de ENVAL",
    ],
    ["contact", "Contact Example Mobility", "Contact ENVAL"],
    ["auth", "Example Mobility-klantportaal", "ENVAL-klantportaal"],
    [
      "signup",
      "Example Mobility heeft je aanmelding ontvangen",
      "ENVAL heeft je aanmelding ontvangen",
    ],
    [
      "validation",
      "voordat Example Mobility uw dossier kan starten",
      "voordat ENVAL uw dossier kan starten",
    ],
  ] as const
) {
  assert(
    syntheticOrdinaryCopyHtml.includes(expected) &&
      !syntheticOrdinaryCopyHtml.includes(stale),
    `Q04a_synthetic_ordinary_copy_invalid:${label}`,
  );
}
assert(
  displayNameOnlyHtml.includes("Waarom Testnaam") &&
    displayNameOnlyHtml.includes("Contact Testnaam") &&
    !displayNameOnlyHtml.includes("Waarom ENVAL") &&
    !displayNameOnlyHtml.includes("Contact ENVAL") &&
    displayNameOnlyResult.value.shortMark === "E" &&
    displayNameOnlyResult.value.productLabel === "Klantportaal" &&
    displayNameOnlyResult.value.identity.legalName === "ENVAL B.V." &&
    displayNameOnlyResult.value.identity.mailDisplayName === "ENVAL" &&
    displayNameOnlyResult.value.identity.mailAddress ===
      "noreply@enval.local" &&
    displayNameOnlyResult.value.identity.websiteUrl ===
      "https://www.enval.nl/",
  "Q04b_primary_display_name_changed_independent_identity",
);
assert(
  authenticatedEnvalHtml.includes("ENVAL") &&
    authenticatedEnvalHtml.includes("Inloggen") &&
    authenticatedEnvalHtml.includes("Dossierbeheer") &&
    authenticatedEnvalHtml.includes("Klantportaal") &&
    !authenticatedEnvalHtml.includes("ERE inboekservice"),
  "Q18_authenticated_enval_surface_identity_invalid",
);
assert(
  authenticatedSyntheticHtml.includes("Example Mobility") &&
    authenticatedSyntheticHtml.includes(">EM<") &&
    authenticatedSyntheticHtml.includes("Inloggen") &&
    authenticatedSyntheticHtml.includes("Dossierbeheer") &&
    authenticatedSyntheticHtml.includes("Klantportaal") &&
    !authenticatedSyntheticHtml.includes("Clean mobility service") &&
    !authenticatedSyntheticHtml.includes("Mobility portal"),
  "Q19_authenticated_tenant_surface_identity_invalid",
);

const authIdentity = projectPresentationSurfaceIdentity(
  projectPresentationBrand(syntheticResult.value),
  "public_auth",
);
const customerIdentity = projectPresentationSurfaceIdentity(
  projectPresentationBrand(syntheticResult.value),
  "tenant_customer",
);
const workforceIdentity = projectPresentationSurfaceIdentity(
  projectPresentationBrand(syntheticResult.value),
  "tenant_operator",
);
assert(
  authIdentity.organizationName === "Example Mobility" &&
    authIdentity.shortMark === "EM" &&
    authIdentity.contextLabel === "Inloggen" &&
    customerIdentity.organizationName === "Example Mobility" &&
    customerIdentity.shortMark === "EM" &&
    customerIdentity.contextLabel === "Klantportaal" &&
    workforceIdentity.organizationName === "Example Mobility" &&
    workforceIdentity.shortMark === "EM" &&
    workforceIdentity.contextLabel === "Dossierbeheer",
  "Q20_authenticated_surface_projection_invalid",
);
assert(
  formatPresentationBrandCopy(
        "ENVAL controleert uw dossier.",
        syntheticResult.value.displayName,
      ) === "Example Mobility controleert uw dossier." &&
    formatPresentationBrandCopy(
        "ENVAL beoordelen",
        syntheticResult.value.displayName,
      ) === "Example Mobility beoordelen" &&
    formatPresentationBrandCopy(
        "ENVAL checken",
        syntheticResult.value.displayName,
      ) === "Example Mobility checken",
  "Q20a_classified_status_copy_not_branded",
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
  operatorOverviewRouteSource,
  complianceRouteSource,
  evidenceWorklistRouteSource,
  evidenceDetailRouteSource,
  accountRouteSource,
  operatorContextSource,
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
  source("app/src/pages/OperatorOverviewPage.tsx"),
  source("app/src/pages/ComplianceWorklistPage.tsx"),
  source("app/src/pages/EvidenceReviewWorklistPage.tsx"),
  source("app/src/pages/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/pages/AccountPage.tsx"),
  source("app/src/features/operator/operatorContextClient.ts"),
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
  appSource.includes("AUTH_ACCOUNT_COMPATIBILITY_ROUTE") &&
    appSource.includes("AUTH_LOGIN_ROUTE") &&
    appSource.includes('"/dashboard"') &&
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
  sidebarSource.includes("Contact {presentation.displayName}") &&
    sidebarSource.includes("presentation.identity.websiteUrl") &&
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
    syntheticHtml.includes(">Powered by Example Mobility</footer>") &&
    !syntheticHtml.includes("Powered by ENVAL") &&
    (syntheticHtml.match(/Powered by Example Mobility/g) || []).length === 1,
  "Q13_surface_model_or_shared_attribution_invalid",
);
assert(
  homePageSource.includes("<SurfaceShell") &&
    signupShellSource.includes('surface="tenant_public"') &&
    dashboardShellSource.includes('surface="tenant_customer"') &&
    (dashboardShellSource.match(/platformAttribution/g) || []).length === 1 &&
    surfaceShellSource.includes("Powered by {presentation.displayName}") &&
    !surfaceShellSource.includes("Powered by ENVAL") &&
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
  appSource.includes('path === "/beheer"') &&
    appSource.includes('path === "/intern/compliance"') &&
    appSource.includes(
      'path === "/beheer/dossiers" || path === "/intern/dossiers"',
    ) &&
    appSource.includes('<AuthProvider audience="operator">') &&
    sidebarSource.includes("Aanvragen") &&
    sidebarSource.includes("navigate(AUTH_LOGIN_ROUTE)") &&
    !sidebarSource.match(
      /onClick=\{\(\) => navigate\("\/account"\)\}[\s\S]{0,120}>\s*Account/,
    ) &&
    !sidebarSource.includes("Berichten") &&
    !sidebarSource.includes("Settings") &&
    !sidebarSource.includes("History"),
  "Q17_route_or_customer_navigation_scope_invalid",
);
assert(
  [
    operatorOverviewRouteSource,
    complianceRouteSource,
    evidenceWorklistRouteSource,
    evidenceDetailRouteSource,
  ].every((value) =>
    value.includes('identitySurface="tenant_operator"') &&
    value.includes("<OperatorRouteGuard")
  ) &&
    accountRouteSource.includes('identitySurface="public_auth"') &&
    headerSource.includes("projectPresentationSurfaceIdentity") &&
    sidebarSource.includes("projectPresentationSurfaceIdentity") &&
    providerSource.includes('public_auth: "Inloggen"') &&
    providerSource.includes('tenant_customer: "Klantportaal"') &&
    providerSource.includes('tenant_operator: "Dossierbeheer"'),
  "Q21_authenticated_identity_composition_or_guard_invalid",
);
assert(
  operatorContextSource.includes('actorType: "tenant_workforce"') &&
    !operatorContextSource.match(
      /enval_(?:workforce|platform)|platform_actor/,
    ) &&
    !providerSource.match(/email|roleName|role_name|location\.pathname/) &&
    !headerSource.match(/displayName\s*===|organizationName\s*===/),
  "Q22_unproven_enval_or_browser_identity_heuristic_present",
);

console.log("CUSTOMER_DASHBOARD_ATTRIBUTION_COUNT=1");
console.log("TENANT_PUBLIC_ATTRIBUTION_COUNT=1");
console.log("PRESENTATION_BRAND_CONSUMERS_Q01_Q22=PASS");
Deno.exit(0);
