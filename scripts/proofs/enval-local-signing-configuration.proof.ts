import {
  assertLocalSigningConfigurationTarget,
  buildLocalSigningBootstrapSql,
  buildLocalSigningConfigurationGraph,
  LOCAL_SIGNING_CONFIGURATION_WRITE_TABLES,
} from "../tools/enval-local-signing-configuration.ts";

const TENANT_ID = "c1000000-0000-4000-8000-000000000001";

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const localEnvironment = Object.freeze({
  ENVIRONMENT: "local",
  SUPABASE_URL: "http://127.0.0.1:54321",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ENVAL_TENANT_REFERENCE: TENANT_ID,
});
assertLocalSigningConfigurationTarget(localEnvironment);
for (
  const environment of [
    { ...localEnvironment, ENVIRONMENT: "production" },
    { ...localEnvironment, SUPABASE_URL: "https://example.supabase.co" },
    {
      ...localEnvironment,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54323/postgres",
    },
  ]
) {
  let denied = false;
  try {
    assertLocalSigningConfigurationTarget(environment);
  } catch {
    denied = true;
  }
  assert(denied, "remote_or_noncanonical_target_not_denied");
}

const first = await buildLocalSigningConfigurationGraph(TENANT_ID);
const second = await buildLocalSigningConfigurationGraph(TENANT_ID);
assert(
  JSON.stringify(first) === JSON.stringify(second),
  "local_configuration_not_deterministic",
);
assert(
  Object.keys(first.componentRevisions).length === 4 &&
    first.legal.content.documents.length === 4,
  "local_configuration_incomplete",
);

const sql = buildLocalSigningBootstrapSql(first);
const insertedTables = new Set(
  Array.from(
    sql.matchAll(/insert into\s+(public\.[a-z0-9_]+)/gi),
    (match) => match[1],
  ),
);
const expectedWrites = new Set([
  "public.app_tenant_configuration_component_revisions",
  "public.app_tenant_configuration_manifests",
  "public.app_tenant_signing_fee_material",
  "public.app_tenant_signing_legal_material",
  "public.app_tenant_signing_material_revisions",
  "public.app_tenant_signing_operational_material",
]);
assert(
  insertedTables.size === LOCAL_SIGNING_CONFIGURATION_WRITE_TABLES.length &&
    LOCAL_SIGNING_CONFIGURATION_WRITE_TABLES.every((table) =>
      insertedTables.has(table)
    ),
  "write_outside_allowlist",
);
assert(
  insertedTables.size === expectedWrites.size &&
    [...expectedWrites].every((table) => insertedTables.has(table)),
  "write_inventory_incomplete",
);
assert(
  !/\b(update|delete from|truncate)\b/i.test(sql) &&
    !/auth\.|app_signup_|storage\./i.test(sql),
  "forbidden_mutation_present",
);
assert(
  /pg_advisory_xact_lock/.test(sql) &&
    /local signing configuration conflict/.test(sql) &&
    /where \(\(tenant_id=.*? or id=.*?\) and not \(/s.test(sql) &&
    (sql.match(/where not exists/gi)?.length ?? 0) === 6,
  "idempotent_conflict_guard_missing",
);

console.log("LOCAL_SIGNING_CONFIGURATION_PROOF=PASS");
console.log("LOCAL_SIGNING_REMOTE_TARGET_DENY=PASS");
console.log("LOCAL_SIGNING_WRITE_ALLOWLIST=PASS");
console.log("LOCAL_SIGNING_IDEMPOTENCE_CONTRACT=PASS");
