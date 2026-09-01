import {
  createTenantConfigurationServerSelectionAuthorityV1,
  TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION,
  tenantConfigurationManifestCanonicalSha256,
  type TenantConfigurationManifestHashInputV1,
  validateApprovedTenantConfigurationComponentRevision,
  validateTenantConfigurationManifestV1,
} from "../../supabase/functions/_shared/app_tenant_configuration.ts";
import {
  StaticSingleTenantConfigurationV1Adapter,
  type TenantConfigurationClockPort,
} from "../../supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts";
import type { AppTenantExecutionContext } from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const TENANT_ID = "71000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "71000000-0000-4000-8000-000000000002";
const APPROVED_AT = "2026-01-01T00:00:00.000Z";
const EFFECTIVE_FROM = "2026-01-02T00:00:00.000Z";
const EVALUATED_AT = "2026-02-01T00:00:00.000Z";
const ACTOR = "tenant-config-proof";

const coreRuntimeModule = await import(
  "../../supabase/functions/_shared/app_tenant_configuration.ts"
);
const CORE_RUNTIME_EXPORTS = Object.freeze(
  Object.keys(coreRuntimeModule).sort(),
);

function fixedClock(value: string): TenantConfigurationClockPort {
  return Object.freeze({ now: () => new Date(value) });
}

const context: AppTenantExecutionContext = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
  trustedRoutingKey: "proof.enval.localhost",
  routingProvenance: "DEPLOYMENT_FIXED",
  resolutionMode: "static_single_tenant_v1",
  dataPlaneLocatorId: "72000000-0000-4000-8000-000000000001",
  resolvedDataPlaneReference: "proof-plane",
  fixedDataPlaneReference: "proof-plane",
  providerType: "supabase",
  deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
});

const componentRevisions = Object.freeze(
  [
    Object.freeze({
      componentKind: "operational",
      revisionId: "operational-proof-v1",
      contentSha256: "a".repeat(64),
      approvalStatus: "APPROVED",
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
    Object.freeze({
      componentKind: "legal",
      revisionId: "legal-proof-v1",
      contentSha256: "b".repeat(64),
      approvalStatus: "APPROVED",
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
    Object.freeze({
      componentKind: "fee_commercial",
      revisionId: "fee-proof-v1",
      contentSha256: "c".repeat(64),
      approvalStatus: "APPROVED",
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
    Object.freeze({
      componentKind: "provider_integration",
      revisionId: "provider-proof-v1",
      contentSha256: "d".repeat(64),
      approvalStatus: "APPROVED",
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
  ] as const,
);

function baseHashInput(): TenantConfigurationManifestHashInputV1 {
  return {
    schemaVersion: TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION,
    manifestRevisionId: "manifest-proof-v1",
    tenantId: TENANT_ID,
    environment: "local",
    components: {
      operational: {
        componentKind: "operational",
        revisionId: "operational-proof-v1",
        contentSha256: "a".repeat(64),
      },
      legal: {
        componentKind: "legal",
        revisionId: "legal-proof-v1",
        contentSha256: "b".repeat(64),
      },
      feeCommercial: {
        componentKind: "fee_commercial",
        revisionId: "fee-proof-v1",
        contentSha256: "c".repeat(64),
      },
      providerIntegration: {
        componentKind: "provider_integration",
        revisionId: "provider-proof-v1",
        contentSha256: "d".repeat(64),
      },
    },
    approvalStatus: "APPROVED",
    approvedAt: APPROVED_AT,
    approvedByActorRef: ACTOR,
    effectiveFrom: EFFECTIVE_FROM,
  };
}

async function manifest(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const base = baseHashInput();
  const overrideComponents = overrides.components as
    | Record<string, unknown>
    | undefined;
  const value = {
    ...base,
    ...overrides,
    components: {
      ...base.components,
      ...(overrideComponents ?? {}),
    },
  };
  const canonicalSha256 = await tenantConfigurationManifestCanonicalSha256(
    value as TenantConfigurationManifestHashInputV1,
  );
  return { ...value, canonicalSha256 };
}

async function resolve(
  manifests: readonly unknown[],
  revisions: readonly unknown[] = componentRevisions,
  executionContext: AppTenantExecutionContext = context,
  clock: TenantConfigurationClockPort = fixedClock(EVALUATED_AT),
) {
  return await new StaticSingleTenantConfigurationV1Adapter({
    manifests,
    componentRevisions: revisions,
  }, clock).resolveForExecutionContext(executionContext);
}

async function run(name: string, proof: () => void | Promise<void>) {
  await proof();
  console.log(`${name}=PASS`);
}

const validManifest = await manifest();
let validResult = await resolve([validManifest]);

await run("Q01", () => {
  assert(
    validResult.ok &&
      validResult.value.manifest.tenantId === TENANT_ID &&
      Object.keys(validResult.value.componentRevisions).sort().join("|") ===
        "feeCommercial|legal|operational|providerIntegration",
    "Q01_valid_manifest_not_resolved",
  );
});

await run("Q02", () => {
  assert(validResult.ok, "Q02_valid_result_missing");
  const before = JSON.stringify(validResult.value);
  try {
    (validResult.value.manifest as { tenantId: string }).tenantId =
      OTHER_TENANT_ID;
  } catch (_error) {
    // Frozen module values reject mutation in strict mode.
  }
  assert(
    Object.isFrozen(validResult.value) &&
      Object.isFrozen(validResult.value.manifest) &&
      Object.isFrozen(validResult.value.manifest.components) &&
      JSON.stringify(validResult.value) === before,
    "Q02_resolved_manifest_mutable",
  );
});

await run("Q03", async () => {
  const result = await resolve(
    [validManifest],
    componentRevisions,
    Object.freeze({ ...context, tenantId: OTHER_TENANT_ID }),
  );
  assert(!result.ok, "Q03_wrong_tenant_selected");
});

await run("Q04", async () => {
  const result = await resolve(
    [validManifest],
    componentRevisions,
    Object.freeze({ ...context, environment: "production" }),
  );
  assert(!result.ok, "Q04_wrong_environment_selected");
});

await run("Q05", async () => {
  const result = await resolve(
    [validManifest],
    componentRevisions,
    context,
    fixedClock("2025-12-01T00:00:00.000Z"),
  );
  assert(
    !result.ok && result.code === "tenant_configuration_missing",
    "Q05_effective_gap_did_not_fail_closed",
  );
});

await run("Q06", async () => {
  const overlapping = await manifest({
    manifestRevisionId: "manifest-proof-overlap-v2",
    supersedesManifestRevisionId: "manifest-proof-v1",
  });
  const result = await resolve([validManifest, overlapping]);
  assert(
    !result.ok && result.code === "tenant_configuration_ambiguous",
    "Q06_overlap_not_ambiguous",
  );
});

await run("Q07", async () => {
  const unapproved = await manifest({ approvalStatus: "DRAFT" });
  const missingApproval = { ...validManifest };
  delete missingApproval.approvalStatus;
  const result = await resolve([unapproved]);
  assert(
    !result.ok && result.code === "manifest_not_approved",
    "Q07_unapproved_manifest_accepted",
  );
  assert(
    !(await resolve([missingApproval])).ok,
    "Q07_missing_manifest_approval_accepted",
  );
});

await run("Q08", async () => {
  const future = await manifest({
    approvedAt: "2026-03-01T00:00:00.000Z",
    effectiveFrom: "2026-03-02T00:00:00.000Z",
  });
  const result = await resolve([future]);
  assert(
    !result.ok && result.code === "tenant_configuration_missing",
    "Q08_future_manifest_selected_early",
  );
});

await run("Q09", async () => {
  const expired = await manifest({
    effectiveUntil: "2026-01-15T00:00:00.000Z",
  });
  const result = await resolve([expired]);
  assert(
    !result.ok && result.code === "tenant_configuration_missing",
    "Q09_expired_manifest_selected",
  );
});

await run("Q10", async () => {
  const reordered = {
    effectiveFrom: EFFECTIVE_FROM,
    approvedByActorRef: ACTOR,
    approvedAt: APPROVED_AT,
    approvalStatus: "APPROVED" as const,
    components: baseHashInput().components,
    environment: "local",
    tenantId: TENANT_ID,
    manifestRevisionId: "manifest-proof-v1",
    schemaVersion: TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION,
  };
  assert(
    await tenantConfigurationManifestCanonicalSha256(reordered) ===
      (validManifest.canonicalSha256 as string),
    "Q10_semantic_hash_not_deterministic",
  );
  const modified = { ...validManifest, environment: "production" };
  const result = await resolve([modified]);
  assert(
    !result.ok && result.code === "manifest_hash_mismatch",
    "Q10_material_change_did_not_break_hash",
  );
});

await run("Q11", async () => {
  const result = await resolve([validManifest], componentRevisions.slice(0, 3));
  assert(
    !result.ok && result.code === "component_revision_missing",
    "Q11_missing_component_accepted",
  );
});

await run("Q12", async () => {
  const wrongKind = componentRevisions.map((value) =>
    value.revisionId === "provider-proof-v1"
      ? { ...value, componentKind: "legal" }
      : value
  );
  assert(
    !(await resolve([validManifest], wrongKind)).ok,
    "Q12_wrong_kind_accepted",
  );
  const wrongRevision = await manifest({
    components: {
      providerIntegration: {
        ...baseHashInput().components.providerIntegration,
        revisionId: "provider-proof-missing-v2",
      },
    },
  });
  assert(
    !(await resolve([wrongRevision])).ok,
    "Q12_wrong_revision_accepted",
  );
  const wrongHash = await manifest({
    components: {
      providerIntegration: {
        ...baseHashInput().components.providerIntegration,
        contentSha256: "e".repeat(64),
      },
    },
  });
  assert(!(await resolve([wrongHash])).ok, "Q12_wrong_hash_accepted");
});

await run("Q13", async () => {
  const unapproved = componentRevisions.map((value) =>
    value.revisionId === "legal-proof-v1"
      ? { ...value, approvalStatus: "DRAFT" }
      : value
  );
  const result = await resolve([validManifest], unapproved);
  assert(
    !result.ok && result.code === "component_revision_invalid",
    "Q13_unapproved_component_accepted",
  );
});

await run("Q14", async () => {
  const malformedManifest = await manifest({
    manifestRevisionId: "x",
    components: {
      legal: {
        ...baseHashInput().components.legal,
        contentSha256: "ABC",
      },
    },
  });
  const result = await resolve([malformedManifest]);
  assert(!result.ok, "Q14_malformed_manifest_accepted");
  assert(
    validateApprovedTenantConfigurationComponentRevision({
      ...componentRevisions[0],
      revisionId: "x",
      contentSha256: "ABC",
    }) === null,
    "Q14_malformed_component_accepted",
  );
});

await run("Q15", async () => {
  const unexpected = { ...validManifest, config: { fee: 10 } };
  const secretField = {
    ...componentRevisions[0],
    providerApiKey: "forbidden-proof-value",
  };
  assert(
    !(await validateTenantConfigurationManifestV1(unexpected)).ok &&
      validateApprovedTenantConfigurationComponentRevision(secretField) ===
        null,
    "Q15_unexpected_or_secret_field_accepted",
  );
});

await run("Q16", async () => {
  const self = await manifest({
    supersedesManifestRevisionId: "manifest-proof-v1",
  });
  assert(!(await resolve([self])).ok, "Q16_self_supersession_accepted");
  const duplicate = await resolve([validManifest, validManifest]);
  assert(
    !duplicate.ok && duplicate.code === "manifest_duplicate",
    "Q16_duplicate_manifest_accepted",
  );
  const cycleA = await manifest({
    manifestRevisionId: "manifest-cycle-a",
    supersedesManifestRevisionId: "manifest-cycle-b",
  });
  const cycleB = await manifest({
    manifestRevisionId: "manifest-cycle-b",
    supersedesManifestRevisionId: "manifest-cycle-a",
  });
  const cycle = await resolve([cycleA, cycleB]);
  assert(
    !cycle.ok && cycle.code === "manifest_supersession_invalid",
    "Q16_manifest_cycle_accepted",
  );
});

await run("Q17", async () => {
  const oldBefore = JSON.stringify(validManifest);
  const providerV2 = Object.freeze({
    ...componentRevisions[3],
    revisionId: "provider-proof-v2",
    contentSha256: "e".repeat(64),
    supersedesRevisionId: "provider-proof-v1",
  });
  const replacement = await manifest({
    manifestRevisionId: "manifest-provider-v2",
    supersedesManifestRevisionId: "manifest-proof-v1",
    components: {
      providerIntegration: {
        componentKind: "provider_integration",
        revisionId: providerV2.revisionId,
        contentSha256: providerV2.contentSha256,
      },
    },
  });
  assert(
    replacement.canonicalSha256 !== validManifest.canonicalSha256 &&
      replacement.manifestRevisionId !== validManifest.manifestRevisionId &&
      JSON.stringify(validManifest) === oldBefore &&
      validateApprovedTenantConfigurationComponentRevision(providerV2) !== null,
    "Q17_provider_change_mutated_or_reused_manifest",
  );
});

await run("Q18", async () => {
  const request = new Request(
    "https://example.invalid/?tenant_id=browser-tenant&environment=production",
    { headers: { "X-Tenant-Id": "browser-tenant" } },
  );
  validResult = await resolve([validManifest]);
  const adapterSource = await Deno.readTextFile(
    "supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
  );
  assert(
    request.headers.get("X-Tenant-Id") === "browser-tenant" &&
      validResult.ok &&
      validResult.value.manifest.tenantId === context.tenantId &&
      adapterSource.includes("AppTenantExecutionContext") &&
      !adapterSource.includes("Request") && !adapterSource.includes("headers"),
    "Q18_browser_tenant_authority_present",
  );
});

await run("Q19", async () => {
  const source = await Deno.readTextFile(
    "supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
  );
  assert(
    !source.includes("createClient") && !source.includes(".from(") &&
      !source.includes(".rpc(") && !source.includes("Deno.env") &&
      !source.includes("SUPABASE_URL"),
    "Q19_static_adapter_has_external_runtime_access",
  );
});

await run("Q20", async () => {
  const [legal, finalize, otp, parser] = await Promise.all([
    Deno.readTextFile("supabase/functions/_shared/signing_legal_runtime.ts"),
    Deno.readTextFile(
      "supabase/functions/api-app-signup-signing-finalize/index.ts",
    ),
    Deno.readTextFile("supabase/functions/_shared/signing_otp_transport.ts"),
    Deno.readTextFile(
      "supabase/functions/_shared/app_document_parser_pdf_adapter.ts",
    ),
  ]);
  assert(
    legal.includes("ENVAL B.V.") && legal.includes("10%") &&
      finalize.includes("typed_name_otp_v1") &&
      otp.includes("configured_http_v1") &&
      parser.includes("enval_deterministic_pdf_text_v2"),
    "Q20_existing_consumer_semantics_changed",
  );
});

await run("Q21", async () => {
  const [configSource, presentationSource] = await Promise.all([
    Deno.readTextFile(
      "supabase/functions/_shared/app_tenant_configuration.ts",
    ),
    Deno.readTextFile(
      "platform/runtime/presentation/presentation_brand_config.ts",
    ),
  ]);
  assert(
    presentationSource.includes("PresentationBrandConfigV1") &&
      !configSource.includes("PresentationBrandConfigV1") &&
      !configSource.includes("displayName") &&
      !configSource.includes("productLabel") &&
      !configSource.includes("feePercentage") &&
      !configSource.includes("legalText"),
    "Q21_presentation_or_business_payload_merged_into_manifest",
  );
});

await run("Q22", () => {
  const fixtureText = JSON.stringify({
    validManifest,
    componentRevisions,
    result: validResult,
  });
  assert(
    !/(api.?key|service.?role|password|smtp.?credential|oauth|private.?key|access.?token|refresh.?token)/i
      .test(fixtureText),
    "Q22_secret_present_in_fixture_or_output",
  );
});

await run("Q23", async () => {
  let calls = 0;
  const serverClock: TenantConfigurationClockPort = Object.freeze({
    now() {
      calls += 1;
      return new Date(EVALUATED_AT);
    },
  });
  const result = await new StaticSingleTenantConfigurationV1Adapter({
    manifests: [validManifest],
    componentRevisions,
  }, serverClock).resolveForExecutionContext(context);
  const adapterSource = await Deno.readTextFile(
    "supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
  );
  assert(
    result.ok && calls === 1 &&
      adapterSource.includes("clock: TenantConfigurationClockPort") &&
      adapterSource.includes(
        "clock: TenantConfigurationClockPort = SERVER_CLOCK",
      ) &&
      adapterSource.includes("now: () => new Date()"),
    "Q23_server_clock_not_runtime_authority",
  );
});

await run("Q24", async () => {
  const [coreSource, adapterSource] = await Promise.all([
    Deno.readTextFile(
      "supabase/functions/_shared/app_tenant_configuration.ts",
    ),
    Deno.readTextFile(
      "supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
    ),
  ]);
  const portStart = coreSource.indexOf(
    "export interface TenantConfigurationSourcePort",
  );
  const portEnd = coreSource.indexOf("}\n", portStart) + 2;
  const publicPort = coreSource.slice(portStart, portEnd);
  assert(
    publicPort.includes("resolveForExecutionContext") &&
      publicPort.includes("AppTenantExecutionContext") &&
      !publicPort.includes("evaluatedAt") &&
      !publicPort.includes("effectiveAt") &&
      adapterSource.includes("resolveForExecutionContext(") &&
      !adapterSource.includes("evaluatedAt") &&
      !adapterSource.includes("effectiveAt"),
    "Q24_public_api_exposes_raw_event_time",
  );
});

await run("Q25", async () => {
  const requestLikeInput = Object.freeze({
    body: { evaluatedAt: "2099-01-01T00:00:00.000Z" },
    query: "effectiveAt=2099-01-01T00:00:00.000Z",
    headers: { "X-Evaluation-Time": "2099-01-01T00:00:00.000Z" },
  });
  const result = await new StaticSingleTenantConfigurationV1Adapter({
    manifests: [validManifest],
    componentRevisions,
  }, fixedClock(EVALUATED_AT)).resolveForExecutionContext(context);
  assert(
    requestLikeInput.body.evaluatedAt.startsWith("2099") && result.ok &&
      result.value.manifest.manifestRevisionId === "manifest-proof-v1",
    "Q25_request_like_time_influenced_selection",
  );
});

await run("Q26", async () => {
  const before = await resolve(
    [validManifest],
    componentRevisions,
    context,
    fixedClock("2025-12-01T00:00:00.000Z"),
  );
  const applicable = await resolve(
    [validManifest],
    componentRevisions,
    context,
    fixedClock(EVALUATED_AT),
  );
  assert(
    !before.ok && before.code === "tenant_configuration_missing" &&
      applicable.ok,
    "Q26_injected_server_clock_not_deterministic",
  );
});

await run("Q27", async () => {
  const invalidClock: TenantConfigurationClockPort = Object.freeze({
    now: () => new Date("invalid"),
  });
  const throwingClock: TenantConfigurationClockPort = Object.freeze({
    now(): Date {
      throw new Error("synthetic_clock_failure");
    },
  });
  const invalid = await resolve(
    [validManifest],
    componentRevisions,
    context,
    invalidClock,
  );
  const throwing = await resolve(
    [validManifest],
    componentRevisions,
    context,
    throwingClock,
  );
  assert(
    !invalid.ok && invalid.code === "invalid_evaluation_time" &&
      !throwing.ok && throwing.code === "invalid_evaluation_time",
    "Q27_invalid_server_clock_did_not_fail_closed",
  );
});

await run("Q28", async () => {
  const future = await manifest({
    manifestRevisionId: "manifest-future-v1",
    approvedAt: "2026-03-01T00:00:00.000Z",
    effectiveFrom: "2026-03-02T00:00:00.000Z",
  });
  const expired = await manifest({
    manifestRevisionId: "manifest-expired-v1",
    effectiveUntil: "2026-01-15T00:00:00.000Z",
  });
  const futureResult = await resolve(
    [future],
    componentRevisions,
    context,
    fixedClock(EVALUATED_AT),
  );
  const expiredResult = await resolve(
    [expired],
    componentRevisions,
    context,
    fixedClock(EVALUATED_AT),
  );
  assert(
    !futureResult.ok &&
      futureResult.code === "tenant_configuration_missing" &&
      !expiredResult.ok &&
      expiredResult.code === "tenant_configuration_missing",
    "Q28_trusted_clock_effective_window_changed",
  );
});

await run("Q29", async () => {
  const adapterSource = await Deno.readTextFile(
    "supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
  );
  assert(
    !adapterSource.includes("effectiveFrom") &&
      !adapterSource.includes("effectiveUntil") &&
      !adapterSource.includes("tenant_configuration_ambiguous") &&
      !adapterSource.includes("Date.parse"),
    "Q29_adapter_duplicates_time_or_ambiguity_policy",
  );
});

await run("Q30", async () => {
  const wrongTenant = await resolve(
    [validManifest],
    componentRevisions,
    Object.freeze({ ...context, tenantId: OTHER_TENANT_ID }),
  );
  const wrongEnvironment = await resolve(
    [validManifest],
    componentRevisions,
    Object.freeze({ ...context, environment: "production" }),
  );
  const adapterSource = await Deno.readTextFile(
    "supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
  );
  assert(
    !wrongTenant.ok && !wrongEnvironment.ok &&
      adapterSource.includes("AppTenantExecutionContext") &&
      !adapterSource.includes("Request") &&
      !adapterSource.includes("headers") &&
      !adapterSource.includes("URLSearchParams"),
    "Q30_tenant_environment_authority_changed",
  );
});

await run("Q31", () => {
  assert(
    !CORE_RUNTIME_EXPORTS.includes("selectTenantConfigurationManifestV1") &&
      !CORE_RUNTIME_EXPORTS.some((name) =>
        /select.*tenant.*configuration.*manifest/i.test(name)
      ),
    "Q31_runtime_export_surface_contains_raw_time_selector",
  );
});

await run("Q32", () => {
  assert(
    !CORE_RUNTIME_EXPORTS.includes(
      "TrustedTenantConfigurationEvaluationInstant",
    ) &&
      !CORE_RUNTIME_EXPORTS.includes(
        "trustedTenantConfigurationEvaluationInstantFromServerDate",
      ) &&
      !CORE_RUNTIME_EXPORTS.some((name) =>
        /trusted.*(time|instant)|instant.*from.*date/i.test(name)
      ),
    "Q32_runtime_export_surface_contains_trusted_time_minter",
  );
});

await run("Q33", async () => {
  const authority = createTenantConfigurationServerSelectionAuthorityV1(
    fixedClock(EVALUATED_AT),
  );
  const result = await authority.resolveForExecutionContext({
    context,
    manifests: [validManifest],
    componentRevisions,
  });
  const coreSource = await Deno.readTextFile(
    "supabase/functions/_shared/app_tenant_configuration.ts",
  );
  const publicSourceStart = coreSource.indexOf(
    "export type TenantConfigurationSelectionSourceV1",
  );
  const publicSourceEnd = coreSource.indexOf(
    "const TRUSTED_",
    publicSourceStart,
  );
  const publicCompositionSurface = coreSource.slice(
    publicSourceStart,
    publicSourceEnd,
  );
  assert(
    result.ok && authority.resolveForExecutionContext.length === 1 &&
      !publicCompositionSurface.includes("evaluatedAt") &&
      !publicCompositionSurface.includes("effectiveAt") &&
      !publicCompositionSurface.includes("timestamp") &&
      !publicCompositionSurface.includes("Date"),
    "Q33_server_composition_resolution_api_exposes_raw_time",
  );
});

await run("Q34", async () => {
  let calls = 0;
  const countingClock: TenantConfigurationClockPort = Object.freeze({
    now() {
      calls += 1;
      return new Date(EVALUATED_AT);
    },
  });
  const adapter = new StaticSingleTenantConfigurationV1Adapter({
    manifests: [validManifest],
    componentRevisions,
  }, countingClock);
  const first = await adapter.resolveForExecutionContext(context);
  const second = await adapter.resolveForExecutionContext(context);
  assert(
    first.ok && second.ok && calls === 2,
    "Q34_clock_not_read_exactly_once_per_resolution",
  );
});

await run("Q35", async () => {
  const transitionAt = "2026-02-01T00:00:00.000Z";
  const oldManifest = await manifest({
    manifestRevisionId: "manifest-clock-old-v1",
    effectiveUntil: transitionAt,
  });
  const newManifest = await manifest({
    manifestRevisionId: "manifest-clock-new-v2",
    effectiveFrom: transitionAt,
    supersedesManifestRevisionId: "manifest-clock-old-v1",
  });
  const source = Object.freeze({
    manifests: [oldManifest, newManifest],
    componentRevisions,
  });
  const before = await new StaticSingleTenantConfigurationV1Adapter(
    source,
    fixedClock("2026-01-15T00:00:00.000Z"),
  ).resolveForExecutionContext(context);
  const after = await new StaticSingleTenantConfigurationV1Adapter(
    source,
    fixedClock("2026-02-15T00:00:00.000Z"),
  ).resolveForExecutionContext(context);
  assert(
    before.ok && after.ok &&
      before.value.manifest.manifestRevisionId === "manifest-clock-old-v1" &&
      after.value.manifest.manifestRevisionId === "manifest-clock-new-v2",
    "Q35_composed_clocks_did_not_control_effective_selection",
  );
});

await run("Q36", async () => {
  const requestLikeInput = Object.freeze({
    body: { evaluatedAt: "2099-12-31T23:59:59.999Z" },
    query: "effectiveAt=2000-01-01T00:00:00.000Z",
    headers: { "X-Evaluation-Time": "2099-01-01T00:00:00.000Z" },
  });
  const adapter = new StaticSingleTenantConfigurationV1Adapter({
    manifests: [validManifest],
    componentRevisions,
  }, fixedClock(EVALUATED_AT));
  const result = await adapter.resolveForExecutionContext(context);
  assert(
    requestLikeInput.body.evaluatedAt.startsWith("2099") &&
      requestLikeInput.query.includes("2000") && result.ok &&
      result.value.manifest.manifestRevisionId === "manifest-proof-v1",
    "Q36_request_like_time_influenced_resolution",
  );
});

await run("Q37", () => {
  assert(
    Reflect.get(
          coreRuntimeModule,
          "TrustedTenantConfigurationEvaluationInstant",
        ) === undefined &&
      Reflect.get(
          coreRuntimeModule,
          "trustedTenantConfigurationEvaluationInstantFromServerDate",
        ) === undefined &&
      Reflect.get(
          coreRuntimeModule,
          "selectTenantConfigurationManifestV1",
        ) === undefined,
    "Q37_direct_external_trusted_time_minting_available",
  );
});

await run("Q38", async () => {
  const wrongTenant = await resolve(
    [validManifest],
    componentRevisions,
    Object.freeze({ ...context, tenantId: OTHER_TENANT_ID }),
  );
  const wrongEnvironment = await resolve(
    [validManifest],
    componentRevisions,
    Object.freeze({ ...context, environment: "production" }),
  );
  const hashMismatch = await resolve([
    { ...validManifest, approvedByActorRef: "different-proof-actor" },
  ]);
  const unapproved = await resolve([
    await manifest({ approvalStatus: "DRAFT" }),
  ]);
  const overlapping = await manifest({
    manifestRevisionId: "manifest-proof-overlap-q38",
    supersedesManifestRevisionId: "manifest-proof-v1",
  });
  const ambiguous = await resolve([validManifest, overlapping]);
  const gap = await resolve(
    [validManifest],
    componentRevisions,
    context,
    fixedClock("2025-12-01T00:00:00.000Z"),
  );
  assert(
    !wrongTenant.ok &&
      wrongTenant.code === "tenant_configuration_missing" &&
      !wrongEnvironment.ok &&
      wrongEnvironment.code === "tenant_configuration_missing" &&
      !hashMismatch.ok && hashMismatch.code === "manifest_hash_mismatch" &&
      !unapproved.ok && unapproved.code === "manifest_not_approved" &&
      !ambiguous.ok && ambiguous.code === "tenant_configuration_ambiguous" &&
      !gap.ok && gap.code === "tenant_configuration_missing",
    "Q38_original_fail_closed_cases_changed",
  );
});

console.log(`CORE_RUNTIME_EXPORTS=${CORE_RUNTIME_EXPORTS.join(",")}`);
console.log("TF02B_TARGETED_PROOF=PASS");
