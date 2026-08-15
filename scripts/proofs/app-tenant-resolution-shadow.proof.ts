import {
  getAppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import {
  type AppTenantResolutionShadowDiagnostic,
  type AppTenantResolutionShadowExecution,
} from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";
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
const TRUSTED_HOST = "enval.localhost";
const STATIC_ROUTING_KEY = "deployment:enval-local";
const REQUEST_ID = "wl07-safe-correlation";

const current = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
  locatorId: LOCATOR_ID,
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
): AppTenantResolutionShadowExecution {
  return Object.freeze({
    current,
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

function syntheticManagedReader(): PlatformControlPlaneReader {
  return {
    async findRoutingIdentities(host) {
      return host === TRUSTED_HOST ? [route] : [];
    },
    async findDataPlaneLocators(tenantId) {
      return tenantId === TENANT_ID ? [locator] : [];
    },
  };
}

function requestWithBrowserTargetInjection(): Request {
  return new Request(
    "https://api.enval.local/functions/v1/api-app-dashboard-get?tenant_id=browser&project=other",
    {
      method: "POST",
      headers: {
        "X-Request-Id": REQUEST_ID,
        "X-Tenant-Id": "browser-selected-tenant",
        "X-Data-Plane": "postgresql://browser:secret@other/database",
      },
    },
  );
}

async function observe(
  execution: AppTenantResolutionShadowExecution,
  options: Readonly<{ timeoutMs?: number; sinkThrows?: boolean }> = {},
) {
  const diagnostics: AppTenantResolutionShadowDiagnostic[] = [];
  const meta = await getAppRequestMeta(requestWithBrowserTargetInjection(), {
    execution,
    timeoutMs: options.timeoutMs,
    sink(value) {
      diagnostics.push(value);
      if (options.sinkThrows) throw new Error("diagnostic_sink_failure");
    },
  });
  assert(diagnostics.length === 1, "shadow_diagnostic_not_emitted_once");
  return { meta, diagnostic: diagnostics[0] };
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
    !/(password|service.?role|database.?url|raw.?secret|credential|access.?token)/i
      .test(serializedDiagnostics),
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
assert(
  foundationSource.includes("observeAppTenantResolutionShadow(") &&
    !/(createClient|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|fetch\s*\()/
      .test(shadowSource) &&
    !/(customer_id|case_id|dossier_id|auth_user|access_grant)/
      .test(shadowSource),
  "shadow_runtime_switched_data_plane_or_entered_business_authority",
);

for (
  const endpoint of [
    "api-app-auth-bootstrap",
    "api-app-signup-submit",
    "api-app-signup-signing-finalize",
    "api-app-dashboard-get",
  ]
) {
  const source = Deno.readTextFileSync(
    new URL(`../../supabase/functions/${endpoint}/index.ts`, import.meta.url),
  );
  assert(
    source.includes("getAppRequestMeta") &&
      source.includes('from "../_shared/app_foundation.ts"'),
    `shared_shadow_runtime_path_missing:${endpoint}`,
  );
}

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
  const localManaged = await observe(
    managedExecution(localControlPlaneReader()),
  );
  const after = await rootFingerprint();
  assert(
    localManaged.diagnostic.parityStatus === "pass" && before === after,
    "local_managed_shadow_or_tenant_nonmutation_failed",
  );
  console.log("TENANT_RESOLUTION_SHADOW_LOCAL_Q15_Q18=PASS");
}

console.log("TENANT_RESOLUTION_SHADOW_Q01_Q14=PASS");
