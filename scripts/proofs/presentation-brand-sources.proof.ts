import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../../platform/runtime/presentation/enval_presentation_defaults.ts";
import {
  PlatformControlPlanePresentationV1Source,
  type PlatformPresentationConfigReader,
  type PlatformPresentationConfigRecord,
} from "../../platform/runtime/presentation/adapters/platform_control_plane_presentation_v1.ts";
import { createStaticPresentationConfigV1Source } from "../../platform/runtime/presentation/adapters/static_presentation_config_v1.ts";
import {
  createResolvedPresentationSourceContext,
  type PresentationBrandSourcePort,
} from "../../platform/runtime/presentation/presentation_brand_source.ts";
import {
  projectPresentationBrand,
  validatePresentationBrandConfigV1,
} from "../../platform/runtime/presentation/presentation_brand_config.ts";
import { composePresentationBrandSource } from "../../platform/runtime/presentation/presentation_source_composition.ts";
import type { ResolvedTenantContext } from "../../platform/runtime/tenant-resolution/tenant_resolution.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const TENANT_ID = "51000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "51000000-0000-4000-8000-000000000002";
const LOCATOR_ID = "53000000-0000-4000-8000-000000000001";
const SECRET_REFERENCE_ID = "54000000-0000-4000-8000-000000000001";

function resolvedTenant(
  tenantId = TENANT_ID,
  environment = "local",
): ResolvedTenantContext {
  return {
    tenantId,
    dataPlane: {
      locatorId: LOCATOR_ID,
      deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
      environment,
      providerType: "supabase",
      dataPlaneReference: "enval",
      applicationRouteReference: "http://127.0.0.1:54321",
      secretReferenceId: SECRET_REFERENCE_ID,
    },
  };
}

function record(
  overrides: Partial<PlatformPresentationConfigRecord> = {},
): PlatformPresentationConfigRecord {
  const config = ENVAL_PRESENTATION_BRAND_CONFIG_V1;
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

function reader(
  rows: readonly PlatformPresentationConfigRecord[],
  onRead: () => void = () => undefined,
): PlatformPresentationConfigReader {
  return {
    async findCurrentPresentationConfigs() {
      onRead();
      return rows;
    },
  };
}

async function resolve(
  source: PresentationBrandSourcePort,
  tenant = resolvedTenant(),
) {
  const context = createResolvedPresentationSourceContext(tenant);
  assert(context.ok, "resolved_context_creation_failed");
  return await source.resolvePresentationBrand(context.value);
}

const syntheticValidation = validatePresentationBrandConfigV1({
  schemaVersion: "presentation-brand-config-v1",
  configVersion: "example-mobility-presentation-v1",
  displayName: "Example Mobility",
  shortMark: "EM",
  productLabel: "Mobility portal",
  tagline: "Clean mobility service",
  assets: {
    logo: "/assets/brand/example-mobility.svg",
    logoInverse: "/assets/brand/example-mobility-inverse.svg",
    favicon: "/assets/brand/example-mobility-icon.png",
    socialImage: "/assets/brand/example-mobility-social.jpg",
    altText: "Example Mobility",
  },
  exportBasename: "example-mobility-documents",
});
assert(syntheticValidation.ok, "synthetic_config_invalid");
const synthetic = syntheticValidation.value;

const managedEnval = new PlatformControlPlanePresentationV1Source(
  reader([record()]),
);
const staticEnvalCreation = createStaticPresentationConfigV1Source([{
  tenantId: TENANT_ID,
  environment: "local",
  presentationMode: "ENVAL_DEFAULTS",
}]);
assert(staticEnvalCreation.ok, "static_enval_creation_failed");
const managedEnvalResult = await resolve(managedEnval);
const staticEnvalResult = await resolve(staticEnvalCreation.source);
assert(
  managedEnvalResult.ok && staticEnvalResult.ok &&
    JSON.stringify(managedEnvalResult.value) ===
      JSON.stringify(staticEnvalResult.value) &&
    JSON.stringify(projectPresentationBrand(managedEnvalResult.value)) ===
      JSON.stringify(projectPresentationBrand(staticEnvalResult.value)),
  "Q01_enval_managed_static_parity_failed",
);

const managedSynthetic = new PlatformControlPlanePresentationV1Source(reader([
  record({
    versionSequence: 2,
    configVersion: synthetic.configVersion,
    displayName: synthetic.displayName,
    shortMark: synthetic.shortMark,
    productLabel: synthetic.productLabel,
    tagline: synthetic.tagline ?? null,
    logoReference: synthetic.assets.logo,
    logoInverseReference: synthetic.assets.logoInverse ?? null,
    faviconReference: synthetic.assets.favicon ?? null,
    socialImageReference: synthetic.assets.socialImage ?? null,
    assetAltText: synthetic.assets.altText,
    exportBasename: synthetic.exportBasename ?? null,
  }),
]));
const staticSyntheticCreation = createStaticPresentationConfigV1Source([{
  tenantId: TENANT_ID,
  environment: "local",
  presentationMode: "CUSTOM_V1",
  presentationConfig: synthetic,
}]);
assert(staticSyntheticCreation.ok, "static_synthetic_creation_failed");
const managedSyntheticResult = await resolve(managedSynthetic);
const staticSyntheticResult = await resolve(staticSyntheticCreation.source);
assert(
  managedSyntheticResult.ok && staticSyntheticResult.ok &&
    JSON.stringify(managedSyntheticResult.value) ===
      JSON.stringify(staticSyntheticResult.value) &&
    managedSyntheticResult.value.displayName === "Example Mobility",
  "Q02_synthetic_managed_static_parity_failed",
);

const missing = await resolve(
  new PlatformControlPlanePresentationV1Source(reader([])),
);
const ambiguous = await resolve(
  new PlatformControlPlanePresentationV1Source(reader([record(), record()])),
);
const invalid = await resolve(
  new PlatformControlPlanePresentationV1Source(
    reader([record({ displayName: "<invalid>" })]),
  ),
);
const tenantMismatch = await resolve(
  new PlatformControlPlanePresentationV1Source(
    reader([record({ tenantId: OTHER_TENANT_ID })]),
  ),
);
const environmentMismatch = await resolve(
  new PlatformControlPlanePresentationV1Source(
    reader([record({ environment: "production" })]),
  ),
);
assert(
  !missing.ok && missing.code === "presentation_config_missing" &&
    !ambiguous.ok && ambiguous.code === "presentation_config_ambiguous" &&
    !invalid.ok && invalid.code === "presentation_config_invalid" &&
    !tenantMismatch.ok && tenantMismatch.code === "tenant_mismatch" &&
    !environmentMismatch.ok &&
    environmentMismatch.code === "environment_mismatch",
  "Q03_managed_fail_closed_cases_failed",
);

const missingStatic = createStaticPresentationConfigV1Source(null);
const ambiguousStatic = createStaticPresentationConfigV1Source([
  {
    tenantId: TENANT_ID,
    environment: "local",
    presentationMode: "ENVAL_DEFAULTS",
  },
  {
    tenantId: TENANT_ID,
    environment: "local",
    presentationMode: "ENVAL_DEFAULTS",
  },
]);
const malformedStatic = createStaticPresentationConfigV1Source([{
  tenantId: TENANT_ID,
  environment: "local",
  presentationMode: "CUSTOM_V1",
  presentationConfig: { displayName: "Incomplete" },
}]);
assert(
  !missingStatic.ok &&
    missingStatic.code === "missing_static_presentation_config" &&
    !ambiguousStatic.ok &&
    ambiguousStatic.code === "ambiguous_static_presentation_config" &&
    !malformedStatic.ok &&
    malformedStatic.code === "malformed_static_presentation_config",
  "Q04_static_fail_closed_cases_failed",
);

const staticTenantMismatch = await resolve(
  staticEnvalCreation.source,
  resolvedTenant(OTHER_TENANT_ID),
);
const staticEnvironmentMismatch = await resolve(
  staticEnvalCreation.source,
  resolvedTenant(TENANT_ID, "production"),
);
assert(
  !staticTenantMismatch.ok && staticTenantMismatch.code === "tenant_mismatch" &&
    !staticEnvironmentMismatch.ok &&
    staticEnvironmentMismatch.code === "environment_mismatch",
  "Q05_static_binding_not_fail_closed",
);

let untrustedReadCount = 0;
const guardedManaged = new PlatformControlPlanePresentationV1Source(
  reader([record()], () => untrustedReadCount += 1),
);
const untrusted = await guardedManaged.resolvePresentationBrand({
  tenantId: TENANT_ID,
  environment: "local",
} as never);
assert(
  !untrusted.ok && untrusted.code === "invalid_presentation_source_context" &&
    untrustedReadCount === 0,
  "Q06_browser_shaped_input_reached_managed_reader",
);

const managedComposition = composePresentationBrandSource({
  deploymentMode: "platform_control_plane_presentation_v1",
  platformControlPlaneReader: reader([record()]),
});
const staticComposition = composePresentationBrandSource({
  deploymentMode: "static_presentation_config_v1",
  staticPresentationConfigurations: [{
    tenantId: TENANT_ID,
    environment: "local",
    presentationMode: "ENVAL_DEFAULTS",
  }],
});
const unknownComposition = composePresentationBrandSource({
  deploymentMode: "browser_selected",
});
const ambiguousComposition = composePresentationBrandSource({
  deploymentMode: "platform_control_plane_presentation_v1",
  platformControlPlaneReader: reader([record()]),
  staticPresentationConfigurations: [],
});
assert(
  managedComposition.ok && staticComposition.ok &&
    !unknownComposition.ok &&
    unknownComposition.code === "unknown_presentation_source_mode" &&
    !ambiguousComposition.ok &&
    ambiguousComposition.code ===
      "ambiguous_presentation_source_configuration",
  "Q07_closed_composition_failed",
);

const projected = projectPresentationBrand(managedSyntheticResult.value);
assert(
  Object.keys(projected).sort().join("|") ===
      "assets|configVersion|displayName|exportBasename|productLabel|schemaVersion|shortMark|tagline" &&
    !/(tenant|locator|routing|secret|credential|legal|support|password|token)/i
      .test(JSON.stringify(projected)),
  "Q08_public_projection_contains_authority_or_secret_material",
);

const [
  sourceContract,
  managedSource,
  staticSource,
  compositionSource,
  tenantResolverSource,
  reactMainSource,
  legalSource,
  signingSource,
] = await Promise.all([
  Deno.readTextFile(
    "platform/runtime/presentation/presentation_brand_source.ts",
  ),
  Deno.readTextFile(
    "platform/runtime/presentation/adapters/platform_control_plane_presentation_v1.ts",
  ),
  Deno.readTextFile(
    "platform/runtime/presentation/adapters/static_presentation_config_v1.ts",
  ),
  Deno.readTextFile(
    "platform/runtime/presentation/presentation_source_composition.ts",
  ),
  Deno.readTextFile(
    "platform/runtime/tenant-resolution/tenant_resolution.ts",
  ),
  Deno.readTextFile("app/src/main.tsx"),
  Deno.readTextFile("supabase/functions/_shared/signing_legal_runtime.ts"),
  Deno.readTextFile(
    "supabase/functions/api-app-signup-signing-finalize/index.ts",
  ),
]);
assert(
  !/platform_control_plane|static_presentation/i.test(sourceContract) &&
    sourceContract.includes("ResolvedTenantContext") &&
    !tenantResolverSource.includes("PresentationBrand") &&
    !tenantResolverSource.includes("presentation_source"),
  "Q09_source_contract_or_tenant_resolver_not_provider_neutral",
);
assert(
  [sourceContract, managedSource, staticSource, compositionSource].every(
    (value) =>
      !/(URLSearchParams|location\.search|localStorage|sessionStorage|document\.cookie|window\.)/
        .test(value),
  ) &&
    !managedSource.includes("trustedRoutingKey") &&
    !managedSource.includes("dataPlaneReference") &&
    !managedSource.includes("secretReferenceId"),
  "Q10_browser_or_data_plane_selection_surface_present",
);
assert(
  reactMainSource.includes("<PresentationBrandProvider>") &&
    !reactMainSource.includes("PresentationBrandSource") &&
    !reactMainSource.includes("platform_control_plane_presentation") &&
    !legalSource.includes("PresentationBrandSource") &&
    !signingSource.includes("PresentationBrandSource") &&
    legalSource.includes("ENVAL B.V.") &&
    signingSource.includes("canonical_snapshot"),
  "Q11_react_legal_or_signing_boundary_changed",
);
assert(
  Object.isFrozen(managedEnvalResult.value) &&
    Object.isFrozen(managedEnvalResult.value.assets) &&
    Object.isFrozen(staticSyntheticResult.value) &&
    Object.isFrozen(staticSyntheticResult.value.assets),
  "Q12_resolved_presentation_not_immutable",
);

console.log("PRESENTATION_BRAND_SOURCES_Q01_Q12=PASS");
