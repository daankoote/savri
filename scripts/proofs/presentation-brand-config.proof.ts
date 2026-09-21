import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../../platform/runtime/presentation/enval_presentation_defaults.ts";
import {
  PRESENTATION_BRAND_CONFIG_SCHEMA_VERSION,
  projectPresentationBrand,
  validatePresentationBrandConfigV1,
} from "../../platform/runtime/presentation/presentation_brand_config.ts";
import { SIGNING_LEGAL_RUNTIME_DOCUMENTS } from "../../supabase/functions/_shared/signing_legal_runtime.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: PRESENTATION_BRAND_CONFIG_SCHEMA_VERSION,
    configVersion: "proof-presentation-v1",
    displayName: "Example Brand",
    shortMark: "EB",
    productLabel: "Customer portal",
    tagline: "Example presentation",
    assets: {
      logo: "/assets/brand/example-logo.svg",
      logoInverse: "/assets/brand/example-logo-inverse.svg",
      favicon: "/assets/brand/example-favicon.png",
      socialImage: "/assets/brand/example-social.jpg",
      altText: "Example Brand",
    },
    exportBasename: "example-documents",
    identity: {
      websiteUrl: "https://example.test/",
      contactRoute: "/contact",
      mailDisplayName: "Example Mail",
      mailAddress: "mail@example.test",
      legalName: "Example Legal B.V.",
    },
    ...overrides,
  };
}

const defaultsValidation = validatePresentationBrandConfigV1(
  ENVAL_PRESENTATION_BRAND_CONFIG_V1,
);
assert(
  defaultsValidation.ok &&
    defaultsValidation.value.displayName === "ENVAL" &&
    defaultsValidation.value.shortMark === "E" &&
    defaultsValidation.value.productLabel === "Klantportaal" &&
    defaultsValidation.value.tagline === "ERE inboekservice" &&
    defaultsValidation.value.identity.legalName === "ENVAL B.V." &&
    defaultsValidation.value.identity.mailDisplayName === "ENVAL" &&
    defaultsValidation.value.identity.mailAddress === "noreply@enval.local" &&
    defaultsValidation.value.identity.websiteUrl === "https://www.enval.nl/" &&
    defaultsValidation.value.identity.contactRoute === "/contact",
  "Q01_enval_defaults_invalid",
);
const appHeaderSource = await Deno.readTextFile(
  "app/src/shared/components/AppHeader.tsx",
);
const dashboardSidebarSource = await Deno.readTextFile(
  "app/src/features/dashboard/DashboardSidebar.tsx",
);
const providerSource = await Deno.readTextFile(
  "app/src/shared/presentation/PresentationBrandProvider.tsx",
);
const runtimeSource = await Deno.readTextFile(
  "app/src/shared/presentation/PresentationBrandRuntime.tsx",
);
const staticSource = await Deno.readTextFile(
  "platform/runtime/presentation/adapters/static_presentation_config_v1.ts",
);
assert(
  !providerSource.includes("ENVAL_PRESENTATION_BRAND_CONFIG_V1") &&
    providerSource.includes("projectPresentationBrand") &&
    runtimeSource.includes(
      "<PresentationBrandProvider presentation={state.presentation}>",
    ) &&
    staticSource.includes("ENVAL_PRESENTATION_BRAND_CONFIG_V1") &&
    appHeaderSource.includes("usePresentationBrand") &&
    dashboardSidebarSource.includes("usePresentationBrand") &&
    (await Promise.all([
      ENVAL_PRESENTATION_BRAND_CONFIG_V1.assets.logo,
      ENVAL_PRESENTATION_BRAND_CONFIG_V1.assets.logoInverse,
      ENVAL_PRESENTATION_BRAND_CONFIG_V1.assets.favicon,
      ENVAL_PRESENTATION_BRAND_CONFIG_V1.assets.socialImage,
    ].map(async (reference) =>
      reference && (await Deno.stat(`.${reference}`)).isFile
    ))).every(Boolean),
  "Q01_enval_defaults_not_backed_by_current_presentation",
);

assert(
  Object.isFrozen(ENVAL_PRESENTATION_BRAND_CONFIG_V1) &&
    Object.isFrozen(ENVAL_PRESENTATION_BRAND_CONFIG_V1.assets) &&
    Object.isFrozen(ENVAL_PRESENTATION_BRAND_CONFIG_V1.identity),
  "Q02_enval_defaults_not_deeply_immutable",
);
try {
  (ENVAL_PRESENTATION_BRAND_CONFIG_V1 as { displayName: string }).displayName =
    "Mutated";
} catch (_error) {
  // Frozen module exports reject mutation in strict module execution.
}
assert(
  ENVAL_PRESENTATION_BRAND_CONFIG_V1.displayName === "ENVAL",
  "Q02_enval_defaults_mutated",
);

const projectionA = projectPresentationBrand(
  ENVAL_PRESENTATION_BRAND_CONFIG_V1,
);
const projectionB = projectPresentationBrand(
  ENVAL_PRESENTATION_BRAND_CONFIG_V1,
);
assert(
  JSON.stringify(projectionA) === JSON.stringify(projectionB) &&
    projectionA !== projectionB && projectionA.assets !== projectionB.assets &&
    projectionA.identity !== projectionB.identity &&
    Object.isFrozen(projectionA) && Object.isFrozen(projectionA.assets) &&
    Object.isFrozen(projectionA.identity),
  "Q03_public_projection_not_deterministic_or_immutable",
);

const managedPayload = candidate();
const standalonePayload = structuredClone(managedPayload);
const managed = validatePresentationBrandConfigV1(managedPayload);
const standalone = validatePresentationBrandConfigV1(standalonePayload);
assert(
  managed.ok && standalone.ok &&
    JSON.stringify(managed.value) === JSON.stringify(standalone.value),
  "Q04_provider_source_changed_contract",
);

for (
  const required of [
    "schemaVersion",
    "configVersion",
    "displayName",
    "shortMark",
    "productLabel",
    "assets",
    "identity",
  ]
) {
  const missing = candidate();
  delete (missing as Record<string, unknown>)[required];
  assert(
    !validatePresentationBrandConfigV1(missing).ok,
    `Q05_missing_required_field_accepted:${required}`,
  );
}

assert(
  !validatePresentationBrandConfigV1(candidate({ metadata: {} })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      assets: { ...candidate().assets, onload: "alert(1)" },
    })).ok,
  "Q06_unknown_field_accepted",
);

assert(
  !validatePresentationBrandConfigV1(candidate({
    displayName: "x".repeat(81),
  })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      displayName: "Unsafe\u0000Brand",
    })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      tagline: "<script>alert(1)</script>",
    })).ok,
  "Q07_unsafe_text_accepted",
);

const identity = candidate().identity as Record<string, unknown>;
for (const field of Object.keys(identity)) {
  const incomplete = candidate({ identity: { ...identity } });
  delete (incomplete.identity as Record<string, unknown>)[field];
  assert(
    !validatePresentationBrandConfigV1(incomplete).ok,
    `Q07b_incomplete_identity_accepted:${field}`,
  );
}
assert(
  !validatePresentationBrandConfigV1(candidate({
    identity: { ...identity, extra: "forbidden" },
  })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      identity: { ...identity, websiteUrl: "javascript:alert(1)" },
    })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      identity: { ...identity, contactRoute: "//example.test" },
    })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      identity: { ...identity, mailAddress: "invalid" },
    })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      identity: {
        ...identity,
        mailAddress: `${"a".repeat(65)}@example.test`,
      },
    })).ok,
  "Q07c_invalid_identity_accepted",
);

for (
  const logo of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "https://tracker.example/logo.svg",
    "//tracker.example/logo.svg",
    "/assets/../secret.svg",
    "/assets/logo.svg?script=1",
    "/assets/logo.html",
    "/assets/logo.SVG",
  ]
) {
  assert(
    !validatePresentationBrandConfigV1(candidate({
      assets: { ...candidate().assets, logo },
    })).ok,
    `Q08_unsafe_asset_reference_accepted:${logo}`,
  );
}

assert(
  !validatePresentationBrandConfigV1(candidate({
    tokenOverrides: { "--color-brand": "url(javascript:alert(1))" },
  })).ok &&
    !validatePresentationBrandConfigV1(candidate({
      style: "@import url(https://tracker.example/style.css)",
    })).ok,
  "Q09_arbitrary_css_or_token_override_accepted",
);

for (
  const authorityField of [
    "tenantId",
    "routingIdentity",
    "supabaseUrl",
    "dataPlaneLocator",
    "secretReferenceId",
    "legalOperator",
    "statutoryName",
    "kvkNumber",
    "privacyController",
    "representationAuthority",
    "supportProvider",
    "supportCapabilities",
  ]
) {
  assert(
    !validatePresentationBrandConfigV1(candidate({
      [authorityField]: "forbidden",
    })).ok,
    `Q10_authority_field_accepted:${authorityField}`,
  );
}

const publicJson = JSON.stringify(projectionA);
let forgedProjectionRejected = false;
try {
  projectPresentationBrand(candidate({
    assets: {
      ...candidate().assets,
      logo: "javascript:alert(1)",
    },
  }) as never);
} catch (_error) {
  forgedProjectionRejected = true;
}
assert(
  forgedProjectionRejected &&
    !/(tenant|routing|supabase|data.?plane|locator|secret|credential|kvk|privacy.?controller|representation|support)/i
      .test(publicJson),
  "Q11_public_projection_contains_authority_or_secret_field",
);

const legalBefore = JSON.stringify(SIGNING_LEGAL_RUNTIME_DOCUMENTS);
const rebrand = validatePresentationBrandConfigV1(candidate({
  displayName: "Rebranded Presentation",
  shortMark: "RP",
  identity: ENVAL_PRESENTATION_BRAND_CONFIG_V1.identity,
}));
assert(rebrand.ok, "Q12_rebrand_candidate_invalid");
projectPresentationBrand(rebrand.value);
assert(
  JSON.stringify(SIGNING_LEGAL_RUNTIME_DOCUMENTS) === legalBefore &&
    rebrand.value.identity.legalName === "ENVAL B.V." &&
    rebrand.value.identity.mailDisplayName === "ENVAL" &&
    rebrand.value.identity.mailAddress === "noreply@enval.local" &&
    rebrand.value.identity.websiteUrl === "https://www.enval.nl/",
  "Q12_rebrand_mutated_legal_runtime_documents",
);

const presentationSource = await Deno.readTextFile(
  "platform/runtime/presentation/presentation_brand_config.ts",
);
const finalizeSource = await Deno.readTextFile(
  "supabase/functions/api-app-signup-signing-finalize/index.ts",
);
const signingMigration = await Deno.readTextFile(
  "supabase/migrations/20260816150000_app_current_baseline.sql",
);
assert(
  !presentationSource.includes("tenant-resolution") &&
    !presentationSource.includes("platform_control_plane_v1") &&
    !presentationSource.includes("static_single_tenant_v1") &&
    !finalizeSource.includes("PresentationBrandConfig") &&
    finalizeSource.includes("content_sha256") &&
    finalizeSource.includes("canonical_snapshot") &&
    signingMigration.includes("trg_app_signup_signing_snapshots_immutable") &&
    signingMigration.includes("trg_app_signup_legal_acceptances_immutable") &&
    signingMigration.includes("trg_app_signup_mandates_immutable") &&
    signingMigration.includes("trg_app_signup_signature_evidence_immutable"),
  "Q13_provider_or_historical_legal_boundary_regressed",
);

assert(
  !Object.hasOwn(projectionA, "tenantId") &&
    !Object.hasOwn(projectionA, "routingIdentity") &&
    !Object.hasOwn(projectionA, "dataPlaneLocator") &&
    !validatePresentationBrandConfigV1(candidate({
      tenantId: ENVAL_PRESENTATION_BRAND_CONFIG_V1.displayName,
    })).ok,
  "Q14_branding_value_became_tenant_identity",
);

console.log("PRESENTATION_BRAND_CONFIG_Q01_Q14=PASS");
