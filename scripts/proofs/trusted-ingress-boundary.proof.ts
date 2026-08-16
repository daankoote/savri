import {
  getAppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import {
  enforceAppTenantResolutionGate,
  type ServerEnvironmentReader,
} from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";
import {
  resolveTenantRuntimeContext,
} from "../../platform/runtime/tenant-resolution/tenant_resolution.ts";
import {
  composeTenantResolutionAdapter,
} from "../../platform/runtime/tenant-resolution/tenant_resolution_composition.ts";
import {
  buildTrustedTenantRoutingContext,
  normalizeTrustedRoutingIdentity,
  type ServerOwnedTrustedIngressConfiguration,
} from "../../platform/runtime/tenant-resolution/trusted_ingress.ts";
import type {
  PlatformControlPlaneReader,
  PlatformDataPlaneLocatorRecord,
  PlatformRoutingRecord,
} from "../../platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const TENANT_ID = "51000000-0000-4000-8000-000000000001";
const ROUTING_ID = "52000000-0000-4000-8000-000000000001";
const LOCATOR_ID = "53000000-0000-4000-8000-000000000001";
const SECRET_REFERENCE_ID = "54000000-0000-4000-8000-000000000001";
const MANAGED_HOST = "enval.localhost";
const STATIC_HOST = "static.enval.localhost";

function trustedConfiguration(
  overrides: Partial<ServerOwnedTrustedIngressConfiguration> = {},
): ServerOwnedTrustedIngressConfiguration {
  return {
    provenance: "MANAGED_LOCAL_PROOF",
    selectedRoutingIdentity: MANAGED_HOST,
    environment: "local",
    allowedRoutes: [{ routingIdentity: MANAGED_HOST, environment: "local" }],
    ...overrides,
  };
}

const canonical = buildTrustedTenantRoutingContext(trustedConfiguration({
  selectedRoutingIdentity: "ENVAL.LOCALHOST",
}));
assert(
  canonical.ok && canonical.value.trustedRoutingKey === MANAGED_HOST &&
    canonical.value.environment === "local" &&
    canonical.value.provenance === "MANAGED_LOCAL_PROOF",
  "canonical_trusted_context_not_built",
);
assert(
  normalizeTrustedRoutingIdentity("ENVAL.LOCALHOST") === MANAGED_HOST,
  "uppercase_normalization_failed",
);

for (
  const invalid of [
    "",
    " enval.localhost",
    "enval.localhost ",
    "enval.localhost.",
    "https://enval.localhost",
    "enval.localhost/path",
    "enval.localhost?tenant=other",
    "enval.localhost#fragment",
    "user@enval.localhost",
    "enval.localhost:54321",
    "enval.localhost,other.localhost",
    "enval..localhost",
    "*.enval.localhost",
    "énval.localhost",
    "enval\u0000.localhost",
  ]
) {
  assert(
    normalizeTrustedRoutingIdentity(invalid) === null,
    `invalid_routing_identity_accepted:${JSON.stringify(invalid)}`,
  );
}

const unknownProvenance = buildTrustedTenantRoutingContext(
  trustedConfiguration({ provenance: "RAW_HOST" }),
);
const unknownRouting = buildTrustedTenantRoutingContext(
  trustedConfiguration({ selectedRoutingIdentity: "other.localhost" }),
);
const environmentMismatch = buildTrustedTenantRoutingContext(
  trustedConfiguration({
    environment: "production",
  }),
);
const ambiguous = buildTrustedTenantRoutingContext(trustedConfiguration({
  allowedRoutes: [
    { routingIdentity: MANAGED_HOST, environment: "local" },
    { routingIdentity: "ENVAL.LOCALHOST", environment: "local" },
  ],
}));
assert(
  !unknownProvenance.ok &&
    unknownProvenance.code === "unknown_trust_provenance" &&
    !unknownRouting.ok && unknownRouting.code === "unknown_routing_identity" &&
    !environmentMismatch.ok &&
    environmentMismatch.code === "environment_mismatch" &&
    !ambiguous.ok && ambiguous.code === "ambiguous_routing_configuration",
  "trusted_ingress_failure_taxonomy_regressed",
);

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
  deploymentOwnership: "ENVAL_MANAGED_DEDICATED" as const,
  environment: "local",
  providerType: "supabase",
  dataPlaneReference: "enval",
  applicationRouteReference: "http://127.0.0.1:54321",
  secretReferenceId: SECRET_REFERENCE_ID,
});
const managedReader: PlatformControlPlaneReader = {
  async findRoutingIdentities(host) {
    return host === MANAGED_HOST ? [routingRecord] : [];
  },
  async findDataPlaneLocators(tenantId) {
    return tenantId === TENANT_ID ? [locatorRecord] : [];
  },
};

const managedComposition = composeTenantResolutionAdapter({
  deploymentMode: "platform_control_plane_v1",
  platformControlPlaneReader: managedReader,
});
assert(managedComposition.ok, "managed_composition_failed");
const managedResolved = await resolveTenantRuntimeContext(
  managedComposition.adapter,
  canonical.value,
);
assert(
  managedResolved.ok && managedResolved.value.tenantId === TENANT_ID &&
    managedResolved.value.dataPlane.locatorId === LOCATOR_ID,
  "managed_tenant_one_resolution_regressed",
);

const staticContext = buildTrustedTenantRoutingContext({
  provenance: "DEPLOYMENT_FIXED",
  selectedRoutingIdentity: STATIC_HOST,
  environment: "local",
  allowedRoutes: [{ routingIdentity: STATIC_HOST, environment: "local" }],
});
assert(staticContext.ok, "static_trusted_context_failed");
const staticComposition = composeTenantResolutionAdapter({
  deploymentMode: "static_single_tenant_v1",
  staticSingleTenantConfigurations: [{
    trustedRoutingKey: STATIC_HOST,
    tenantId: TENANT_ID,
    dataPlane: {
      locatorId: LOCATOR_ID,
      deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
      environment: "local",
      providerType: "supabase",
      dataPlaneReference: "enval",
      applicationRouteReference: "http://127.0.0.1:54321",
      secretReferenceId: SECRET_REFERENCE_ID,
    },
  }],
});
assert(staticComposition.ok, "static_composition_failed");
const staticResolved = await resolveTenantRuntimeContext(
  staticComposition.adapter,
  staticContext.value,
);
assert(
  staticResolved.ok && staticResolved.value.tenantId === TENANT_ID &&
    JSON.stringify(staticResolved.value) ===
      JSON.stringify(managedResolved.value),
  "static_tenant_one_resolution_regressed",
);

function environmentReader(
  values: Readonly<Record<string, string>>,
): ServerEnvironmentReader {
  return { get: (name) => values[name] };
}

function runtimeEnvironment(): string {
  return String(
    Deno.env.get("ENVIRONMENT") ?? Deno.env.get("ENV") ??
      Deno.env.get("APP_ENV") ?? "unknown",
  ).trim().toLowerCase() || "unknown";
}

function appEnvironment(
  mode: "platform_control_plane_v1" | "static_single_tenant_v1",
  includeManagedProvenance: boolean,
): ServerEnvironmentReader {
  const key = mode === "platform_control_plane_v1" ? MANAGED_HOST : STATIC_HOST;
  return environmentReader({
    ENVAL_TENANT_RESOLUTION_AUTHORITY_MODE: "AUTHORITATIVE",
    ENVAL_TENANT_RESOLUTION_SHADOW_MODE: mode,
    ENVAL_TENANT_REFERENCE: TENANT_ID,
    ENVAL_TRUSTED_TENANT_ROUTING_KEY: key,
    ...(includeManagedProvenance
      ? { ENVAL_TRUSTED_INGRESS_PROVENANCE: "MANAGED_LOCAL_PROOF" }
      : {}),
    ENVAL_DATA_PLANE_LOCATOR_ID: LOCATOR_ID,
    ENVAL_DATA_PLANE_DEPLOYMENT_OWNERSHIP: "ENVAL_MANAGED_DEDICATED",
    ENVAL_DATA_PLANE_PROVIDER_TYPE: "supabase",
    ENVAL_DATA_PLANE_REFERENCE: "enval",
    ENVAL_APPLICATION_ROUTE_REFERENCE: "http://127.0.0.1:54321",
    ENVAL_DATA_PLANE_SECRET_REFERENCE_ID: SECRET_REFERENCE_ID,
  });
}

const untrustedRequest = new Request(
  "https://project.supabase.co/functions/v1/api-app-dashboard-get?tenant_id=browser&data_plane=other",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": MANAGED_HOST,
      "X-Forwarded-Host": MANAGED_HOST,
      "Forwarded": `host=${MANAGED_HOST}`,
      "Origin": `https://${MANAGED_HOST}`,
      "Referer": `https://${MANAGED_HOST}/dashboard`,
      "X-Tenant-Id": TENANT_ID,
      "X-Data-Plane": "other",
    },
    body: JSON.stringify({ tenant_id: TENANT_ID, data_plane: "other" }),
  },
);

const directEdgeReads: string[] = [];
const directEdgeReader: PlatformControlPlaneReader = {
  async findRoutingIdentities(host) {
    directEdgeReads.push("route");
    return managedReader.findRoutingIdentities(host);
  },
  async findDataPlaneLocators(tenantId) {
    directEdgeReads.push("locator");
    const rows = await managedReader.findDataPlaneLocators(tenantId);
    return rows.map((row) => ({ ...row, environment: runtimeEnvironment() }));
  },
};
for (
  const request of [
    new Request("https://project.supabase.co/functions/v1/proof", {
      headers: { "Host": MANAGED_HOST },
    }),
    new Request("https://project.supabase.co/functions/v1/proof", {
      headers: { "X-Forwarded-Host": MANAGED_HOST },
    }),
    new Request("https://project.supabase.co/functions/v1/proof", {
      headers: { "Origin": `https://${MANAGED_HOST}` },
    }),
    new Request("https://project.supabase.co/functions/v1/proof", {
      headers: { "Referer": `https://${MANAGED_HOST}/dashboard` },
    }),
    untrustedRequest.clone(),
  ]
) {
  const directEdgeBlocked = await getAppRequestMeta(request, {
    serverEnvironment: appEnvironment("platform_control_plane_v1", false),
    managedReader: directEdgeReader,
    sink: null,
  });
  assert(
    directEdgeBlocked instanceof Response && directEdgeBlocked.status === 503 &&
      directEdgeReads.length === 0,
    "direct_edge_or_untrusted_input_bypassed_ingress_gate",
  );
}

const managedAccepted = await getAppRequestMeta(untrustedRequest.clone(), {
  serverEnvironment: appEnvironment("platform_control_plane_v1", true),
  managedReader: directEdgeReader,
  sink: null,
});
assert(
  !(managedAccepted instanceof Response) &&
    directEdgeReads.join("|") === "route|locator",
  "managed_local_proof_ingress_not_accepted",
);

const staticAccepted = await getAppRequestMeta(untrustedRequest.clone(), {
  serverEnvironment: appEnvironment("static_single_tenant_v1", false),
  sink: null,
});
assert(
  !(staticAccepted instanceof Response),
  "static_deployment_binding_required_control_plane_ingress",
);

const shadowWithoutIngress = await getAppRequestMeta(untrustedRequest.clone(), {
  authorityMode: "SHADOW",
  serverEnvironment: appEnvironment("platform_control_plane_v1", false),
  managedReader: directEdgeReader,
  sink: null,
});
const shadowGate = await enforceAppTenantResolutionGate(
  runtimeEnvironment(),
  "wl10b-shadow-proof",
  {
    authorityMode: "SHADOW",
    serverEnvironment: appEnvironment("platform_control_plane_v1", false),
    managedReader: directEdgeReader,
    sink: null,
  },
);
assert(
  !(shadowWithoutIngress instanceof Response) &&
    shadowGate.ok && shadowGate.diagnostic.parityStatus === "not_configured" &&
    directEdgeReads.join("|") === "route|locator",
  "shadow_failure_promoted_untrusted_ingress_or_blocked_request",
);

const contextEvidence = JSON.stringify([
  canonical,
  staticContext,
  unknownProvenance,
  unknownRouting,
  environmentMismatch,
  ambiguous,
]);
assert(
  !/(service.?role|database.?url|password|credential|access.?token|api.?key)/i
    .test(contextEvidence),
  "trusted_context_or_error_exposed_credential_material",
);

const ingressSource = Deno.readTextFileSync(
  new URL(
    "../../platform/runtime/tenant-resolution/trusted_ingress.ts",
    import.meta.url,
  ),
);
const appTenantSource = Deno.readTextFileSync(
  new URL(
    "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts",
    import.meta.url,
  ),
);
assert(
  !/(RAW_HOST|X_FORWARDED_HOST|X-Forwarded-Host|Forwarded|Origin|Referer)/
    .test(ingressSource) &&
    !/(headers\.get|req\.url|createClient|SUPABASE_SERVICE_ROLE_KEY|fetch\s*\()/
      .test(appTenantSource),
  "untrusted_transport_or_data_plane_client_entered_trusted_ingress",
);

console.log("TRUSTED_INGRESS_BOUNDARY_Q01_Q18=PASS");
