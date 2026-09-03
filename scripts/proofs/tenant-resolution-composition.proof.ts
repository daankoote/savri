import {
  type ResolvedTenantContext,
  resolveTenantRuntimeContext,
  type TenantResolutionAdapter,
} from "../../platform/runtime/tenant-resolution/tenant_resolution.ts";
import type {
  PlatformControlPlaneReader,
  PlatformDataPlaneLocatorRecord,
  PlatformRoutingRecord,
} from "../../platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts";
import {
  createStaticSingleTenantV1Adapter,
  type ServerOwnedStaticSingleTenantConfiguration,
} from "../../platform/runtime/tenant-resolution/adapters/static_single_tenant_v1.ts";
import {
  composeTenantResolutionAdapter,
} from "../../platform/runtime/tenant-resolution/tenant_resolution_composition.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const TENANT_ID = "51000000-0000-4000-8000-000000000001";
const ROUTING_ID = "52000000-0000-4000-8000-000000000001";
const LOCATOR_ID = "53000000-0000-4000-8000-000000000001";
const SECRET_REFERENCE_ID = "54000000-0000-4000-8000-000000000001";
const TRUSTED_HOST = "enval.localhost";
const STATIC_ROUTING_KEY = "static.enval.localhost";

function managedContext(
  trustedRoutingKey = TRUSTED_HOST,
  environment = "local",
) {
  return {
    trustedRoutingKey,
    environment,
    provenance: "MANAGED_LOCAL_PROOF" as const,
  };
}

function staticContext(
  trustedRoutingKey = STATIC_ROUTING_KEY,
  environment = "local",
) {
  return {
    trustedRoutingKey,
    environment,
    provenance: "DEPLOYMENT_FIXED" as const,
  };
}

const routingRecord: PlatformRoutingRecord = Object.freeze({
  routingIdentityId: ROUTING_ID,
  routingLifecycleStatus: "active",
  tenantId: TENANT_ID,
  tenantLifecycleStatus: "active",
});
const locatorRecord: PlatformDataPlaneLocatorRecord = Object.freeze({
  locatorId: LOCATOR_ID,
  tenantId: TENANT_ID,
  lifecycleStatus: "active",
  deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
  environment: "local",
  providerType: "supabase",
  dataPlaneReference: "enval",
  applicationRouteReference: "http://127.0.0.1:54321",
  secretReferenceId: SECRET_REFERENCE_ID,
});

let managedRouteReads = 0;
let managedLocatorReads = 0;
const managedReader: PlatformControlPlaneReader = {
  async findRoutingIdentities(host) {
    managedRouteReads += 1;
    return host === TRUSTED_HOST ? [routingRecord] : [];
  },
  async findDataPlaneLocators(tenantId) {
    managedLocatorReads += 1;
    return tenantId === TENANT_ID ? [locatorRecord] : [];
  },
};

const mutableStaticConfiguration = {
  trustedRoutingKey: STATIC_ROUTING_KEY,
  tenantId: TENANT_ID,
  dataPlane: {
    locatorId: LOCATOR_ID,
    deploymentOwnership: "ENVAL_MANAGED_DEDICATED" as const,
    environment: "local",
    providerType: "supabase",
    dataPlaneReference: "enval",
    applicationRouteReference: "http://127.0.0.1:54321",
    secretReferenceId: SECRET_REFERENCE_ID,
  },
};

const managedComposition = composeTenantResolutionAdapter({
  deploymentMode: "platform_control_plane_v1",
  platformControlPlaneReader: managedReader,
});
const staticComposition = composeTenantResolutionAdapter({
  deploymentMode: "static_single_tenant_v1",
  staticSingleTenantConfigurations: [mutableStaticConfiguration],
});
assert(managedComposition.ok, "managed_composition_failed");
assert(staticComposition.ok, "static_composition_failed");

const managedResult = await resolveTenantRuntimeContext(
  managedComposition.adapter,
  managedContext(),
);
const staticResult = await resolveTenantRuntimeContext(
  staticComposition.adapter,
  staticContext(),
);
assert(managedResult.ok, "managed_resolution_regressed");
assert(staticResult.ok, "static_resolution_failed");
assert(
  JSON.stringify(managedResult.value) === JSON.stringify(staticResult.value),
  "resolved_context_value_parity_failed",
);
assert(
  Object.keys(managedResult.value).sort().join("|") === "dataPlane|tenantId" &&
    Object.keys(managedResult.value.dataPlane).sort().join("|") ===
      "applicationRouteReference|dataPlaneReference|deploymentOwnership|environment|locatorId|providerType|secretReferenceId",
  "resolved_context_shape_parity_failed",
);
assert(
  managedRouteReads === 1 && managedLocatorReads === 1,
  "managed_reader_contract_not_used_exactly_once",
);

const secretPattern =
  /(password|service.?role|database.?url|raw.?secret|credential|access.?token)/i;
assert(
  !secretPattern.test(JSON.stringify(managedResult.value)) &&
    !secretPattern.test(JSON.stringify(staticResult.value)),
  "resolved_context_contains_credential_material",
);

mutableStaticConfiguration.tenantId = "61000000-0000-4000-8000-000000000001";
mutableStaticConfiguration.dataPlane.dataPlaneReference =
  "mutated-after-compose";
const immutableStaticResult = await resolveTenantRuntimeContext(
  staticComposition.adapter,
  staticContext(),
);
assert(
  immutableStaticResult.ok &&
    immutableStaticResult.value.tenantId === TENANT_ID &&
    immutableStaticResult.value.dataPlane.dataPlaneReference === "enval",
  "server_owned_static_configuration_not_captured_immutably",
);

const browserInjectedResult = await resolveTenantRuntimeContext(
  staticComposition.adapter,
  {
    trustedRoutingKey: STATIC_ROUTING_KEY,
    environment: "local",
    provenance: "DEPLOYMENT_FIXED",
    tenantId: "browser-selected-tenant",
    dataPlaneReference: "browser-selected-data-plane",
  } as Parameters<typeof resolveTenantRuntimeContext>[1],
);
assert(
  !browserInjectedResult.ok &&
    browserInjectedResult.code === "invalid_trusted_routing_context",
  "browser_extended_routing_context_not_rejected",
);
const browserRoutingOverride = await resolveTenantRuntimeContext(
  staticComposition.adapter,
  staticContext("browser-selected"),
);
assert(
  !browserRoutingOverride.ok &&
    browserRoutingOverride.code === "unknown_routing_identity",
  "browser_routing_override_not_rejected",
);

const unknownMode = composeTenantResolutionAdapter({
  deploymentMode: "browser_selected_mode",
});
const missingStatic = composeTenantResolutionAdapter({
  deploymentMode: "static_single_tenant_v1",
});
const ambiguousStatic = composeTenantResolutionAdapter({
  deploymentMode: "static_single_tenant_v1",
  staticSingleTenantConfigurations: [
    mutableStaticConfiguration,
    mutableStaticConfiguration,
  ],
});
const ambiguousModeDependencies = composeTenantResolutionAdapter({
  deploymentMode: "static_single_tenant_v1",
  platformControlPlaneReader: managedReader,
  staticSingleTenantConfigurations: [mutableStaticConfiguration],
});
assert(
  !unknownMode.ok && unknownMode.code === "unknown_deployment_mode" &&
    !missingStatic.ok &&
    missingStatic.code === "missing_static_single_tenant_config" &&
    !ambiguousStatic.ok &&
    ambiguousStatic.code === "ambiguous_static_single_tenant_config" &&
    !ambiguousModeDependencies.ok &&
    ambiguousModeDependencies.code === "ambiguous_deployment_configuration",
  "composition_did_not_fail_closed",
);

const malformedConfiguration = createStaticSingleTenantV1Adapter([{
  trustedRoutingKey: STATIC_ROUTING_KEY,
  tenantId: TENANT_ID,
  dataPlane: {
    locatorId: LOCATOR_ID,
    deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
    environment: "local",
    providerType: "supabase",
    dataPlaneReference: "enval",
    applicationRouteReference: "http://127.0.0.1:54321",
    secretReferenceId: "raw-secret-value",
  },
}]);
const credentialBearingConfiguration = createStaticSingleTenantV1Adapter([{
  trustedRoutingKey: STATIC_ROUTING_KEY,
  tenantId: TENANT_ID,
  dataPlane: {
    locatorId: LOCATOR_ID,
    deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
    environment: "local",
    providerType: "supabase",
    dataPlaneReference: "enval",
    applicationRouteReference: "http://127.0.0.1:54321",
    secretReferenceId: SECRET_REFERENCE_ID,
    databaseUrl: "must-not-be-accepted",
  },
}]);
const embeddedCredentialConfiguration = createStaticSingleTenantV1Adapter([{
  trustedRoutingKey: STATIC_ROUTING_KEY,
  tenantId: TENANT_ID,
  dataPlane: {
    locatorId: LOCATOR_ID,
    deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
    environment: "local",
    providerType: "supabase",
    dataPlaneReference: "enval",
    applicationRouteReference: "postgresql://user:password@localhost/database",
    secretReferenceId: SECRET_REFERENCE_ID,
  },
}]);
const browserExtendedComposition = composeTenantResolutionAdapter({
  deploymentMode: "static_single_tenant_v1",
  staticSingleTenantConfigurations: [mutableStaticConfiguration],
  browserTenantId: "browser-selected-tenant",
} as never);
assert(
  !malformedConfiguration.ok &&
    malformedConfiguration.code === "malformed_static_single_tenant_config" &&
    !credentialBearingConfiguration.ok &&
    credentialBearingConfiguration.code ===
      "malformed_static_single_tenant_config" &&
    !embeddedCredentialConfiguration.ok &&
    embeddedCredentialConfiguration.code ===
      "malformed_static_single_tenant_config" &&
    !browserExtendedComposition.ok &&
    browserExtendedComposition.code === "malformed_deployment_configuration",
  "malformed_or_credential_bearing_static_config_accepted",
);

const environmentMismatch = await resolveTenantRuntimeContext(
  staticComposition.adapter,
  staticContext(STATIC_ROUTING_KEY, "production"),
);
assert(
  !environmentMismatch.ok &&
    environmentMismatch.code === "environment_mismatch",
  "static_environment_mismatch_not_closed",
);

const managedUnknown = await resolveTenantRuntimeContext(
  managedComposition.adapter,
  managedContext("unknown.localhost"),
);
assert(
  !managedUnknown.ok && managedUnknown.code === "unknown_routing_identity",
  "managed_unknown_routing_regressed",
);
const managedMalformedComposition = composeTenantResolutionAdapter({
  deploymentMode: "platform_control_plane_v1",
  platformControlPlaneReader: {
    async findRoutingIdentities() {
      return [routingRecord];
    },
    async findDataPlaneLocators() {
      return [{
        ...locatorRecord,
        applicationRouteReference:
          "postgresql://user:password@localhost/database",
      }];
    },
  },
});
assert(
  managedMalformedComposition.ok,
  "managed_malformed_fixture_not_composed",
);
const managedMalformed = await resolveTenantRuntimeContext(
  managedMalformedComposition.adapter,
  managedContext(),
);
assert(
  !managedMalformed.ok &&
    managedMalformed.code === "malformed_data_plane_locator",
  "managed_locator_validation_regressed",
);

const staticAdapterSource = Deno.readTextFileSync(
  new URL(
    "../../platform/runtime/tenant-resolution/adapters/static_single_tenant_v1.ts",
    import.meta.url,
  ),
);
const coreSource = Deno.readTextFileSync(
  new URL(
    "../../platform/runtime/tenant-resolution/tenant_resolution.ts",
    import.meta.url,
  ),
);
const compositionSource = Deno.readTextFileSync(
  new URL(
    "../../platform/runtime/tenant-resolution/tenant_resolution_composition.ts",
    import.meta.url,
  ),
);
assert(
  !/(platform_control_plane|PlatformControlPlane|fetch\s*\(|Deno\.connect|WebSocket)/
    .test(staticAdapterSource) &&
    !/(platform_control_plane|PlatformControlPlane|static_single_tenant|StaticSingleTenant|fetch\s*\()/
      .test(coreSource),
  "static_or_core_provider_independence_failed",
);

async function sourceFiles(root: URL): Promise<string[]> {
  const values: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), root);
    if (entry.isDirectory) values.push(...await sourceFiles(child));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
      if (entry.name.includes(".proof.")) continue;
      if (
        [
          "/_shared/app_tenant_resolution_shadow.ts",
          "/_shared/app_control_plane_runtime_reader.ts",
          "/_shared/app_tenant_configuration_data_plane_v1.ts",
          "/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
          "/api-app-presentation-bootstrap/index.ts",
        ].some((path) => child.pathname.endsWith(path))
      ) {
        continue;
      }
      values.push(await Deno.readTextFile(child));
    }
  }
  return values;
}

const businessSources = [
  ...await sourceFiles(new URL("../../app/src/", import.meta.url)),
  ...await sourceFiles(new URL("../../supabase/functions/", import.meta.url)),
].join("\n");
assert(
  !/(platform_control_plane_v1|static_single_tenant_v1|composeTenantResolutionAdapter)/
    .test(businessSources),
  "adapter_selection_leaked_into_business_modules",
);
assert(
  !/(ConflictCheckPort|conflictRegistry|conflictParticipation)/.test(
    coreSource + staticAdapterSource + compositionSource,
  ),
  "conflict_participation_coupled_to_resolver_mode",
);

type FutureConflictCheckPort = Readonly<{
  check(reference: string): Promise<"connected" | "not_connected">;
}>;
const composeBusinessRuntime = (
  resolver: TenantResolutionAdapter,
  conflictCheck: FutureConflictCheckPort | null,
) => Object.freeze({ resolver, conflictCheck });
const withoutConflict = composeBusinessRuntime(staticComposition.adapter, null);
const withConflict = composeBusinessRuntime(staticComposition.adapter, {
  async check() {
    return "connected";
  },
});
const resolveRuntime = async (
  runtime: Readonly<{
    resolver: TenantResolutionAdapter;
    conflictCheck: FutureConflictCheckPort | null;
  }>,
): Promise<ResolvedTenantContext> => {
  const result = await resolveTenantRuntimeContext(runtime.resolver, {
    trustedRoutingKey: STATIC_ROUTING_KEY,
    environment: "local",
    provenance: "DEPLOYMENT_FIXED",
  });
  if (!result.ok) throw new ProofFailure("runtime_resolution_failed");
  return result.value;
};
assert(
  JSON.stringify(await resolveRuntime(withoutConflict)) ===
      JSON.stringify(await resolveRuntime(withConflict)) &&
    withoutConflict.conflictCheck === null &&
    (await withConflict.conflictCheck?.check("opaque")) === "connected",
  "future_conflict_port_not_independent",
);

console.log("TENANT_RESOLUTION_COMPOSITION_Q01_Q14=PASS");
