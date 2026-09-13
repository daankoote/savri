import { renderToStaticMarkup } from "react-dom/server";
import { AppHeader } from "../components/AppHeader.tsx";
import { DashboardSidebar } from "../../features/dashboard/DashboardSidebar.tsx";
import { AuthProvider } from "../../features/auth/AuthProvider.tsx";
import { NotFoundPage } from "../../pages/NotFoundPage.tsx";
import { PresentationBrandProvider } from "./PresentationBrandProvider.tsx";
import { decodePresentationBootstrapResponse } from "./presentationBootstrapClient.ts";
import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../../../../platform/runtime/presentation/enval_presentation_defaults.ts";
import type {
  PlatformPresentationConfigReader,
  PlatformPresentationConfigRecord,
} from "../../../../platform/runtime/presentation/adapters/platform_control_plane_presentation_v1.ts";
import {
  projectPresentationBrand,
  validatePresentationBrandConfigV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";
import type { ServerOwnedPresentationSourceComposition } from "../../../../platform/runtime/presentation/presentation_source_composition.ts";
import {
  type AppPresentationTenantBinding,
  buildServerOwnedPresentationSourceComposition,
  resolveAppPresentationBootstrap,
} from "../../../../supabase/functions/_shared/app_presentation_bootstrap.ts";

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

const TENANT_ID = "51000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "51000000-0000-4000-8000-000000000002";

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

const tenantExecution: AppPresentationTenantBinding = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
});

const syntheticValidation = validatePresentationBrandConfigV1({
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
assert(syntheticValidation.ok, "synthetic_config_invalid");
const synthetic = syntheticValidation.value;

function record(
  config = ENVAL_PRESENTATION_BRAND_CONFIG_V1,
  overrides: Partial<PlatformPresentationConfigRecord> = {},
): PlatformPresentationConfigRecord {
  return {
    tenantId: TENANT_ID,
    environment: "local",
    versionSequence: 1,
    schemaVersion: config.schemaVersion,
    configVersion: config.configVersion,
    displayName: config.displayName,
    shortMark: config.shortMark,
    productLabel: config.productLabel,
    tagline: config.tagline ?? null,
    logoReference: config.assets.logo,
    logoInverseReference: config.assets.logoInverse ?? null,
    faviconReference: config.assets.favicon ?? null,
    socialImageReference: config.assets.socialImage ?? null,
    assetAltText: config.assets.altText,
    exportBasename: config.exportBasename ?? null,
    ...overrides,
  };
}

function managedReader(
  records: readonly PlatformPresentationConfigRecord[],
): PlatformPresentationConfigReader {
  return {
    async findCurrentPresentationConfigs() {
      return records;
    },
  };
}

function environment(values: Record<string, string>) {
  return { get: (name: string) => values[name] };
}

async function bootstrap(
  composition: ServerOwnedPresentationSourceComposition,
  execution = tenantExecution,
) {
  const result = await resolveAppPresentationBootstrap(execution, composition);
  assert(result.ok, "presentation_bootstrap_failed");
  const decoded = decodePresentationBootstrapResponse(result.value);
  assert(decoded.ok, "browser_projection_decode_failed");
  return decoded.presentation;
}

function renderConsumers(
  presentation: ReturnType<typeof projectPresentationBrand>,
) {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <AppHeader currentPath="/" navigate={() => undefined} />
      <AuthProvider>
        <DashboardSidebar
          activeSection="active"
          applications={[]}
          currentCaseReference={null}
          navigate={() => undefined}
          onSelectSection={() => undefined}
        />
      </AuthProvider>
      <NotFoundPage currentPath="/missing" navigate={() => undefined} />
    </PresentationBrandProvider>,
  );
}

function renderAuthenticatedConsumers(
  presentation: ReturnType<typeof projectPresentationBrand>,
) {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <AppHeader
        currentPath="/beheer"
        identitySurface="tenant_operator"
        navigate={() => undefined}
        navigation={[]}
        surface="tenant_operator"
      />
      <AppHeader
        currentPath="/inloggen"
        identitySurface="public_auth"
        navigate={() => undefined}
        navigation={[]}
        surface="tenant_customer"
      />
      <AuthProvider>
        <DashboardSidebar
          activeSection="active"
          applications={[]}
          currentCaseReference={null}
          navigate={() => undefined}
          onSelectSection={() => undefined}
        />
      </AuthProvider>
    </PresentationBrandProvider>,
  );
}

const managedEnvalReader = managedReader([record()]);
const managedEnvalComposition = buildServerOwnedPresentationSourceComposition(
  environment({
    ENVAL_PRESENTATION_SOURCE_MODE: "platform_control_plane_presentation_v1",
  }),
  tenantExecution,
  managedEnvalReader,
);
assert(managedEnvalComposition !== null, "managed_enval_composition_failed");
const standaloneEnvalComposition =
  buildServerOwnedPresentationSourceComposition(
    environment({
      ENVAL_PRESENTATION_SOURCE_MODE: "static_presentation_config_v1",
      ENVAL_STATIC_PRESENTATION_MODE: "ENVAL_DEFAULTS",
    }),
    tenantExecution,
  );
assert(
  standaloneEnvalComposition !== null,
  "standalone_enval_composition_failed",
);
const managedEnval = await bootstrap(managedEnvalComposition);
const standaloneEnval = await bootstrap(standaloneEnvalComposition);
assert(
  JSON.stringify(managedEnval) === JSON.stringify(standaloneEnval) &&
    JSON.stringify(managedEnval) === JSON.stringify(
        projectPresentationBrand(ENVAL_PRESENTATION_BRAND_CONFIG_V1),
      ),
  "Q01_managed_standalone_enval_runtime_parity_failed",
);

const managedSyntheticComposition =
  buildServerOwnedPresentationSourceComposition(
    environment({
      ENVAL_PRESENTATION_SOURCE_MODE: "platform_control_plane_presentation_v1",
    }),
    tenantExecution,
    managedReader([record(synthetic)]),
  );
const standaloneSyntheticComposition =
  buildServerOwnedPresentationSourceComposition(
    environment({
      ENVAL_PRESENTATION_SOURCE_MODE: "static_presentation_config_v1",
      ENVAL_STATIC_PRESENTATION_MODE: "CUSTOM_V1",
      ENVAL_STATIC_PRESENTATION_CONFIG_V1: JSON.stringify(synthetic),
    }),
    tenantExecution,
  );
assert(
  managedSyntheticComposition !== null &&
    standaloneSyntheticComposition !== null,
  "synthetic_composition_failed",
);
const managedSynthetic = await bootstrap(managedSyntheticComposition);
const standaloneSynthetic = await bootstrap(standaloneSyntheticComposition);
assert(
  JSON.stringify(managedSynthetic) === JSON.stringify(standaloneSynthetic) &&
    managedSynthetic.displayName === "Example Mobility",
  "Q02_managed_standalone_synthetic_runtime_parity_failed",
);

const envalHtml = renderConsumers(managedEnval);
const syntheticHtml = renderConsumers(managedSynthetic);
const authenticatedEnvalHtml = renderAuthenticatedConsumers(managedEnval);
const authenticatedSyntheticHtml = renderAuthenticatedConsumers(
  managedSynthetic,
);
assert(
  envalHtml.includes("ENVAL") && envalHtml.includes(">E<") &&
    envalHtml.includes("ERE inboekservice") &&
    envalHtml.includes("Klantportaal"),
  "Q03_enval_visual_parity_failed",
);
assert(
  syntheticHtml.includes("Example Mobility") &&
    syntheticHtml.includes(">EM<") &&
    syntheticHtml.includes("Klantportaal") &&
    !syntheticHtml.includes("nieuwe ENVAL app"),
  "Q04_synthetic_projection_did_not_reach_consumers",
);

const sourceUnavailable = await resolveAppPresentationBootstrap(
  tenantExecution,
  {
    deploymentMode: "platform_control_plane_presentation_v1",
    platformControlPlaneReader: {
      async findCurrentPresentationConfigs() {
        throw new Error("private provider detail");
      },
    },
  },
);
const ambiguous = await resolveAppPresentationBootstrap(tenantExecution, {
  deploymentMode: "platform_control_plane_presentation_v1",
  platformControlPlaneReader: managedReader([record(), record()]),
});
const invalid = await resolveAppPresentationBootstrap(tenantExecution, {
  deploymentMode: "platform_control_plane_presentation_v1",
  platformControlPlaneReader: managedReader([
    record(ENVAL_PRESENTATION_BRAND_CONFIG_V1, { displayName: "<invalid>" }),
  ]),
});
const tenantMismatch = await resolveAppPresentationBootstrap(tenantExecution, {
  deploymentMode: "platform_control_plane_presentation_v1",
  platformControlPlaneReader: managedReader([
    record(ENVAL_PRESENTATION_BRAND_CONFIG_V1, { tenantId: OTHER_TENANT_ID }),
  ]),
});
assert(
  !sourceUnavailable.ok &&
    sourceUnavailable.code === "presentation_source_unavailable" &&
    !ambiguous.ok && ambiguous.code === "presentation_config_ambiguous" &&
    !invalid.ok && invalid.code === "presentation_config_invalid" &&
    !tenantMismatch.ok && tenantMismatch.code === "tenant_mismatch",
  "Q05_server_failure_paths_not_fail_closed",
);

const missingManagedReader = buildServerOwnedPresentationSourceComposition(
  environment({
    ENVAL_PRESENTATION_SOURCE_MODE: "platform_control_plane_presentation_v1",
  }),
  tenantExecution,
);
const unknownMode = buildServerOwnedPresentationSourceComposition(
  environment({ ENVAL_PRESENTATION_SOURCE_MODE: "browser_selected" }),
  tenantExecution,
  managedEnvalReader,
);
const malformedStandalone = buildServerOwnedPresentationSourceComposition(
  environment({
    ENVAL_PRESENTATION_SOURCE_MODE: "static_presentation_config_v1",
    ENVAL_STATIC_PRESENTATION_MODE: "CUSTOM_V1",
    ENVAL_STATIC_PRESENTATION_CONFIG_V1: "{bad-json",
  }),
  tenantExecution,
);
assert(
  missingManagedReader === null && unknownMode === null &&
    malformedStandalone === null,
  "Q06_server_owned_source_selection_not_fail_closed",
);

const malformedProjection = decodePresentationBootstrapResponse({
  ok: true,
  mode: "presentation_bootstrap_browser",
  schema_version: "presentation_bootstrap_browser_v1",
  presentation: { displayName: "Wrong tenant" },
});
const extraInternalField = decodePresentationBootstrapResponse({
  ok: true,
  mode: "presentation_bootstrap_browser",
  schema_version: "presentation_bootstrap_browser_v1",
  presentation: projectPresentationBrand(ENVAL_PRESENTATION_BRAND_CONFIG_V1),
  tenant_id: TENANT_ID,
});
assert(
  !malformedProjection.ok && !extraInternalField.ok,
  "Q07_browser_projection_validation_not_fail_closed",
);

const [
  endpointSource,
  serverBootstrapSource,
  controlPlaneReaderSource,
  runtimeSource,
  clientSource,
  providerSource,
  mainSource,
  appSource,
  authProviderSource,
  authBootstrapSource,
  dashboardSource,
  signingSource,
  legalSource,
  controlPlaneConfig,
] = await Promise.all([
  source("supabase/functions/api-app-presentation-bootstrap/index.ts"),
  source("supabase/functions/_shared/app_presentation_bootstrap.ts"),
  source("supabase/functions/_shared/app_control_plane_runtime_reader.ts"),
  source("app/src/shared/presentation/PresentationBrandRuntime.tsx"),
  source("app/src/shared/presentation/presentationBootstrapClient.ts"),
  source("app/src/shared/presentation/PresentationBrandProvider.tsx"),
  source("app/src/main.tsx"),
  source("app/src/App.tsx"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("supabase/functions/api-app-auth-bootstrap/index.ts"),
  source("supabase/functions/api-app-dashboard-get/index.ts"),
  source("supabase/functions/api-app-signup-signing-finalize/index.ts"),
  source("supabase/functions/_shared/signing_legal_runtime.ts"),
  source("platform/control-plane/supabase/config.toml"),
]);

assert(
  endpointSource.indexOf("getAppRequestMeta(req") <
      endpointSource.indexOf("meta.tenant_execution") &&
    endpointSource.indexOf("meta.tenant_execution") <
      endpointSource.indexOf("resolveAppPresentationBootstrap(") &&
    !endpointSource.includes("matchesCurrentTenant") &&
    !endpointSource.includes("resolveTenantRuntimeContext") &&
    !endpointSource.includes("composeTenantResolutionAdapter") &&
    !endpointSource.includes(
      "buildAppTenantResolutionShadowFromServerEnvironment",
    ) &&
    endpointSource.includes("managedReader"),
  "Q08_shared_tenant_execution_does_not_precede_presentation",
);
assert(
  !/(req\.json|URLSearchParams|req\.headers\.get\([^)]*(tenant|brand|mode|locator))/i
    .test(endpointSource) &&
    !/(URLSearchParams|location\.search|localStorage|sessionStorage|document\.cookie)/
      .test(`${runtimeSource}\n${clientSource}\n${providerSource}`) &&
    !clientSource.includes("tenantId") && !clientSource.includes("locator") &&
    !clientSource.includes("presentationMode"),
  "Q09_browser_tenant_brand_or_source_selection_present",
);
assert(
  clientSource.includes('method: "GET"') &&
    clientSource.includes("hasExactFields") &&
    clientSource.includes("validatePresentationBrandConfigV1") &&
    !clientSource.includes("ENVAL_PRESENTATION_BRAND_CONFIG_V1") &&
    !runtimeSource.includes("ENVAL_PRESENTATION_BRAND_CONFIG_V1") &&
    !providerSource.includes("ENVAL_PRESENTATION_BRAND_CONFIG_V1"),
  "Q10_global_enval_failure_fallback_present",
);
assert(
  serverBootstrapSource.includes('presentationMode === "ENVAL_DEFAULTS"') &&
    serverBootstrapSource.includes("ENVAL_STATIC_PRESENTATION_MODE") &&
    serverBootstrapSource.includes("projectPresentationBrand") &&
    !serverBootstrapSource.includes("req.") &&
    !serverBootstrapSource.includes("window"),
  "Q11_canonical_enval_fallback_not_server_owned",
);
assert(
  controlPlaneReaderSource.includes('from("routing_identities")') &&
    controlPlaneReaderSource.includes('from("data_plane_locators")') &&
    controlPlaneReaderSource.includes(
      'from("current_tenant_presentation_configs")',
    ) &&
    controlPlaneConfig.includes(
      'schemas = ["public", "graphql_public", "platform"]',
    ) &&
    endpointSource.includes('db: { schema: "platform" }'),
  "Q12_managed_control_plane_runtime_reader_not_wired",
);
assert(
  endpointSource.includes("ENVAL_CONTROL_PLANE_SERVICE_ROLE_KEY") &&
    !clientSource.includes("CONTROL_PLANE") &&
    !JSON.stringify(managedEnval).match(
      /(tenant|routing|locator|secret|credential|service.?role|data.?plane)/i,
    ),
  "Q13_secret_or_locator_reached_browser_projection",
);
assert(
  mainSource.includes("<PresentationBrandRuntime>") &&
    runtimeSource.includes('state.status === "loading"') &&
    runtimeSource.includes('state.status === "error"') &&
    runtimeSource.includes(
      "<PresentationBrandProvider presentation={state.presentation}>",
    ) &&
    !appSource.includes("PresentationBrand"),
  "Q14_react_runtime_or_route_independence_invalid",
);
assert(
  endpointSource.includes("Deze dienst is tijdelijk niet beschikbaar.") &&
    endpointSource.includes('"service_unavailable"') &&
    !endpointSource.includes("presentation.value.code") &&
    runtimeSource.includes("Probeer het later opnieuw.") &&
    !runtimeSource.includes("result.code"),
  "Q15_failure_detail_not_customer_safe",
);
assert(
  !authProviderSource.includes("PresentationBrand") &&
    !authBootstrapSource.includes("PresentationBrand") &&
    !dashboardSource.includes("PresentationBrand") &&
    !signingSource.includes("PresentationBrand") &&
    !legalSource.includes("PresentationBrand"),
  "Q16_auth_dashboard_signing_or_legal_authority_changed",
);
assert(
  appSource.includes('"/aanmelden"') &&
    appSource.includes("AUTH_ACCOUNT_COMPATIBILITY_ROUTE") &&
    appSource.includes("AUTH_LOGIN_ROUTE") &&
    appSource.includes('"/dashboard"') &&
    authProviderSource.includes('setStatus("signed_out")') &&
    authProviderSource.includes('setStatus("ready")') &&
    runtimeSource.includes("bootstrapPromise") &&
    !runtimeSource.includes("useAuth"),
  "Q17_auth_zero_case_refresh_or_logout_coupled_to_presentation",
);
assert(
  !endpointSource.includes('Deno.env.get("SUPABASE_URL")') &&
    !endpointSource.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")') &&
    !endpointSource.includes("applicationRouteReference") &&
    !endpointSource.includes("secretReferenceId") &&
    !clientSource.includes("displayName ===") &&
    !clientSource.includes("shortMark ==="),
  "Q18_data_plane_switching_or_brand_business_branch_present",
);
assert(
  authenticatedEnvalHtml.includes("ENVAL") &&
    authenticatedEnvalHtml.includes("Inloggen") &&
    authenticatedEnvalHtml.includes("Dossierbeheer") &&
    authenticatedEnvalHtml.includes("Klantportaal") &&
    !authenticatedEnvalHtml.includes("ERE inboekservice") &&
    authenticatedSyntheticHtml.includes("Example Mobility") &&
    authenticatedSyntheticHtml.includes("Inloggen") &&
    authenticatedSyntheticHtml.includes("Dossierbeheer") &&
    authenticatedSyntheticHtml.includes("Klantportaal") &&
    !authenticatedSyntheticHtml.includes("Clean mobility service") &&
    !authenticatedSyntheticHtml.includes("Mobility portal"),
  "Q19_authenticated_surface_identity_not_server_bound",
);

console.log("APP_PRESENTATION_RUNTIME_Q01_Q19=PASS");
Deno.exit(0);
