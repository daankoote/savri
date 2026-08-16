import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider } from "../../features/auth/AuthProvider.tsx";
import { DashboardSidebar } from "../../features/dashboard/DashboardSidebar.tsx";
import { NotFoundPage } from "../../pages/NotFoundPage.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
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
const selectSection = (_section: "active" | "history" | "contact") => undefined;

function renderConsumerSet(
  presentation = projectPresentationBrand(
    ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  ),
): string {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <AppHeader currentPath="/" navigate={navigate} />
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
  envalHtml.includes("Account") && syntheticHtml.includes("Account") &&
    envalHtml.includes("Nieuwe aanvraag") &&
    syntheticHtml.includes("Nieuwe aanvraag") &&
    envalHtml.includes("Actief") && syntheticHtml.includes("Actief"),
  "Q04_auth_or_dashboard_behavior_changed_with_presentation",
);

const [
  providerSource,
  mainSource,
  appSource,
  headerSource,
  sidebarSource,
  notFoundSource,
  authSource,
  tenantResolutionSource,
  legalSource,
  signingFinalizeSource,
] = await Promise.all([
  source("app/src/shared/presentation/PresentationBrandProvider.tsx"),
  source("app/src/main.tsx"),
  source("app/src/App.tsx"),
  source("app/src/shared/components/AppHeader.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
  source("app/src/pages/NotFoundPage.tsx"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("platform/runtime/tenant-resolution/tenant_resolution.ts"),
  source("supabase/functions/_shared/signing_legal_runtime.ts"),
  source("supabase/functions/api-app-signup-signing-finalize/index.ts"),
]);

assert(
  mainSource.includes("<PresentationBrandProvider>") &&
    !mainSource.includes("presentation=") &&
    (mainSource.match(/<PresentationBrandProvider/g) || []).length === 1 &&
    (providerSource.match(/createContext<\s*PublicPresentationBrandV1/g) || [])
        .length === 1 &&
    providerSource.includes("ENVAL_PRESENTATION_BRAND_CONFIG_V1"),
  "Q05_production_does_not_have_one_enval_presentation_source",
);
assert(
  [providerSource, mainSource].every((value) =>
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
    !providerSource.includes("document"),
  "Q11_presentation_config_persisted_or_runtime_fetched",
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

console.log("PRESENTATION_BRAND_CONSUMERS_Q01_Q12=PASS");
Deno.exit(0);
