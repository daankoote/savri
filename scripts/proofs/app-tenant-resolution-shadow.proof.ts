import {
  getAppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import {
  type AppTenantResolutionShadowDiagnostic,
  type AppTenantResolutionShadowExecution,
  type AppTenantResolutionShadowObservationOptions,
  type CurrentAuthoritativeTenantRuntimeContext,
  enforceAppTenantResolutionGate,
} from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";
import {
  resolveTenantRuntimeContext,
} from "../../platform/runtime/tenant-resolution/tenant_resolution.ts";
import {
  PlatformControlPlaneV1Adapter,
  type PlatformControlPlaneReader,
  type PlatformDataPlaneLocatorRecord,
  type PlatformRoutingRecord,
} from "../../platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const TENANT_ID = "51000000-0000-4000-8000-000000000001";
const ROUTING_ID = "52000000-0000-4000-8000-000000000001";
const LOCATOR_ID = "53000000-0000-4000-8000-000000000001";
const SECRET_REFERENCE_ID = "54000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "51000000-0000-4000-8000-000000000002";
const OTHER_LOCATOR_ID = "53000000-0000-4000-8000-000000000002";
const TRUSTED_HOST = "enval.localhost";
const STATIC_ROUTING_KEY = "deployment:enval-local";
const REQUEST_ID = "wl07-safe-correlation";

const current: CurrentAuthoritativeTenantRuntimeContext = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
  locatorId: LOCATOR_ID,
  deploymentOwnership: "ENVAL_MANAGED_DEDICATED" as const,
  providerType: "supabase",
  dataPlaneReference: "enval",
});
const route: PlatformRoutingRecord = Object.freeze({
  routingIdentityId: ROUTING_ID,
  routingLifecycleStatus: "active",
  tenantId: TENANT_ID,
  tenantLifecycleStatus: "active",
});
const locator: PlatformDataPlaneLocatorRecord = Object.freeze({
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

function managedExecution(
  reader: PlatformControlPlaneReader,
): AppTenantResolutionShadowExecution {
  return Object.freeze({
    current,
    trustedRoutingKey: TRUSTED_HOST,
    composition: {
      deploymentMode: "platform_control_plane_v1",
      platformControlPlaneReader: reader,
    },
  });
}

function staticExecution(
  dataPlaneReference = "enval",
  expectedOverrides: Partial<CurrentAuthoritativeTenantRuntimeContext> = {},
): AppTenantResolutionShadowExecution {
  return Object.freeze({
    current: Object.freeze({ ...current, ...expectedOverrides }),
    trustedRoutingKey: STATIC_ROUTING_KEY,
    composition: {
      deploymentMode: "static_single_tenant_v1",
      staticSingleTenantConfigurations: [{
        trustedRoutingKey: STATIC_ROUTING_KEY,
        tenantId: TENANT_ID,
        dataPlane: {
          locatorId: LOCATOR_ID,
          deploymentOwnership: "ENVAL_MANAGED_DEDICATED" as const,
          environment: "local",
          providerType: "supabase",
          dataPlaneReference,
          applicationRouteReference: "http://127.0.0.1:54321",
          secretReferenceId: SECRET_REFERENCE_ID,
        },
      }],
    },
  });
}

function syntheticManagedReader(
  environment = "local",
): PlatformControlPlaneReader {
  return {
    async findRoutingIdentities(host) {
      return host === TRUSTED_HOST ? [route] : [];
    },
    async findDataPlaneLocators(tenantId) {
      return tenantId === TENANT_ID ? [{ ...locator, environment }] : [];
    },
  };
}

function requestWithBrowserTargetInjection(): Request {
  return new Request(
    "https://api.enval.local/functions/v1/api-app-dashboard-get?tenant_id=browser&project=other&tenant_resolution_authority_mode=SHADOW&tenant_resolution_adapter=browser",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": REQUEST_ID,
        "X-Tenant-Id": "browser-selected-tenant",
        "X-Data-Plane": "postgresql://browser:secret@other/database",
        "X-Tenant-Resolution-Authority-Mode": "SHADOW",
        "X-Tenant-Resolution-Adapter": "browser",
      },
      body: JSON.stringify({
        tenant_id: "browser-selected-tenant",
        data_plane_locator: "browser-selected-locator",
        tenant_resolution_authority_mode: "SHADOW",
        tenant_resolution_adapter: "browser",
      }),
    },
  );
}

async function observe(
  execution: AppTenantResolutionShadowExecution,
  options: Readonly<{ timeoutMs?: number; sinkThrows?: boolean }> = {},
) {
  const diagnostics: AppTenantResolutionShadowDiagnostic[] = [];
  const meta = await getAppRequestMeta(requestWithBrowserTargetInjection(), {
    authorityMode: "SHADOW",
    execution,
    timeoutMs: options.timeoutMs,
    sink(value) {
      diagnostics.push(value);
      if (options.sinkThrows) throw new Error("diagnostic_sink_failure");
    },
  });
  assert(diagnostics.length === 1, "shadow_diagnostic_not_emitted_once");
  assert(!(meta instanceof Response), "shadow_request_was_blocked");
  return { meta, diagnostic: diagnostics[0] };
}

async function requestThroughGate(
  options: AppTenantResolutionShadowObservationOptions,
) {
  const diagnostics: AppTenantResolutionShadowDiagnostic[] = [];
  const result = await getAppRequestMeta(requestWithBrowserTargetInjection(), {
    ...options,
    sink(value) {
      diagnostics.push(value);
    },
  });
  assert(diagnostics.length === 1, "tenant_gate_diagnostic_not_emitted_once");
  return { result, diagnostic: diagnostics[0] };
}

function environmentReader(values: Readonly<Record<string, string>>) {
  return {
    get(name: string) {
      return values[name];
    },
  };
}

function tenantOneServerEnvironment(
  adapter: "platform_control_plane_v1" | "static_single_tenant_v1",
  overrides: Readonly<Record<string, string>> = {},
) {
  return environmentReader({
    ENVAL_TENANT_RESOLUTION_AUTHORITY_MODE: "AUTHORITATIVE",
    ENVAL_TENANT_RESOLUTION_SHADOW_MODE: adapter,
    ENVAL_TENANT_REFERENCE: TENANT_ID,
    ENVAL_TRUSTED_TENANT_ROUTING_KEY: adapter === "platform_control_plane_v1"
      ? TRUSTED_HOST
      : STATIC_ROUTING_KEY,
    ENVAL_DATA_PLANE_LOCATOR_ID: LOCATOR_ID,
    ENVAL_DATA_PLANE_DEPLOYMENT_OWNERSHIP: "ENVAL_MANAGED_DEDICATED",
    ENVAL_DATA_PLANE_PROVIDER_TYPE: "supabase",
    ENVAL_DATA_PLANE_REFERENCE: "enval",
    ENVAL_APPLICATION_ROUTE_REFERENCE: "http://127.0.0.1:54321",
    ENVAL_DATA_PLANE_SECRET_REFERENCE_ID: SECRET_REFERENCE_ID,
    ...overrides,
  });
}

const managed = await observe(managedExecution(syntheticManagedReader()));
const staticResult = await observe(staticExecution());
assert(
  managed.diagnostic.parityStatus === "pass" &&
    managed.diagnostic.mode === "platform_control_plane_v1",
  "managed_tenant_one_shadow_parity_failed",
);
assert(
  staticResult.diagnostic.parityStatus === "pass" &&
    staticResult.diagnostic.mode === "static_single_tenant_v1",
  "static_tenant_one_shadow_parity_failed",
);
assert(
  managed.diagnostic.tenantReferenceHash ===
      staticResult.diagnostic.tenantReferenceHash &&
    managed.diagnostic.correlationReferenceHash ===
      staticResult.diagnostic.correlationReferenceHash,
  "adapter_shadow_normalization_parity_failed",
);

const authoritativeFields = [
  "environment",
  "idempotency_key",
  "ip_hash",
  "method",
  "origin",
  "path",
  "request_id",
  "timestamp",
  "url",
  "user_agent_hash",
];
assert(
  Object.keys(managed.meta).sort().join("|") ===
      authoritativeFields.sort().join("|") &&
    managed.meta.request_id === REQUEST_ID &&
    managed.meta.method === "POST" &&
    !Object.hasOwn(managed.meta, "tenantId") &&
    !Object.hasOwn(managed.meta, "dataPlane") &&
    !Object.hasOwn(managed.meta, "shadow"),
  "shadow_changed_authoritative_request_context",
);

const authoritativeManaged = await requestThroughGate({
  serverEnvironment: tenantOneServerEnvironment("platform_control_plane_v1"),
  managedReader: syntheticManagedReader("unknown"),
});
const authoritativeStatic = await requestThroughGate({
  serverEnvironment: tenantOneServerEnvironment("static_single_tenant_v1"),
});
assert(
  !(authoritativeManaged.result instanceof Response) &&
    authoritativeManaged.diagnostic.authorityMode === "AUTHORITATIVE" &&
    authoritativeManaged.diagnostic.parityStatus === "pass",
  "managed_authoritative_tenant_one_failed",
);
assert(
  !(authoritativeStatic.result instanceof Response) &&
    authoritativeStatic.diagnostic.authorityMode === "AUTHORITATIVE" &&
    authoritativeStatic.diagnostic.parityStatus === "pass",
  "static_authoritative_tenant_one_failed",
);
assert(
  authoritativeManaged.diagnostic.tenantReferenceHash ===
    authoritativeStatic.diagnostic.tenantReferenceHash,
  "authoritative_adapter_normalization_parity_failed",
);

const blockedBodies: string[] = [];
async function assertGenericBlock(
  result: Response | typeof managed.meta,
  code: string,
) {
  assert(result instanceof Response, `${code}:request_not_blocked`);
  assert(result.status === 503, `${code}:wrong_status`);
  const body = await result.text();
  blockedBodies.push(body);
  const parsed = JSON.parse(body);
  assert(
    Object.keys(parsed).sort().join("|") === "code|error|ok" &&
      parsed.ok === false && parsed.code === "service_unavailable" &&
      parsed.error === "Deze dienst is tijdelijk niet beschikbaar.",
    `${code}:unsafe_customer_failure_contract`,
  );
}

const unknownAuthority = await requestThroughGate({
  authorityMode: "BROWSER_SELECTED",
  execution: staticExecution(),
});
await assertGenericBlock(unknownAuthority.result, "unknown_authority_mode");

const unreadableServerConfiguration = await requestThroughGate({
  serverEnvironment: {
    get() {
      throw new Error("server_configuration_unavailable");
    },
  },
});
await assertGenericBlock(
  unreadableServerConfiguration.result,
  "unreadable_server_configuration",
);

const unknownRouting = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: managedExecution({
    async findRoutingIdentities() {
      return [];
    },
    async findDataPlaneLocators() {
      throw new Error("must_not_run");
    },
  }),
});
await assertGenericBlock(unknownRouting.result, "unknown_managed_routing");

const inactiveManaged = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: managedExecution({
    async findRoutingIdentities() {
      return [{ ...route, routingLifecycleStatus: "inactive" }];
    },
    async findDataPlaneLocators() {
      throw new Error("must_not_run");
    },
  }),
});
await assertGenericBlock(inactiveManaged.result, "inactive_managed_routing");

const tenantMismatch = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: staticExecution("enval", { tenantId: OTHER_TENANT_ID }),
});
await assertGenericBlock(tenantMismatch.result, "tenant_mismatch");

const environmentMismatch = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: staticExecution("enval", { environment: "staging" }),
});
await assertGenericBlock(environmentMismatch.result, "environment_mismatch");

const locatorMismatch = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: staticExecution("enval", { locatorId: OTHER_LOCATOR_ID }),
});
await assertGenericBlock(locatorMismatch.result, "locator_mismatch");

const providerMismatch = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: staticExecution("enval", { providerType: "postgres" }),
});
await assertGenericBlock(providerMismatch.result, "provider_mismatch");

const missingStaticConfiguration = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: {
    current,
    trustedRoutingKey: STATIC_ROUTING_KEY,
    composition: {
      deploymentMode: "static_single_tenant_v1",
      staticSingleTenantConfigurations: null,
    },
  },
});
await assertGenericBlock(
  missingStaticConfiguration.result,
  "missing_static_configuration",
);

const malformedExpectedRuntime = await requestThroughGate({
  authorityMode: "AUTHORITATIVE",
  execution: staticExecution("enval", { providerType: "SUPABASE" }),
});
await assertGenericBlock(
  malformedExpectedRuntime.result,
  "malformed_expected_runtime",
);

const mismatchTaxonomy = await enforceAppTenantResolutionGate(
  "local",
  REQUEST_ID,
  {
    authorityMode: "AUTHORITATIVE",
    execution: staticExecution("enval", { locatorId: OTHER_LOCATOR_ID }),
    sink: null,
  },
);
const unavailableTaxonomy = await enforceAppTenantResolutionGate(
  "local",
  REQUEST_ID,
  {
    authorityMode: "AUTHORITATIVE",
    execution: managedExecution({
      async findRoutingIdentities() {
        return [];
      },
      async findDataPlaneLocators() {
        return [];
      },
    }),
    sink: null,
  },
);
const invalidTaxonomy = await enforceAppTenantResolutionGate(
  "local",
  REQUEST_ID,
  {
    authorityMode: "invalid",
    execution: staticExecution(),
    sink: null,
  },
);
assert(
  !mismatchTaxonomy.ok &&
    mismatchTaxonomy.code === "tenant_resolution_mismatch" &&
    !unavailableTaxonomy.ok &&
    unavailableTaxonomy.code === "tenant_resolution_unavailable" &&
    !invalidTaxonomy.ok &&
    invalidTaxonomy.code === "tenant_resolution_configuration_invalid",
  "tenant_resolution_failure_taxonomy_failed",
);

const mismatch = await observe(staticExecution("different-data-plane"));
assert(
  mismatch.diagnostic.parityStatus === "mismatch" &&
    mismatch.meta.request_id === REQUEST_ID,
  "shadow_mismatch_not_fail_safe",
);

const unknownTenant = await observe(managedExecution({
  async findRoutingIdentities() {
    return [];
  },
  async findDataPlaneLocators() {
    throw new Error("locator_must_not_run");
  },
}));
assert(
  unknownTenant.diagnostic.parityStatus === "resolver_failure" &&
    unknownTenant.diagnostic.failureClass === "resolution" &&
    unknownTenant.meta.request_id === REQUEST_ID,
  "unknown_shadow_tenant_changed_current_runtime",
);

const throwingResolver = await observe(
  managedExecution({
    async findRoutingIdentities() {
      throw new Error("control_plane_unavailable_with_sensitive_detail");
    },
    async findDataPlaneLocators() {
      throw new Error("must_not_run");
    },
  }),
  { sinkThrows: true },
);
assert(
  throwingResolver.diagnostic.parityStatus === "resolver_failure" &&
    throwingResolver.diagnostic.failureClass === "unexpected" &&
    throwingResolver.meta.request_id === REQUEST_ID,
  "shadow_failure_broke_authoritative_request",
);

const timeout = await observe(
  managedExecution({
    async findRoutingIdentities() {
      return await new Promise(() => {});
    },
    async findDataPlaneLocators() {
      return [];
    },
  }),
  { timeoutMs: 5 },
);
assert(
  timeout.diagnostic.failureClass === "timeout" &&
    timeout.meta.request_id === REQUEST_ID,
  "shadow_timeout_broke_authoritative_request",
);

const serializedDiagnostics = JSON.stringify([
  managed.diagnostic,
  staticResult.diagnostic,
  authoritativeManaged.diagnostic,
  authoritativeStatic.diagnostic,
  unknownAuthority.diagnostic,
  unreadableServerConfiguration.diagnostic,
  unknownRouting.diagnostic,
  inactiveManaged.diagnostic,
  tenantMismatch.diagnostic,
  environmentMismatch.diagnostic,
  locatorMismatch.diagnostic,
  providerMismatch.diagnostic,
  missingStaticConfiguration.diagnostic,
  malformedExpectedRuntime.diagnostic,
  mismatch.diagnostic,
  unknownTenant.diagnostic,
  throwingResolver.diagnostic,
  timeout.diagnostic,
]);
assert(
  !serializedDiagnostics.includes(TENANT_ID) &&
    !serializedDiagnostics.includes(LOCATOR_ID) &&
    !serializedDiagnostics.includes(SECRET_REFERENCE_ID) &&
    !serializedDiagnostics.includes(REQUEST_ID) &&
    !blockedBodies.join("\n").includes(TENANT_ID) &&
    !blockedBodies.join("\n").includes(LOCATOR_ID) &&
    !blockedBodies.join("\n").includes(SECRET_REFERENCE_ID) &&
    !/(password|service.?role|database.?url|raw.?secret|credential|access.?token)/i
      .test(`${serializedDiagnostics}\n${blockedBodies.join("\n")}`),
  "shadow_diagnostic_contains_sensitive_material",
);

const shadowSource = Deno.readTextFileSync(
  new URL(
    "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts",
    import.meta.url,
  ),
);
const foundationSource = Deno.readTextFileSync(
  new URL(
    "../../supabase/functions/_shared/app_foundation.ts",
    import.meta.url,
  ),
);
const workforceAuthorizationSource = Deno.readTextFileSync(
  new URL(
    "../../supabase/functions/_shared/app_workforce_authorization.ts",
    import.meta.url,
  ),
);
assert(
  foundationSource.includes("enforceAppTenantResolutionGate(") &&
    foundationSource.includes("if (!tenantGate.ok)") &&
    !/(createClient|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|fetch\s*\()/
      .test(shadowSource) &&
    !/(customer_id|case_id|dossier_id|auth_user|access_grant)/
      .test(shadowSource),
  "shadow_runtime_switched_data_plane_or_entered_business_authority",
);

const coveredEntrypoints = [
  "api-app-auth-bootstrap",
  "api-app-dashboard-get",
  "api-app-document-download-url",
  "api-app-document-upload-confirm",
  "api-app-document-upload-url",
  "api-app-document-withdraw-current",
  "api-app-signup-intake-start",
  "api-app-signup-signing-challenge",
  "api-app-signup-signing-finalize",
  "api-app-signup-submit",
  "api-app-signup-upload-confirm",
  "api-app-signup-upload-url",
] as const;
const sharedWorkforceEntrypoints = [
  "api-app-ops-location-observation-record",
  "api-app-ops-location-root-create",
  "api-app-ops-location-version-accept",
  "api-app-ops-location-version-correct",
] as const;
const legacyFallbackEntrypoints = [
  "api-dossier-access-save",
  "api-dossier-access-update",
  "api-dossier-address-save",
  "api-dossier-address-verify",
  "api-dossier-charger-delete",
  "api-dossier-charger-save",
  "api-dossier-consents-save",
  "api-dossier-dev-unlock",
  "api-dossier-doc-delete",
  "api-dossier-doc-download-url",
  "api-dossier-evaluate",
  "api-dossier-export",
  "api-dossier-get",
  "api-dossier-login-request",
  "api-dossier-observed-source-upsert",
  "api-dossier-upload-confirm",
  "api-dossier-upload-url",
  "api-dossier-verify",
  "api-lead-submit",
] as const;
const tenantScopedWorkerEntrypoints = [
  "locked-unpaid-reminder-worker",
  "mail-worker",
  "retention-worker",
] as const;

for (const endpoint of coveredEntrypoints) {
  const source = Deno.readTextFileSync(
    new URL(`../../supabase/functions/${endpoint}/index.ts`, import.meta.url),
  );
  assert(
    source.includes("getAppRequestMeta") &&
      source.includes('from "../_shared/app_foundation.ts"') &&
      /const meta = await getAppRequestMeta\(req\);\s*if \(meta instanceof Response\) return meta;/
        .test(
          source,
        ),
    `shared_shadow_runtime_path_missing:${endpoint}`,
  );
}

assert(
  /const metaResult = await deps\.requestMeta\(req\);\s*if \(metaResult instanceof Response\) return metaResult;\s*const meta = metaResult;/.test(
    workforceAuthorizationSource,
  ),
  "shared_workforce_tenant_gate_propagation_missing",
);

for (const endpoint of sharedWorkforceEntrypoints) {
  const source = Deno.readTextFileSync(
    new URL(`../../supabase/functions/${endpoint}/index.ts`, import.meta.url),
  );
  assert(
    source.includes("createWorkforceLocationHandler") &&
      source.includes('from "../_shared/app_workforce_authorization.ts"') &&
      !source.includes("getAppRequestMeta") &&
      !/(tenant_resolution|TenantResolver|ENVAL_TENANT_REFERENCE|ENVAL_DATA_PLANE)/
        .test(source),
    `shared_workforce_runtime_path_missing:${endpoint}`,
  );
}

const promotionEntrypointSource = Deno.readTextFileSync(
  new URL(
    "../../supabase/functions/api-app-signup-promote/index.ts",
    import.meta.url,
  ),
);
const promotionHandlerSource = Deno.readTextFileSync(
  new URL(
    "../../supabase/functions/_shared/signup_promotion.ts",
    import.meta.url,
  ),
);
assert(
  promotionEntrypointSource.includes("handleSignupPromotion") &&
    /const metaResult = await getAppRequestMeta\(req\);\s*if \(metaResult instanceof Response\) return metaResult;/
      .test(
        promotionHandlerSource,
      ),
  "delegated_signup_promotion_gate_missing",
);

const functionsRoot = new URL("../../supabase/functions/", import.meta.url);
const discoveredEntrypoints = Array.from(Deno.readDirSync(functionsRoot))
  .filter((entry) => entry.isDirectory)
  .filter((entry) => {
    try {
      return Deno.statSync(new URL(`${entry.name}/index.ts`, functionsRoot))
        .isFile;
    } catch {
      return false;
    }
  })
  .map((entry) => entry.name)
  .sort();
const classifiedEntrypoints = [
  ...coveredEntrypoints,
  "api-app-signup-promote",
  ...sharedWorkforceEntrypoints,
  ...legacyFallbackEntrypoints,
  ...tenantScopedWorkerEntrypoints,
].sort();
assert(
  discoveredEntrypoints.join("|") === classifiedEntrypoints.join("|") &&
    new Set(classifiedEntrypoints).size === classifiedEntrypoints.length,
  "edge_entrypoint_coverage_inventory_incomplete",
);

assert(
  !/(createClient|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)/.test(shadowSource) &&
    !shadowSource.includes("new SupabaseClient"),
  "dynamic_data_plane_switching_detected",
);

type CommandResult = Readonly<{ code: number; stdout: string; stderr: string }>;

async function psqlResult(
  port: number,
  statement: string,
): Promise<CommandResult> {
  const child = new Deno.Command("psql", {
    args: [
      "-X",
      "-qAt",
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    env: { PGPASSWORD: "postgres" },
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(statement));
  await writer.close();
  const result = await child.output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

async function psql(port: number, statement: string): Promise<string> {
  const result = await psqlResult(port, statement);
  if (result.code !== 0) throw new ProofFailure("local_readonly_sql_failed");
  return result.stdout;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function rootFingerprint(): Promise<string> {
  return await psql(
    54322,
    `
    begin transaction read only;
    select md5(concat_ws('|',
      (select count(*)::text from auth.users),
      (select count(*)::text from storage.objects),
      (select count(*)::text from public.app_customers),
      (select count(*)::text from public.app_customer_identities),
      (select count(*)::text from public.app_customer_access_grants),
      (select count(*)::text from public.app_cases),
      (select count(*)::text from public.app_signup_intakes),
      (select count(*)::text from public.app_audit_events)
    ));
    rollback;
  `,
  );
}

function localControlPlaneReader(): PlatformControlPlaneReader {
  return {
    async findRoutingIdentities(host) {
      const result = await psql(
        56322,
        `
        begin transaction read only;
        select r.id, r.lifecycle_status, t.id, t.lifecycle_status
        from platform.routing_identities r
        join platform.tenants t on t.id = r.tenant_id
        where r.identity_kind = 'host'
          and r.normalized_value = ${sqlLiteral(host)}
        order by r.id;
        rollback;
      `,
      );
      if (!result) return [];
      return result.split("\n").map((row) => {
        const [
          routingIdentityId,
          routingLifecycleStatus,
          tenantId,
          tenantLifecycleStatus,
        ] = row.split("|");
        return {
          routingIdentityId,
          routingLifecycleStatus,
          tenantId,
          tenantLifecycleStatus,
        };
      });
    },
    async findDataPlaneLocators(tenantId) {
      const result = await psql(
        56322,
        `
        begin transaction read only;
        select id, tenant_id, lifecycle_status, deployment_ownership,
          environment, provider_type, provider_project_ref,
          application_route_ref, secret_reference_id
        from platform.data_plane_locators
        where tenant_id = ${sqlLiteral(tenantId)}
        order by id;
        rollback;
      `,
      );
      if (!result) return [];
      return result.split("\n").map((row) => {
        const [
          locatorId,
          rowTenantId,
          lifecycleStatus,
          deploymentOwnership,
          environment,
          providerType,
          dataPlaneReference,
          applicationRouteReference,
          secretReferenceId,
        ] = row.split("|");
        return {
          locatorId,
          tenantId: rowTenantId,
          lifecycleStatus,
          deploymentOwnership,
          environment,
          providerType,
          dataPlaneReference,
          applicationRouteReference,
          secretReferenceId,
        };
      });
    },
  };
}

if (Deno.args.includes("--local-control-plane")) {
  const before = await rootFingerprint();
  const reader = localControlPlaneReader();
  const routes = await reader.findRoutingIdentities(TRUSTED_HOST);
  assert(routes.length === 1, "local_routing_identity_cardinality_failed");
  assert(
    routes[0].routingIdentityId === ROUTING_ID &&
      routes[0].tenantId === TENANT_ID &&
      routes[0].routingLifecycleStatus === "active",
    "local_routing_identity_state_failed",
  );
  assert(
    routes[0].tenantLifecycleStatus === "active",
    "local_control_plane_tenant_state_failed",
  );
  const locators = await reader.findDataPlaneLocators(TENANT_ID);
  const activeLocators = locators.filter((row) =>
    row.lifecycleStatus === "active" && row.environment === "local"
  );
  assert(
    activeLocators.length === 1,
    "local_active_locator_cardinality_failed",
  );
  assert(
    activeLocators[0].locatorId === LOCATOR_ID &&
      activeLocators[0].tenantId === TENANT_ID &&
      activeLocators[0].providerType === "supabase" &&
      activeLocators[0].dataPlaneReference === "enval",
    "local_active_locator_state_failed",
  );
  const localResolved = await resolveTenantRuntimeContext(
    new PlatformControlPlaneV1Adapter(reader),
    { trustedRoutingKey: TRUSTED_HOST, environment: "local" },
  );
  assert(
    localResolved.ok && localResolved.value.tenantId === TENANT_ID,
    "local_managed_tenant_identity_failed",
  );
  assert(
    localResolved.ok && localResolved.value.dataPlane.environment === "local",
    "local_managed_environment_failed",
  );
  assert(
    localResolved.ok &&
      localResolved.value.dataPlane.locatorId === LOCATOR_ID,
    "local_managed_locator_failed",
  );
  const localManagedShadow = await observe(
    managedExecution(reader),
  );
  assert(
    localManagedShadow.diagnostic.parityStatus === "pass",
    "local_managed_shadow_parity_failed",
  );
  const localManagedAuthoritative = await enforceAppTenantResolutionGate(
    "local",
    REQUEST_ID,
    {
      serverEnvironment: tenantOneServerEnvironment(
        "platform_control_plane_v1",
      ),
      managedReader: reader,
      sink: null,
    },
  );
  assert(
    localManagedAuthoritative.ok &&
      localManagedAuthoritative.authorityMode === "AUTHORITATIVE" &&
      localManagedAuthoritative.diagnostic.parityStatus === "pass",
    "local_managed_authoritative_parity_failed",
  );
  const after = await rootFingerprint();
  assert(
    before === after,
    "local_tenant_enval_nonmutation_failed",
  );
  const localSafeEvidence = JSON.stringify([
    localManagedShadow.diagnostic,
    localManagedAuthoritative.diagnostic,
  ]);
  assert(
    !localSafeEvidence.includes(TENANT_ID) &&
      !localSafeEvidence.includes(LOCATOR_ID) &&
      !localSafeEvidence.includes(SECRET_REFERENCE_ID) &&
      !/(password|service.?role|database.?url|raw.?secret|credential|access.?token)/i
        .test(localSafeEvidence),
    "local_managed_diagnostic_leak_failed",
  );
  console.log("TENANT_RESOLUTION_SHADOW_LOCAL_Q15_Q18=PASS");
  console.log("TENANT_RESOLUTION_AUTHORITY_LOCAL_Q44_Q46=PASS");
}

console.log("TENANT_RESOLUTION_SHADOW_Q01_Q14=PASS");
console.log("TENANT_RESOLUTION_AUTHORITY_Q19_Q43=PASS");
console.log("DYNAMIC_DATA_PLANE_SWITCHING=NO");
