import {
  TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION,
  type TenantConfigurationClockPort,
  tenantConfigurationManifestCanonicalSha256,
  type TenantConfigurationManifestHashInputV1,
} from "../../supabase/functions/_shared/app_tenant_configuration.ts";
import {
  DataPlaneTenantConfigurationV1Adapter,
  type TenantConfigurationDataPlaneClient,
} from "../../supabase/functions/_shared/app_tenant_configuration_data_plane_v1.ts";
import {
  type AppTenantExecutionContext,
  type AppTenantResolutionShadowExecution,
  enforceAppTenantResolutionGate,
} from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const COMPONENT_TABLE = "app_tenant_configuration_component_revisions";
const MANIFEST_TABLE = "app_tenant_configuration_manifests";
const TENANT_ID = "91000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "91000000-0000-4000-8000-000000000002";
const LOCATOR_ID = "91000000-0000-4000-8000-000000000010";
const APPROVED_AT = "2026-01-01T00:00:00.000Z";
const EFFECTIVE_FROM = "2026-01-02T00:00:00.000Z";
const EVALUATED_AT = "2026-02-01T00:00:00.000Z";
const ACTOR = "tf02c-proof";
const COMPONENT_IDS = Object.freeze({
  operational: "92000000-0000-4000-8000-000000000001",
  legal: "92000000-0000-4000-8000-000000000002",
  feeCommercial: "92000000-0000-4000-8000-000000000003",
  providerIntegration: "92000000-0000-4000-8000-000000000004",
});
const MANIFEST_ID = "93000000-0000-4000-8000-000000000001";

type CommandResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;
type QueryResult = Readonly<{ data: unknown; error: unknown }>;

class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}

function q(number: number): void {
  console.log(`Q${String(number).padStart(2, "0")}=PASS`);
}

function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 260);
}

async function command(
  name: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  const child = new Deno.Command(name, {
    args,
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
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

async function psqlResult(sql: string): Promise<CommandResult> {
  return await command(
    "psql",
    [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    sql,
  );
}

async function psql(sql: string): Promise<string> {
  const result = await psqlResult(sql);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}

async function rejects(sql: string): Promise<boolean> {
  return (await psqlResult(`begin;\n${sql}\nrollback;`)).code !== 0;
}

function componentRowsSql(
  tenantId = TENANT_ID,
  environment = "local",
): string {
  return `
    insert into public.${COMPONENT_TABLE}(
      id, tenant_id, environment, component_kind, revision_id,
      content_sha256, approval_status, approved_at, approved_by_actor_ref
    ) values
      ('${COMPONENT_IDS.operational}', '${tenantId}', '${environment}',
       'operational', 'operational-proof-v1', '${"a".repeat(64)}',
       'APPROVED', '${APPROVED_AT}', '${ACTOR}'),
      ('${COMPONENT_IDS.legal}', '${tenantId}', '${environment}',
       'legal', 'legal-proof-v1', '${"b".repeat(64)}',
       'APPROVED', '${APPROVED_AT}', '${ACTOR}'),
      ('${COMPONENT_IDS.feeCommercial}', '${tenantId}', '${environment}',
       'fee_commercial', 'fee-proof-v1', '${"c".repeat(64)}',
       'APPROVED', '${APPROVED_AT}', '${ACTOR}'),
      ('${COMPONENT_IDS.providerIntegration}', '${tenantId}', '${environment}',
       'provider_integration', 'provider-proof-v1', '${"d".repeat(64)}',
       'APPROVED', '${APPROVED_AT}', '${ACTOR}');
  `;
}

function manifestRowSql(
  canonicalSha256: string,
  overrides: Readonly<{
    tenantId?: string;
    environment?: string;
    operationalId?: string;
    legalId?: string;
    effectiveUntil?: string;
    id?: string;
    revisionId?: string;
    supersedesId?: string;
  }> = {},
): string {
  return `
    insert into public.${MANIFEST_TABLE}(
      id, schema_version, manifest_revision_id, tenant_id, environment,
      operational_component_revision_id, legal_component_revision_id,
      fee_commercial_component_revision_id,
      provider_integration_component_revision_id, approval_status,
      approved_at, approved_by_actor_ref, effective_from, effective_until,
      supersedes_manifest_id, canonical_sha256
    ) values (
      '${overrides.id ?? MANIFEST_ID}',
      '${TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION}',
      '${overrides.revisionId ?? "manifest-proof-v1"}',
      '${overrides.tenantId ?? TENANT_ID}', '${
    overrides.environment ?? "local"
  }',
      '${overrides.operationalId ?? COMPONENT_IDS.operational}',
      '${overrides.legalId ?? COMPONENT_IDS.legal}',
      '${COMPONENT_IDS.feeCommercial}', '${COMPONENT_IDS.providerIntegration}',
      'APPROVED', '${APPROVED_AT}', '${ACTOR}', '${EFFECTIVE_FROM}',
      ${overrides.effectiveUntil ? `'${overrides.effectiveUntil}'` : "null"},
      ${overrides.supersedesId ? `'${overrides.supersedesId}'` : "null"},
      '${canonicalSha256}'
    );
  `;
}

function staticExecution(
  tenantId: string,
  environment: string,
): AppTenantResolutionShadowExecution {
  const routingKey = `${environment}.tf02c.localhost`;
  return Object.freeze({
    current: Object.freeze({
      tenantId,
      environment,
      locatorId: LOCATOR_ID,
      deploymentOwnership: "ENVAL_MANAGED_DEDICATED" as const,
      providerType: "supabase",
      dataPlaneReference: "tf02c-plane",
    }),
    trustedRoutingContext: Object.freeze({
      trustedRoutingKey: routingKey,
      environment,
      provenance: "DEPLOYMENT_FIXED" as const,
    }),
    composition: Object.freeze({
      deploymentMode: "static_single_tenant_v1" as const,
      staticSingleTenantConfigurations: Object.freeze([Object.freeze({
        trustedRoutingKey: routingKey,
        tenantId,
        dataPlane: Object.freeze({
          locatorId: LOCATOR_ID,
          deploymentOwnership: "ENVAL_MANAGED_DEDICATED" as const,
          environment,
          providerType: "supabase",
          dataPlaneReference: "tf02c-plane",
          applicationRouteReference: "http://127.0.0.1:54321",
          secretReferenceId: "94000000-0000-4000-8000-000000000001",
        }),
      })]),
    }),
  });
}

async function boundContext(
  tenantId = TENANT_ID,
  environment = "local",
): Promise<AppTenantExecutionContext> {
  const result = await enforceAppTenantResolutionGate(
    environment,
    "tf02c-proof",
    {
      authorityMode: "AUTHORITATIVE",
      execution: staticExecution(tenantId, environment),
    },
  );
  assert(result.ok, "tf01_bound_context_unavailable");
  return result.executionContext;
}

function fixedClock(value: string): TenantConfigurationClockPort {
  return Object.freeze({ now: () => new Date(value) });
}

class FixedRowsQuery implements PromiseLike<QueryResult> {
  readonly #rows: readonly Record<string, unknown>[];
  readonly #error: unknown;
  readonly #filters = new Map<string, string>();
  #maximum = Number.MAX_SAFE_INTEGER;

  constructor(rows: readonly Record<string, unknown>[], error: unknown = null) {
    this.#rows = rows;
    this.#error = error;
  }

  eq(column: string, value: string): FixedRowsQuery {
    this.#filters.set(column, value);
    return this;
  }

  limit(count: number): FixedRowsQuery {
    this.#maximum = count;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.#rows.filter((row) =>
      [...this.#filters].every(([column, value]) => row[column] === value)
    ).slice(0, this.#maximum);
    return Promise.resolve({ data, error: this.#error }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FixedRowsClient implements TenantConfigurationDataPlaneClient {
  reads = 0;
  readonly #manifests: readonly Record<string, unknown>[];
  readonly #components: readonly Record<string, unknown>[];
  readonly #error: unknown;

  constructor(
    manifests: readonly Record<string, unknown>[],
    components: readonly Record<string, unknown>[],
    error: unknown = null,
  ) {
    this.#manifests = manifests;
    this.#components = components;
    this.#error = error;
  }

  from(table: string) {
    this.reads += 1;
    const rows = table === MANIFEST_TABLE
      ? this.#manifests
      : table === COMPONENT_TABLE
      ? this.#components
      : [];
    return Object.freeze({
      select: (_columns: string) => new FixedRowsQuery(rows, this.#error),
    });
  }
}

const manifestInput: TenantConfigurationManifestHashInputV1 = Object.freeze({
  schemaVersion: TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION,
  manifestRevisionId: "manifest-proof-v1",
  tenantId: TENANT_ID,
  environment: "local",
  components: Object.freeze({
    operational: Object.freeze({
      componentKind: "operational" as const,
      revisionId: "operational-proof-v1",
      contentSha256: "a".repeat(64),
    }),
    legal: Object.freeze({
      componentKind: "legal" as const,
      revisionId: "legal-proof-v1",
      contentSha256: "b".repeat(64),
    }),
    feeCommercial: Object.freeze({
      componentKind: "fee_commercial" as const,
      revisionId: "fee-proof-v1",
      contentSha256: "c".repeat(64),
    }),
    providerIntegration: Object.freeze({
      componentKind: "provider_integration" as const,
      revisionId: "provider-proof-v1",
      contentSha256: "d".repeat(64),
    }),
  }),
  approvalStatus: "APPROVED",
  approvedAt: APPROVED_AT,
  approvedByActorRef: ACTOR,
  effectiveFrom: EFFECTIVE_FROM,
});
const manifestHash = await tenantConfigurationManifestCanonicalSha256(
  manifestInput,
);

assert(
  await psql(`
    select count(*) from pg_tables
    where schemaname = 'public'
      and tablename in ('${COMPONENT_TABLE}', '${MANIFEST_TABLE}');
  `) === "2",
  "Q01_tables_missing",
);
q(1);

assert(
  await psql(`
    select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname in ('${COMPONENT_TABLE}', '${MANIFEST_TABLE}');
  `) === "2",
  "Q02_rls_missing",
);
q(2);

assert(
  await psql(`
    select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('${COMPONENT_TABLE}', '${MANIFEST_TABLE}')
      and grantee in ('anon', 'authenticated');
  `) === "0",
  "Q03_client_privilege_present",
);
q(3);

assert(
  await psql(`
    select count(*) from (
      select table_name, string_agg(privilege_type, ',' order by privilege_type) p
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('${COMPONENT_TABLE}', '${MANIFEST_TABLE}')
        and grantee = 'service_role'
      group by table_name
    ) grants where p = 'INSERT,SELECT';
  `) === "2",
  "Q04_service_role_privilege_set_invalid",
);
q(4);

assert(
  await psql(`
    select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('${COMPONENT_TABLE}', '${MANIFEST_TABLE}')
      and grantee = 'service_role'
      and privilege_type in ('UPDATE', 'DELETE');
  `) === "0",
  "Q05_mutable_service_role_privilege_present",
);
q(5);

assert(
  await rejects(`
    insert into public.${COMPONENT_TABLE}(
      tenant_id, environment, component_kind, revision_id, content_sha256,
      approval_status, approved_at, approved_by_actor_ref
    ) values ('${TENANT_ID}', 'local', 'unknown', 'invalid-kind-v1',
      '${"a".repeat(64)}', 'APPROVED', '${APPROVED_AT}', '${ACTOR}');
  `),
  "Q06_invalid_kind_accepted",
);
q(6);

assert(
  await rejects(`
    insert into public.${COMPONENT_TABLE}(
      tenant_id, environment, component_kind, revision_id, content_sha256,
      approval_status, approved_at, approved_by_actor_ref
    ) values ('${TENANT_ID}', 'local', 'legal', 'invalid-sha-v1', 'ABC',
      'APPROVED', '${APPROVED_AT}', '${ACTOR}');
  `),
  "Q07_invalid_sha_accepted",
);
q(7);

assert(
  await rejects(`
    insert into public.${COMPONENT_TABLE}(
      tenant_id, environment, component_kind, revision_id, content_sha256,
      approval_status, approved_at, approved_by_actor_ref
    ) values ('${TENANT_ID}', 'local', 'legal', ' ', '${"a".repeat(64)}',
      'APPROVED', '${APPROVED_AT}', '${ACTOR}');
  `) &&
    await rejects(`
      insert into public.${COMPONENT_TABLE}(
        tenant_id, environment, component_kind, revision_id, content_sha256,
        approval_status, approved_at, approved_by_actor_ref
      ) values ('${TENANT_ID}', 'local', 'legal', 'invalid-actor-v1',
        '${"a".repeat(64)}', 'APPROVED', '${APPROVED_AT}', ' ');
    `),
  "Q08_invalid_revision_or_actor_accepted",
);
q(8);

assert(
  await rejects(`
    ${componentRowsSql()}
    ${manifestRowSql(manifestHash, { effectiveUntil: EFFECTIVE_FROM })}
  `),
  "Q09_invalid_effective_window_accepted",
);
q(9);

assert(
  await rejects(`${componentRowsSql()} update public.${COMPONENT_TABLE}
    set approved_by_actor_ref = 'changed' where id = '${COMPONENT_IDS.legal}';`),
  "Q10_component_update_accepted",
);
q(10);

assert(
  await rejects(`${componentRowsSql()} delete from public.${COMPONENT_TABLE}
    where id = '${COMPONENT_IDS.legal}';`),
  "Q11_component_delete_accepted",
);
q(11);

assert(
  await rejects(`${componentRowsSql()} ${manifestRowSql(manifestHash)}
    update public.${MANIFEST_TABLE} set approved_by_actor_ref = 'changed'
    where id = '${MANIFEST_ID}';`),
  "Q12_manifest_update_accepted",
);
q(12);

assert(
  await rejects(`${componentRowsSql()} ${manifestRowSql(manifestHash)}
    delete from public.${MANIFEST_TABLE} where id = '${MANIFEST_ID}';`),
  "Q13_manifest_delete_accepted",
);
q(13);

assert(
  await rejects(`
    insert into public.${COMPONENT_TABLE}(
      id, tenant_id, environment, component_kind, revision_id, content_sha256,
      approval_status, approved_at, approved_by_actor_ref,
      supersedes_component_revision_id
    ) values ('${COMPONENT_IDS.legal}', '${TENANT_ID}', 'local', 'legal',
      'self-v1', '${"a".repeat(64)}', 'APPROVED', '${APPROVED_AT}', '${ACTOR}',
      '${COMPONENT_IDS.legal}');
  `) &&
    await rejects(`
      insert into public.${COMPONENT_TABLE}(
        id, tenant_id, environment, component_kind, revision_id,
        content_sha256, approval_status, approved_at, approved_by_actor_ref
      ) values ('${COMPONENT_IDS.legal}', '${TENANT_ID}', 'local', 'legal',
        'prior-v1', '${
      "a".repeat(64)
    }', 'APPROVED', '${APPROVED_AT}', '${ACTOR}');
      insert into public.${COMPONENT_TABLE}(
        tenant_id, environment, component_kind, revision_id, content_sha256,
        approval_status, approved_at, approved_by_actor_ref,
        supersedes_component_revision_id
      ) values ('${OTHER_TENANT_ID}', 'local', 'legal', 'next-v1',
        '${"b".repeat(64)}', 'APPROVED', '${APPROVED_AT}', '${ACTOR}',
        '${COMPONENT_IDS.legal}');
    `) &&
    await rejects(`
      insert into public.${COMPONENT_TABLE}(
        id, tenant_id, environment, component_kind, revision_id,
        content_sha256, approval_status, approved_at, approved_by_actor_ref
      ) values ('${COMPONENT_IDS.legal}', '${TENANT_ID}', 'local', 'legal',
        'prior-v1', '${
      "a".repeat(64)
    }', 'APPROVED', '${APPROVED_AT}', '${ACTOR}');
      insert into public.${COMPONENT_TABLE}(
        tenant_id, environment, component_kind, revision_id, content_sha256,
        approval_status, approved_at, approved_by_actor_ref,
        supersedes_component_revision_id
      ) values ('${TENANT_ID}', 'local', 'operational', 'next-v1',
        '${"b".repeat(64)}', 'APPROVED', '${APPROVED_AT}', '${ACTOR}',
        '${COMPONENT_IDS.legal}');
    `),
  "Q14_component_supersession_integrity_failed",
);
q(14);

assert(
  await rejects(`
    ${componentRowsSql()}
    ${manifestRowSql(manifestHash, { supersedesId: MANIFEST_ID })}
  `) &&
    await rejects(`
      ${componentRowsSql()}
      ${manifestRowSql(manifestHash)}
      insert into public.${MANIFEST_TABLE}(
        id, schema_version, manifest_revision_id, tenant_id, environment,
        operational_component_revision_id, legal_component_revision_id,
        fee_commercial_component_revision_id,
        provider_integration_component_revision_id, approval_status,
        approved_at, approved_by_actor_ref, effective_from,
        supersedes_manifest_id, canonical_sha256
      ) values (
        '93000000-0000-4000-8000-000000000002',
        '${TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION}', 'manifest-other-v1',
        '${OTHER_TENANT_ID}', 'local', '${COMPONENT_IDS.operational}',
        '${COMPONENT_IDS.legal}', '${COMPONENT_IDS.feeCommercial}',
        '${COMPONENT_IDS.providerIntegration}', 'APPROVED', '${APPROVED_AT}',
        '${ACTOR}', '${EFFECTIVE_FROM}', '${MANIFEST_ID}', '${manifestHash}'
      );
    `),
  "Q15_manifest_supersession_integrity_failed",
);
q(15);

assert(
  await rejects(`
    ${componentRowsSql()}
    ${manifestRowSql(manifestHash, { tenantId: OTHER_TENANT_ID })}
  `),
  "Q16_wrong_tenant_component_reference_accepted",
);
q(16);

assert(
  await rejects(`
    ${componentRowsSql()}
    ${manifestRowSql(manifestHash, { environment: "staging" })}
  `),
  "Q17_wrong_environment_component_reference_accepted",
);
q(17);

assert(
  await rejects(`
    ${componentRowsSql()}
    ${
    manifestRowSql(manifestHash, {
      operationalId: COMPONENT_IDS.legal,
      legalId: COMPONENT_IDS.operational,
    })
  }
  `),
  "Q18_wrong_kind_component_reference_accepted",
);
q(18);

assert(
  await psql(`
    select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name in ('${COMPONENT_TABLE}', '${MANIFEST_TABLE}')
      and data_type in ('json', 'jsonb');
  `) === "0",
  "Q19_generic_json_payload_present",
);
q(19);

assert(
  await psql(`
    select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name in ('${COMPONENT_TABLE}', '${MANIFEST_TABLE}')
      and column_name ~* '(secret|credential|password|token|api_key|private_key)';
  `) === "0",
  "Q20_secret_column_present",
);
q(20);

const persistedJson = await psql(`
  begin;
  ${componentRowsSql()}
  ${manifestRowSql(manifestHash)}
  select jsonb_build_object(
    'components', (select jsonb_agg(to_jsonb(component) order by component.id)
      from public.${COMPONENT_TABLE} component where tenant_id = '${TENANT_ID}'),
    'manifests', (select jsonb_agg(to_jsonb(manifest) order by manifest.id)
      from public.${MANIFEST_TABLE} manifest where tenant_id = '${TENANT_ID}')
  );
  rollback;
`);
const persisted = JSON.parse(persistedJson) as {
  components: Record<string, unknown>[];
  manifests: Record<string, unknown>[];
};
const context = await boundContext();
const validClient = new FixedRowsClient(
  persisted.manifests,
  persisted.components,
);
const validResult = await new DataPlaneTenantConfigurationV1Adapter(
  validClient,
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
assert(
  validResult.ok &&
    validResult.value.manifest.manifestRevisionId === "manifest-proof-v1" &&
    validResult.value.componentRevisions.legal.revisionId === "legal-proof-v1",
  "Q21_persisted_source_not_resolved",
);
q(21);

const tenantMismatch = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(persisted.manifests, persisted.components),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(await boundContext(OTHER_TENANT_ID));
assert(!tenantMismatch.ok, "Q22_tenant_mismatch_selected");
q(22);

const environmentMismatch = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(persisted.manifests, persisted.components),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(await boundContext(TENANT_ID, "staging"));
assert(!environmentMismatch.ok, "Q23_environment_mismatch_selected");
q(23);

const corruptedComponents = persisted.components.map((row) =>
  row.component_kind === "legal"
    ? { ...row, content_sha256: "e".repeat(64) }
    : row
);
const corrupted = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(persisted.manifests, corruptedComponents),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
const corruptedManifest = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(
    [{ ...persisted.manifests[0], canonical_sha256: "f".repeat(64) }],
    persisted.components,
  ),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
assert(
  !corrupted.ok && corrupted.code === "manifest_hash_mismatch" &&
    !corruptedManifest.ok &&
    corruptedManifest.code === "manifest_hash_mismatch",
  "Q24_hash_corruption_not_rejected_by_tf02b",
);
q(24);

const unapprovedComponents = persisted.components.map((row) =>
  row.component_kind === "legal" ? { ...row, approval_status: "PENDING" } : row
);
const unapproved = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(persisted.manifests, unapprovedComponents),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
assert(
  !unapproved.ok && unapproved.code === "component_revision_invalid",
  "Q25_unapproved_source_selected",
);
q(25);

const missing = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient([], persisted.components),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
assert(
  !missing.ok && missing.code === "tenant_configuration_missing",
  "Q26_zero_manifest_not_closed",
);
q(26);

const secondInput = Object.freeze({
  ...manifestInput,
  manifestRevisionId: "manifest-proof-v2",
});
const secondHash = await tenantConfigurationManifestCanonicalSha256(
  secondInput,
);
const secondManifest = {
  ...persisted.manifests[0],
  id: "93000000-0000-4000-8000-000000000002",
  manifest_revision_id: "manifest-proof-v2",
  canonical_sha256: secondHash,
};
const ambiguous = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(
    [...persisted.manifests, secondManifest],
    persisted.components,
  ),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
assert(
  !ambiguous.ok && ambiguous.code === "tenant_configuration_ambiguous",
  "Q27_overlap_not_ambiguous",
);
q(27);

const future = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(persisted.manifests, persisted.components),
  fixedClock("2025-12-01T00:00:00.000Z"),
).resolveForExecutionContext(context);
const expiredInput = Object.freeze({
  ...manifestInput,
  effectiveUntil: "2026-01-15T00:00:00.000Z",
});
const expiredHash = await tenantConfigurationManifestCanonicalSha256(
  expiredInput,
);
const expiredManifest = {
  ...persisted.manifests[0],
  effective_until: "2026-01-15T00:00:00+00:00",
  canonical_sha256: expiredHash,
};
const expired = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient([expiredManifest], persisted.components),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
assert(
  !future.ok && future.code === "tenant_configuration_missing" &&
    !expired.ok && expired.code === "tenant_configuration_missing",
  "Q28_server_clock_window_authority_failed",
);
q(28);

const unavailable = await new DataPlaneTenantConfigurationV1Adapter(
  new FixedRowsClient(persisted.manifests, persisted.components, {
    message: "private_database_error",
  }),
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(context);
assert(
  !unavailable.ok &&
    unavailable.code === "tenant_configuration_source_unavailable",
  "Q29_database_failure_not_closed",
);
q(29);

const adapterSource = await Deno.readTextFile(
  new URL(
    "../../supabase/functions/_shared/app_tenant_configuration_data_plane_v1.ts",
    import.meta.url,
  ),
);
assert(
  !adapterSource.includes("createClient(") &&
    !adapterSource.includes("SUPABASE_URL") &&
    adapterSource.includes("constructor("),
  "Q30_dynamic_client_creation_present",
);
q(30);

const noReadClient = new FixedRowsClient(
  persisted.manifests,
  persisted.components,
);
const unboundContext = Object.freeze({ ...context });
const beforeParity = await new DataPlaneTenantConfigurationV1Adapter(
  noReadClient,
  fixedClock(EVALUATED_AT),
).resolveForExecutionContext(unboundContext);
assert(
  !beforeParity.ok && beforeParity.code === "invalid_execution_context" &&
    noReadClient.reads === 0,
  "Q31_read_occurred_before_tf01_parity",
);
q(31);

assert(
  adapterSource.includes("isBoundAppTenantExecutionContext") &&
    !adapterSource.includes("resolvedDataPlaneReference ===") &&
    !adapterSource.includes("fixedDataPlaneReference ==="),
  "Q32_tf01_parity_not_reused",
);
q(32);

assert(validClient.reads === 2, "Q33_n_plus_one_detected");
q(33);

const consumerSearch = await command("rg", [
  "-l",
  "app_tenant_configuration_data_plane_v1",
  "supabase/functions",
  "platform",
  "app",
]);
assert(
  [0, 1].includes(consumerSearch.code) &&
    consumerSearch.stdout.split("\n").filter(Boolean).every((path) =>
      path.endsWith("app_tenant_configuration_data_plane_v1.ts")
    ),
  "Q34_current_consumer_import_present",
);
q(34);

const staticDiff = await command("git", [
  "diff",
  "--quiet",
  "--",
  "supabase/functions/_shared/app_tenant_configuration_static_single_tenant_v1.ts",
]);
assert(staticDiff.code === 0, "Q35_static_adapter_semantics_changed");
q(35);

const tf02b = await command("deno", [
  "run",
  "--allow-read",
  "scripts/proofs/app-tenant-configuration-manifest.proof.ts",
]);
assert(
  tf02b.code === 0 && tf02b.stdout.includes("Q38=PASS"),
  `Q36_tf02b_regression_failed:${scrub(tf02b.stderr)}`,
);
q(36);

assert(
  await psql(`
    select (select count(*) from public.${COMPONENT_TABLE})::text || '|' ||
      (select count(*) from public.${MANIFEST_TABLE})::text;
  `) === "0|0",
  "synthetic_configuration_rows_remain",
);
console.log("TF02C_PERSISTENCE_READ_PROOF=PASS");
