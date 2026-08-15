import {
  resolveTenantRuntimeContext,
  type TenantResolutionAdapter,
} from "../../platform/runtime/tenant-resolution/tenant_resolution.ts";
import {
  type PlatformControlPlaneReader,
  PlatformControlPlaneV1Adapter,
  type PlatformDataPlaneLocatorRecord,
  type PlatformRoutingRecord,
} from "../../platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts";

const CONTROL_PLANE_PORT = 56322;
const TENANT_ENVAL_PORT = 54322;
const DATABASE = "postgres";
const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);

const TENANT_ID = "51000000-0000-4000-8000-000000000001";
const ROUTING_ID = "52000000-0000-4000-8000-000000000001";
const LOCATOR_ID = "53000000-0000-4000-8000-000000000001";
const SECRET_REFERENCE_ID = "54000000-0000-4000-8000-000000000001";
const AUDIT_ID = "55000000-0000-4000-8000-000000000001";
const TRUSTED_LOCAL_HOST = "enval.localhost";

class ProofFailure extends Error {}

type CommandResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

function scrub(value: string): string {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[token]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 300);
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function run(
  command: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  const child = new Deno.Command(command, {
    args,
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
    env: { PGPASSWORD: "postgres" },
  }).spawn();
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }
  const result = await child.output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

async function psqlResult(
  port: number,
  statement: string,
): Promise<CommandResult> {
  return await run("psql", [
    "-X",
    "-qAt",
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1",
  ], statement);
}

async function psql(port: number, statement: string): Promise<string> {
  const result = await psqlResult(port, statement);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}

async function reject(port: number, statement: string): Promise<void> {
  const result = await psqlResult(port, `begin;\n${statement}\nrollback;`);
  assert(result.code !== 0, "expected_database_rejection");
}

async function tenantEnvalFingerprint(): Promise<string> {
  return await psql(
    TENANT_ENVAL_PORT,
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
      (select count(*)::text from public.app_audit_events),
      (select md5(string_agg(
        n.nspname || '.' || c.relname || ':' || c.relkind::text,
        ',' order by n.nspname, c.relname, c.relkind
      )) from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'auth', 'storage'))
    ));
    rollback;
  `,
  );
}

async function bootstrapLocalTenantOne(): Promise<void> {
  await psql(
    CONTROL_PLANE_PORT,
    `
    begin;
    insert into platform.tenants (
      id, lifecycle_status, public_slug, display_name,
      created_by_actor_ref, created_from_request_id, change_reason_ref
    ) values (
      ${sqlLiteral(TENANT_ID)}, 'active', 'enval', 'ENVAL',
      'system:wl05-local-bootstrap', 'wl05-local-bootstrap-v1',
      'wl05-local-foundation'
    ) on conflict (id) do nothing;

    insert into platform.routing_identities (
      id, tenant_id, identity_kind, normalized_value, lifecycle_status,
      verified_at, verification_method, verification_evidence_ref,
      created_by_actor_ref, created_from_request_id, activated_at
    ) values (
      ${sqlLiteral(ROUTING_ID)}, ${sqlLiteral(TENANT_ID)}, 'host',
      ${sqlLiteral(TRUSTED_LOCAL_HOST)}, 'active',
      '2026-08-15T12:00:00Z', 'local_static_fixture',
      'wl05-local-dev-authority', 'system:wl05-local-bootstrap',
      'wl05-local-bootstrap-v1', '2026-08-15T12:00:00Z'
    ) on conflict (id) do nothing;

    insert into platform.data_plane_locators (
      id, tenant_id, deployment_ownership, provider_type, environment,
      region, provider_project_ref, application_route_ref,
      secret_reference_id, lifecycle_status, effective_at,
      created_by_actor_ref, created_from_request_id, change_reason_ref
    ) values (
      ${sqlLiteral(LOCATOR_ID)}, ${sqlLiteral(TENANT_ID)},
      'ENVAL_MANAGED_DEDICATED', 'supabase', 'local', 'local', 'enval',
      'http://127.0.0.1:54321', ${sqlLiteral(SECRET_REFERENCE_ID)},
      'active', '2026-08-15T12:00:00Z',
      'system:wl05-local-bootstrap', 'wl05-local-bootstrap-v1',
      'wl05-local-foundation'
    ) on conflict (id) do nothing;

    insert into platform.action_audit_events (
      id, actor_kind, actor_reference, tenant_id, action_type,
      reason_or_purpose_ref, result, request_id, correlation_ref,
      environment, component, provenance_ref, recorded_at
    ) values (
      ${sqlLiteral(AUDIT_ID)}, 'system', 'system:wl05-local-bootstrap',
      ${sqlLiteral(TENANT_ID)}, 'tenant.bootstrap.local',
      'wl05-local-foundation', 'success', 'wl05-local-bootstrap-v1',
      'wl05-local-bootstrap-v1', 'local', 'platform.bootstrap',
      'migration:20260815120000', '2026-08-15T12:00:00Z'
    ) on conflict (id) do nothing;
    commit;
  `,
  );
}

function parseRows<T>(value: string, mapper: (parts: string[]) => T): T[] {
  if (!value.trim()) return [];
  return value.split("\n").filter(Boolean).map((line) =>
    mapper(line.split("|"))
  );
}

function databaseReader(): PlatformControlPlaneReader {
  return {
    async findRoutingIdentities(host): Promise<PlatformRoutingRecord[]> {
      const value = await psql(
        CONTROL_PLANE_PORT,
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
      return parseRows(
        value,
        (
          [
            routingIdentityId,
            routingLifecycleStatus,
            tenantId,
            tenantLifecycleStatus,
          ],
        ) => ({
          routingIdentityId,
          routingLifecycleStatus,
          tenantId,
          tenantLifecycleStatus,
        }),
      );
    },
    async findDataPlaneLocators(
      tenantId,
    ): Promise<PlatformDataPlaneLocatorRecord[]> {
      const value = await psql(
        CONTROL_PLANE_PORT,
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
      return parseRows(value, ([
        locatorId,
        rowTenantId,
        lifecycleStatus,
        deploymentOwnership,
        environment,
        providerType,
        dataPlaneReference,
        applicationRouteReference,
        secretReferenceId,
      ]) => ({
        locatorId,
        tenantId: rowTenantId,
        lifecycleStatus,
        deploymentOwnership,
        environment,
        providerType,
        dataPlaneReference,
        applicationRouteReference,
        secretReferenceId,
      }));
    },
  };
}

const controlTarget = await run("node", [
  "scripts/tools/enval-supabase-target.mjs",
  "--target",
  "CONTROL_PLANE",
  "--operation",
  "inspect",
]);
const tenantTarget = await run("node", [
  "scripts/tools/enval-supabase-target.mjs",
  "--target",
  "TENANT_ENVAL",
  "--operation",
  "inspect",
]);
assert(
  controlTarget.code === 0 &&
    controlTarget.stdout.includes("TARGET=CONTROL_PLANE") &&
    controlTarget.stdout.includes("WORKDIR=platform/control-plane") &&
    controlTarget.stdout.includes("PROJECT_ID=enval-control-plane") &&
    tenantTarget.code === 0 &&
    tenantTarget.stdout.includes("TARGET=TENANT_ENVAL") &&
    tenantTarget.stdout.includes("WORKDIR=.") &&
    tenantTarget.stdout.includes("PROJECT_ID=enval"),
  "target_guard_identity_failed",
);

const rootBefore = await tenantEnvalFingerprint();
assert(rootBefore.length === 32, "tenant_enval_fingerprint_unavailable");

const controlSystemId = await psql(
  CONTROL_PLANE_PORT,
  "select system_identifier from pg_control_system();",
);
const tenantSystemId = await psql(
  TENANT_ENVAL_PORT,
  "begin transaction read only; select system_identifier from pg_control_system(); rollback;",
);
assert(
  Boolean(
    controlSystemId && tenantSystemId && controlSystemId !== tenantSystemId,
  ),
  "control_plane_not_physically_distinct",
);
assert(
  await psql(
    TENANT_ENVAL_PORT,
    `
    begin transaction read only;
    select count(*) from (
      values
        (to_regclass('platform.tenants')),
        (to_regclass('platform.routing_identities')),
        (to_regclass('platform.data_plane_locators')),
        (to_regclass('platform.action_audit_events'))
    ) v(regclass_value) where regclass_value is not null;
    rollback;
  `,
  ) === "0",
  "control_plane_tables_present_in_tenant_enval",
);

assert(
  await psql(
    CONTROL_PLANE_PORT,
    `
    select count(*) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'platform' and c.relkind = 'r';
  `,
  ) === "4",
  "foundation_table_count_not_four",
);
assert(
  await psql(
    CONTROL_PLANE_PORT,
    `
    select count(*) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'platform' and c.relkind = 'r'
      and c.relname in (
        'tenants', 'routing_identities', 'data_plane_locators',
        'action_audit_events'
      ) and c.relrowsecurity and c.relforcerowsecurity;
  `,
  ) === "4",
  "foundation_rls_not_forced",
);
assert(
  await psql(
    CONTROL_PLANE_PORT,
    `
    select count(*) from information_schema.columns
    where table_schema = 'platform'
      and lower(column_name) ~ '(service_role|password|credential|secret_value|customer|dossier|case_id|ean|mid)';
  `,
  ) === "0",
  "forbidden_control_plane_column_present",
);
assert(
  await psql(
    CONTROL_PLANE_PORT,
    `
    select concat_ws('|',
      has_table_privilege('anon', 'platform.tenants', 'select,insert,update,delete'),
      has_table_privilege('authenticated', 'platform.tenants', 'select,insert,update,delete'),
      has_table_privilege('service_role', 'platform.tenants', 'select'),
      has_table_privilege('service_role', 'platform.tenants', 'insert,update,delete'),
      has_table_privilege('service_role', 'platform.action_audit_events', 'select,insert,update,delete')
    );
  `,
  ) === "f|f|t|f|f",
  "foundation_privilege_boundary_failed",
);

await bootstrapLocalTenantOne();
await bootstrapLocalTenantOne();
assert(
  await psql(
    CONTROL_PLANE_PORT,
    `
    select concat_ws('|',
      (select count(*) from platform.tenants where id = ${
      sqlLiteral(TENANT_ID)
    }),
      (select count(*) from platform.routing_identities where id = ${
      sqlLiteral(ROUTING_ID)
    }),
      (select count(*) from platform.data_plane_locators where id = ${
      sqlLiteral(LOCATOR_ID)
    }),
      (select count(*) from platform.action_audit_events where id = ${
      sqlLiteral(AUDIT_ID)
    })
    );
  `,
  ) === "1|1|1|1",
  "tenant_one_bootstrap_not_idempotent",
);

await reject(
  CONTROL_PLANE_PORT,
  `
  insert into platform.routing_identities (
    tenant_id, identity_kind, normalized_value, lifecycle_status,
    verified_at, verification_method, verification_evidence_ref,
    created_by_actor_ref, created_from_request_id, activated_at
  ) values (
    ${sqlLiteral(TENANT_ID)}, 'host', ${
    sqlLiteral(TRUSTED_LOCAL_HOST)
  }, 'active',
    clock_timestamp(), 'proof', 'proof', 'proof', 'proof', clock_timestamp()
  );
`,
);
await reject(
  CONTROL_PLANE_PORT,
  `
  insert into platform.data_plane_locators (
    tenant_id, deployment_ownership, provider_type, environment,
    provider_project_ref, application_route_ref, secret_reference_id,
    lifecycle_status, effective_at, created_by_actor_ref,
    created_from_request_id
  ) values (
    ${sqlLiteral(TENANT_ID)}, 'ENVAL_MANAGED_DEDICATED', 'supabase', 'local',
    'other-project', 'http://127.0.0.1:1', gen_random_uuid(), 'active',
    clock_timestamp(), 'proof', 'proof'
  );
`,
);
await reject(
  CONTROL_PLANE_PORT,
  `
  set local role anon;
  insert into platform.tenants (
    lifecycle_status, created_by_actor_ref, created_from_request_id
  ) values ('active', 'browser', 'browser');
`,
);
await reject(
  CONTROL_PLANE_PORT,
  `
  set local role authenticated;
  select * from platform.tenants;
`,
);
await reject(
  CONTROL_PLANE_PORT,
  `
  update platform.action_audit_events set result = 'failed'
  where id = ${sqlLiteral(AUDIT_ID)};
`,
);
await reject(
  CONTROL_PLANE_PORT,
  `
  delete from platform.action_audit_events where id = ${sqlLiteral(AUDIT_ID)};
`,
);
await reject(CONTROL_PLANE_PORT, "truncate platform.action_audit_events;");
await reject(
  CONTROL_PLANE_PORT,
  `
  update platform.tenants set id = gen_random_uuid()
  where id = ${sqlLiteral(TENANT_ID)};
`,
);

const managed = new PlatformControlPlaneV1Adapter(databaseReader());
const managedResult = await resolveTenantRuntimeContext(managed, {
  trustedRoutingKey: "ENVAL.LOCALHOST.",
  environment: "local",
});
assert(managedResult.ok, "managed_resolver_did_not_resolve_tenant_one");
assert(
  managedResult.value.tenantId === TENANT_ID &&
    managedResult.value.dataPlane.locatorId === LOCATOR_ID &&
    managedResult.value.dataPlane.secretReferenceId === SECRET_REFERENCE_ID,
  "managed_resolver_context_incorrect",
);
assert(
  !/(password|service.?role|database.?url|token|credential)/i.test(
    JSON.stringify(managedResult.value),
  ),
  "managed_resolver_exposed_credential_material",
);

const unknown = await resolveTenantRuntimeContext(managed, {
  trustedRoutingKey: "unknown.localhost",
  environment: "local",
});
assert(
  !unknown.ok && unknown.code === "unknown_routing_identity",
  "unknown_host_not_closed",
);
const environmentMismatch = await resolveTenantRuntimeContext(managed, {
  trustedRoutingKey: TRUSTED_LOCAL_HOST,
  environment: "production",
});
assert(
  !environmentMismatch.ok &&
    environmentMismatch.code === "environment_mismatch",
  "environment_mismatch_not_closed",
);

const routingBase: PlatformRoutingRecord = {
  routingIdentityId: ROUTING_ID,
  routingLifecycleStatus: "active",
  tenantId: TENANT_ID,
  tenantLifecycleStatus: "active",
};
const locatorBase: PlatformDataPlaneLocatorRecord = {
  locatorId: LOCATOR_ID,
  tenantId: TENANT_ID,
  lifecycleStatus: "active",
  deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
  environment: "local",
  providerType: "supabase",
  dataPlaneReference: "enval",
  applicationRouteReference: "http://127.0.0.1:54321",
  secretReferenceId: SECRET_REFERENCE_ID,
};

async function adapterResult(
  routes: PlatformRoutingRecord[],
  locators: PlatformDataPlaneLocatorRecord[],
) {
  const adapter = new PlatformControlPlaneV1Adapter({
    async findRoutingIdentities() {
      return routes;
    },
    async findDataPlaneLocators() {
      return locators;
    },
  });
  return await resolveTenantRuntimeContext(adapter, {
    trustedRoutingKey: TRUSTED_LOCAL_HOST,
    environment: "local",
  });
}

const ambiguous = await adapterResult([routingBase, { ...routingBase }], [
  locatorBase,
]);
assert(
  !ambiguous.ok && ambiguous.code === "ambiguous_routing_identity",
  "ambiguous_routing_not_closed",
);
const inactiveTenant = await adapterResult([
  { ...routingBase, tenantLifecycleStatus: "suspended" },
], [locatorBase]);
assert(
  !inactiveTenant.ok && inactiveTenant.code === "inactive_tenant",
  "inactive_tenant_not_closed",
);
const missingLocator = await adapterResult([routingBase], []);
assert(
  !missingLocator.ok && missingLocator.code === "no_active_data_plane_locator",
  "missing_locator_not_closed",
);
const multipleLocators = await adapterResult([routingBase], [locatorBase, {
  ...locatorBase,
}]);
assert(
  !multipleLocators.ok &&
    multipleLocators.code === "multiple_active_data_plane_locators",
  "multiple_locators_not_closed",
);
const malformedLocator = await adapterResult([routingBase], [
  { ...locatorBase, secretReferenceId: "raw-secret-value" },
]);
assert(
  !malformedLocator.ok &&
    malformedLocator.code === "malformed_data_plane_locator",
  "malformed_locator_not_closed",
);

const standaloneCompatible: TenantResolutionAdapter = {
  async resolveTenant() {
    return { ok: true, value: { tenantId: TENANT_ID } };
  },
  async locateDataPlane() {
    return {
      ok: true,
      value: {
        locatorId: LOCATOR_ID,
        deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
        environment: "local",
        providerType: "supabase",
        dataPlaneReference: "enval",
        applicationRouteReference: "http://127.0.0.1:54321",
        secretReferenceId: SECRET_REFERENCE_ID,
      },
    };
  },
};
const standaloneResult = await resolveTenantRuntimeContext(
  standaloneCompatible,
  {
    trustedRoutingKey: "fixed-local-deployment",
    environment: "local",
  },
);
assert(
  standaloneResult.ok &&
    Object.keys(standaloneResult.value).sort().join("|") ===
      Object.keys(managedResult.value).sort().join("|"),
  "standalone_contract_not_provider_neutral",
);
const coreSource = Deno.readTextFileSync(
  new URL(
    "../../platform/runtime/tenant-resolution/tenant_resolution.ts",
    import.meta.url,
  ),
);
assert(
  !/platform_control_plane|PlatformControlPlane|supabase|fetch\s*\(/i.test(
    coreSource,
  ),
  "provider_neutral_core_has_managed_dependency",
);

const rootAfter = await tenantEnvalFingerprint();
assert(rootAfter === rootBefore, "tenant_enval_database_changed");

console.log("CONTROL_PLANE_FOUNDATION_Q01_Q18=PASS");
