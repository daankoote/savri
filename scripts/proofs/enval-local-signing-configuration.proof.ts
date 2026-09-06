import {
  assertLocalSigningConfigurationTarget,
  buildLocalSigningBootstrapSql,
  buildLocalSigningConfigurationGraph,
  LOCAL_SIGNING_CONFIGURATION_WRITE_TABLES,
} from "../tools/enval-local-signing-configuration.ts";
import { enforceAppTenantResolutionGate } from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";
import { resolveSigningLegalDocumentBundle } from "../../supabase/functions/_shared/signing_legal_runtime.ts";

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
const evaluationTime = "2026-09-06T12:00:00.000Z";
const legalEnvironment = Object.freeze({
  supabaseUrl: localEnvironment.SUPABASE_URL,
  evaluationTime,
  localActivationEffectiveFrom: first.manifest.effectiveFrom,
});
const resolvedDocuments = await resolveSigningLegalDocumentBundle(
  first.legal.content.documents,
  legalEnvironment,
);
assert(
  resolvedDocuments?.length === 4 &&
    resolvedDocuments.every((document) =>
      document.effectiveFrom === first.manifest.effectiveFrom &&
      document.canonicalContent.length > 0 &&
      /^[0-9a-f]{64}$/.test(document.contentSha256)
    ),
  "local_legal_document_delivery_invalid",
);
for (
  const bindings of [
    first.legal.content.documents.slice(0, 3),
    first.legal.content.documents.map((document, index) =>
      index === 0 ? { ...document, version: "" } : document
    ),
    first.legal.content.documents.map((document, index) =>
      index === 0 ? { ...document, documentReference: "" } : document
    ),
    first.legal.content.documents.map((document, index) =>
      index === 0 ? { ...document, contentSha256: "0".repeat(64) } : document
    ),
  ]
) {
  assert(
    await resolveSigningLegalDocumentBundle(bindings, legalEnvironment) ===
      null,
    "invalid_legal_document_delivery_not_closed",
  );
}
assert(
  await resolveSigningLegalDocumentBundle(
    first.legal.content.documents,
    {
      ...legalEnvironment,
      localActivationEffectiveFrom: "2026-09-07T00:00:00.000Z",
    },
  ) === null,
  "inactive_legal_revision_not_closed",
);
assert(
  await resolveSigningLegalDocumentBundle(
    first.legal.content.documents,
    {
      ...legalEnvironment,
      supabaseUrl: "https://example.supabase.co",
    },
  ) === null,
  "remote_local_activation_not_closed",
);
const rejectedTenantContext = await enforceAppTenantResolutionGate(
  "local",
  "local-signing-negative-tenant",
  {
    authorityMode: "AUTHORITATIVE",
    sink: null,
    serverEnvironment: {
      get: (name: string) =>
        name === "ENVAL_TENANT_REFERENCE" ? "wrong-tenant" : "",
    },
  },
);
assert(!rejectedTenantContext.ok, "wrong_tenant_not_closed");

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
assert(
  /local signing configuration invalidated/.test(sql) &&
    /local signing configuration conflict (legal_material|material_revisions)/
      .test(sql),
  "invalidated_or_incomplete_material_not_closed",
);

console.log("LOCAL_SIGNING_CONFIGURATION_PROOF=PASS");
console.log("LOCAL_SIGNING_REMOTE_TARGET_DENY=PASS");
console.log("LOCAL_SIGNING_WRITE_ALLOWLIST=PASS");
console.log("LOCAL_SIGNING_IDEMPOTENCE_CONTRACT=PASS");
console.log("LOCAL_SIGNING_LEGAL_DOCUMENT_DELIVERY=PASS");
console.log("LOCAL_SIGNING_READINESS_NEGATIVE_CASES=PASS");
