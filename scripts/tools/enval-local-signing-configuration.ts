import { payloadHash } from "../../supabase/functions/_shared/app_foundation.ts";
import { createSignupSigningPresentationReceiptV2 } from "../../supabase/functions/_shared/app_signup_signing_presentation.ts";
import {
  tenantConfigurationManifestCanonicalSha256,
  type TenantConfigurationManifestHashInputV1,
  validateTenantConfigurationManifestV1,
} from "../../supabase/functions/_shared/app_tenant_configuration.ts";
import { DataPlaneTenantConfigurationV1Adapter } from "../../supabase/functions/_shared/app_tenant_configuration_data_plane_v1.ts";
import {
  createSigningLegalDocumentReferenceV1,
  createTenantFeeSigningMaterialV1,
  createTenantLegalSigningMaterialV1,
  createTenantOperationalSigningMaterialV1,
} from "../../supabase/functions/_shared/app_tenant_signing_material.ts";
import { resolveTenantSigningMaterialBundleV1 } from "../../supabase/functions/_shared/app_tenant_signing_material_data_plane_v1.ts";
import { enforceAppTenantResolutionGate } from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";
import {
  resolveSigningLegalDocumentBundle,
  SIGNING_LEGAL_RUNTIME_DOCUMENTS,
} from "../../supabase/functions/_shared/signing_legal_runtime.ts";
import {
  createReceiptBoundLegalDocuments,
  legalDocumentIsSigningReady,
} from "../../app/src/features/signup/signing/legalDocumentRegistry.ts";

export const LOCAL_SIGNING_CONFIGURATION_WRITE_TABLES = Object.freeze(
  [
    "public.app_tenant_configuration_component_revisions",
    "public.app_tenant_configuration_manifests",
    "public.app_tenant_signing_fee_material",
    "public.app_tenant_signing_legal_material",
    "public.app_tenant_signing_material_revisions",
    "public.app_tenant_signing_operational_material",
  ] as const,
);

const ACTOR = "runtime:canonical-local-signing-bootstrap-v1";
const APPROVED_AT = "2026-09-01T00:00:00.000Z";
const REVISION_PREFIX = "canonical.local.signing.v1";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_TABLES = new Set(
  [
    ...LOCAL_SIGNING_CONFIGURATION_WRITE_TABLES,
    "public.app_tenant_signing_configuration_invalidations",
  ].map((table) => table.replace(/^public\./, "")),
);

type RuntimeEnvironment = Readonly<Record<string, string>>;
type QueryResult = Readonly<{ data: unknown; error: unknown }>;

class LocalSigningConfigurationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function fail(code: string): never {
  throw new LocalSigningConfigurationError(code);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertExactLocalUrl(
  raw: string,
  port: number,
  allowCredentials = false,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail("local_signing_target_invalid");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== String(port) ||
    (!allowCredentials && (url.username || url.password))
  ) fail("local_signing_target_invalid");
  return url;
}

export function assertLocalSigningConfigurationTarget(
  environment: RuntimeEnvironment,
): void {
  if (environment.ENVIRONMENT !== "local") {
    fail("local_signing_remote_target_denied");
  }
  assertExactLocalUrl(environment.SUPABASE_URL ?? "", 54321);
  const database = assertExactLocalUrl(
    (environment.DATABASE_URL ?? "").replace(/^postgresql:/, "http:"),
    54322,
    true,
  );
  if (database.pathname !== "/postgres") {
    fail("local_signing_target_invalid");
  }
  if (!UUID.test(environment.ENVAL_TENANT_REFERENCE ?? "")) {
    fail("local_signing_tenant_invalid");
  }
}

async function deterministicUuid(seed: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${
    hex.slice(16, 20)
  }-${hex.slice(20)}`;
}

export async function buildLocalSigningConfigurationGraph(tenantId: string) {
  if (!UUID.test(tenantId)) fail("local_signing_tenant_invalid");
  const documents = await Promise.all(
    SIGNING_LEGAL_RUNTIME_DOCUMENTS.map((document) =>
      createSigningLegalDocumentReferenceV1({
        canonicalContent: document.canonicalContent,
        documentReference: document.documentReference,
        documentType: document.documentType,
        language: document.language,
        version: document.version,
      })
    ),
  );
  if (documents.some((document) => !document)) {
    fail("local_signing_legal_authority_invalid");
  }
  const legalDocuments = documents.filter((document) => document !== null);
  const feeTerms = legalDocuments.find((document) =>
    document.documentType === "fee_terms"
  );
  if (!feeTerms) fail("local_signing_fee_authority_invalid");

  const operatorReference = "operator:enval-local-runtime-v1";
  const operationalInput = {
    operatorLegalEntityReference: operatorReference,
    operatorIdentitySha256: await payloadHash({
      authority: ACTOR,
      status: "LOCAL_ONLY",
    }),
    roleBindings: Object.freeze({
      regulatedOperatorLegalEntityReference: operatorReference,
      contractingPartyLegalEntityReference: operatorReference,
      controllerLegalEntityReference: operatorReference,
      mandateGranteeLegalEntityReference: operatorReference,
    }),
  };
  const operationalContent = {
    schemaVersion: "tenant-signing-operational-material-v1" as const,
    ...operationalInput,
  };
  const legalContent = {
    schemaVersion: "tenant-signing-legal-material-v1" as const,
    bundleRevision: `${REVISION_PREFIX}.legal.bundle`,
    documents: legalDocuments,
  };
  const feeContent = {
    schemaVersion: "tenant-signing-fee-material-v1" as const,
    governingFeeTerms: feeTerms,
  };
  const hashes = {
    operational: await payloadHash(operationalContent),
    legal: await payloadHash(legalContent),
    fee: await payloadHash(feeContent),
    provider: await payloadHash({
      authority: ACTOR,
      provider: "supabase-local",
      status: "LOCAL_ONLY",
    }),
  };
  const componentRevisions = Object.freeze({
    operational: Object.freeze({
      componentKind: "operational" as const,
      revisionId: `${REVISION_PREFIX}.operational`,
      contentSha256: hashes.operational,
      approvalStatus: "APPROVED" as const,
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
    legal: Object.freeze({
      componentKind: "legal" as const,
      revisionId: `${REVISION_PREFIX}.legal`,
      contentSha256: hashes.legal,
      approvalStatus: "APPROVED" as const,
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
    feeCommercial: Object.freeze({
      componentKind: "fee_commercial" as const,
      revisionId: `${REVISION_PREFIX}.fee`,
      contentSha256: hashes.fee,
      approvalStatus: "APPROVED" as const,
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
    providerIntegration: Object.freeze({
      componentKind: "provider_integration" as const,
      revisionId: `${REVISION_PREFIX}.provider`,
      contentSha256: hashes.provider,
      approvalStatus: "APPROVED" as const,
      approvedAt: APPROVED_AT,
      approvedByActorRef: ACTOR,
    }),
  });
  const manifestInput: TenantConfigurationManifestHashInputV1 = Object.freeze({
    schemaVersion: "tenant-configuration-manifest-v1",
    manifestRevisionId: `${REVISION_PREFIX}.manifest`,
    tenantId,
    environment: "local",
    components: Object.freeze({
      operational: Object.freeze({
        componentKind: componentRevisions.operational.componentKind,
        revisionId: componentRevisions.operational.revisionId,
        contentSha256: componentRevisions.operational.contentSha256,
      }),
      legal: Object.freeze({
        componentKind: componentRevisions.legal.componentKind,
        revisionId: componentRevisions.legal.revisionId,
        contentSha256: componentRevisions.legal.contentSha256,
      }),
      feeCommercial: Object.freeze({
        componentKind: componentRevisions.feeCommercial.componentKind,
        revisionId: componentRevisions.feeCommercial.revisionId,
        contentSha256: componentRevisions.feeCommercial.contentSha256,
      }),
      providerIntegration: Object.freeze({
        componentKind: componentRevisions.providerIntegration.componentKind,
        revisionId: componentRevisions.providerIntegration.revisionId,
        contentSha256: componentRevisions.providerIntegration.contentSha256,
      }),
    }),
    approvalStatus: "APPROVED",
    approvedAt: APPROVED_AT,
    approvedByActorRef: ACTOR,
    effectiveFrom: APPROVED_AT,
  });
  const manifest = await validateTenantConfigurationManifestV1({
    ...manifestInput,
    canonicalSha256: await tenantConfigurationManifestCanonicalSha256(
      manifestInput,
    ),
  });
  if (!manifest.ok) fail("local_signing_manifest_invalid");
  const operational = await createTenantOperationalSigningMaterialV1({
    tenantId,
    environment: "local",
    materialRevisionId: `${REVISION_PREFIX}.operational.material`,
    componentRevision: componentRevisions.operational,
    ...operationalInput,
  });
  const legal = await createTenantLegalSigningMaterialV1({
    tenantId,
    environment: "local",
    materialRevisionId: `${REVISION_PREFIX}.legal.material`,
    componentRevision: componentRevisions.legal,
    bundleRevision: legalContent.bundleRevision,
    documents: legalDocuments,
  });
  const fee = await createTenantFeeSigningMaterialV1({
    tenantId,
    environment: "local",
    materialRevisionId: `${REVISION_PREFIX}.fee.material`,
    componentRevision: componentRevisions.feeCommercial,
    governingFeeTerms: feeTerms,
  });
  if (!operational.ok || !legal.ok || !fee.ok) {
    fail("local_signing_material_invalid");
  }
  const ids = Object.freeze({
    components: Object.freeze({
      operational: await deterministicUuid(`${tenantId}:component:operational`),
      legal: await deterministicUuid(`${tenantId}:component:legal`),
      fee: await deterministicUuid(`${tenantId}:component:fee`),
      provider: await deterministicUuid(`${tenantId}:component:provider`),
    }),
    manifest: await deterministicUuid(`${tenantId}:manifest`),
    materials: Object.freeze({
      operational: await deterministicUuid(`${tenantId}:material:operational`),
      legal: await deterministicUuid(`${tenantId}:material:legal`),
      fee: await deterministicUuid(`${tenantId}:material:fee`),
    }),
  });
  return Object.freeze({
    approvedAt: APPROVED_AT,
    actor: ACTOR,
    tenantId,
    ids,
    componentRevisions,
    manifest: manifest.value,
    operational: operational.value,
    legal: legal.value,
    fee: fee.value,
  });
}

function exactRowGuard(
  table: string,
  selector: string,
  expected: string,
  conflictCode: string,
): string {
  return `if exists (select 1 from ${table} where (${selector}) and not (${expected})) then raise exception 'local signing configuration conflict ${conflictCode}'; end if;`;
}

export function buildLocalSigningBootstrapSql(
  graph: Awaited<ReturnType<typeof buildLocalSigningConfigurationGraph>>,
): string {
  const { ids, tenantId, componentRevisions, manifest } = graph;
  const c = ids.components;
  const m = ids.materials;
  const context = `tenant_id=${quote(tenantId)} and environment='local'`;
  const componentRows = [
    [c.operational, "operational", componentRevisions.operational],
    [c.legal, "legal", componentRevisions.legal],
    [c.fee, "fee_commercial", componentRevisions.feeCommercial],
    [
      c.provider,
      "provider_integration",
      componentRevisions.providerIntegration,
    ],
  ] as const;
  const componentGuards = componentRows.map(([id, kind, revision]) => {
    const value = revision as typeof componentRevisions.operational;
    const expected = `id=${quote(String(id))} and tenant_id=${
      quote(tenantId)
    } and environment='local' and component_kind=${
      quote(String(kind))
    } and revision_id=${quote(value.revisionId)} and content_sha256=${
      quote(value.contentSha256)
    } and approval_status='APPROVED' and approved_at=${
      quote(graph.approvedAt)
    }::timestamptz and approved_by_actor_ref=${
      quote(graph.actor)
    } and supersedes_component_revision_id is null`;
    return exactRowGuard(
      "public.app_tenant_configuration_component_revisions",
      `id=${quote(String(id))}`,
      expected,
      `component_${String(kind)}`,
    );
  }).join("\n  ");
  const materialExpected = [
    [m.operational, "operational", graph.operational, c.operational],
    [m.legal, "legal", graph.legal, c.legal],
    [m.fee, "fee_commercial", graph.fee, c.fee],
  ].map(([id, kind, material, componentId]) => {
    const value = material as typeof graph.operational;
    return `(id=${quote(String(id))} and tenant_id=${
      quote(tenantId)
    } and environment='local' and material_kind=${
      quote(String(kind))
    } and material_revision_id=${
      quote(value.materialRevisionId)
    } and component_revision_id=${
      quote(String(componentId))
    } and canonical_content_sha256=${
      quote(value.canonicalContentSha256)
    } and binding_authority='server_canonical_signing_material_v1')`;
  }).join(" or ");
  const documents = Object.fromEntries(
    graph.legal.content.documents.map((document) => [
      document.documentType,
      document,
    ]),
  );
  const privacy = documents.privacy_notice;
  const service = documents.service_terms;
  const feeTerms = documents.fee_terms;
  const mandate = documents.mandate;
  if (!privacy || !service || !feeTerms || !mandate) {
    fail("local_signing_legal_slots_invalid");
  }
  const manifestExpected = `id=${quote(ids.manifest)} and tenant_id=${
    quote(tenantId)
  } and environment='local' and schema_version='tenant-configuration-manifest-v1' and manifest_revision_id=${
    quote(manifest.manifestRevisionId)
  } and operational_component_revision_id=${
    quote(c.operational)
  } and legal_component_revision_id=${
    quote(c.legal)
  } and fee_commercial_component_revision_id=${
    quote(c.fee)
  } and provider_integration_component_revision_id=${
    quote(c.provider)
  } and approval_status='APPROVED' and approved_at=${
    quote(graph.approvedAt)
  }::timestamptz and approved_by_actor_ref=${
    quote(graph.actor)
  } and effective_from=${
    quote(graph.approvedAt)
  }::timestamptz and effective_until is null and supersedes_manifest_id is null and canonical_sha256=${
    quote(manifest.canonicalSha256)
  }`;
  const operationalExpected = `signing_material_revision_id=${
    quote(m.operational)
  } and operator_legal_entity_reference=${
    quote(graph.operational.content.operatorLegalEntityReference)
  } and operator_identity_sha256=${
    quote(graph.operational.content.operatorIdentitySha256)
  } and regulated_operator_legal_entity_reference=${
    quote(
      graph.operational.content.roleBindings
        .regulatedOperatorLegalEntityReference,
    )
  } and contracting_party_legal_entity_reference=${
    quote(
      graph.operational.content.roleBindings
        .contractingPartyLegalEntityReference,
    )
  } and controller_legal_entity_reference=${
    quote(
      graph.operational.content.roleBindings.controllerLegalEntityReference ??
        "",
    )
  } and mandate_grantee_legal_entity_reference=${
    quote(
      graph.operational.content.roleBindings.mandateGranteeLegalEntityReference,
    )
  }`;
  const legalExpected = `signing_material_revision_id=${
    quote(m.legal)
  } and bundle_revision=${
    quote(graph.legal.content.bundleRevision)
  } and bundle_canonical_sha256=${
    quote(graph.legal.canonicalContentSha256)
  } and privacy_notice_document_reference=${
    quote(privacy.documentReference)
  } and privacy_notice_version=${
    quote(privacy.version)
  } and privacy_notice_language='nl' and privacy_notice_content_sha256=${
    quote(privacy.contentSha256)
  } and service_terms_document_reference=${
    quote(service.documentReference)
  } and service_terms_version=${
    quote(service.version)
  } and service_terms_language='nl' and service_terms_content_sha256=${
    quote(service.contentSha256)
  } and fee_terms_document_reference=${
    quote(feeTerms.documentReference)
  } and fee_terms_version=${
    quote(feeTerms.version)
  } and fee_terms_language='nl' and fee_terms_content_sha256=${
    quote(feeTerms.contentSha256)
  } and mandate_document_reference=${
    quote(mandate.documentReference)
  } and mandate_version=${
    quote(mandate.version)
  } and mandate_language='nl' and mandate_content_sha256=${
    quote(mandate.contentSha256)
  }`;
  const feeExpected = `signing_material_revision_id=${
    quote(m.fee)
  } and document_type='fee_terms' and document_reference=${
    quote(graph.fee.content.governingFeeTerms.documentReference)
  } and version=${
    quote(graph.fee.content.governingFeeTerms.version)
  } and language='nl' and content_sha256=${
    quote(graph.fee.content.governingFeeTerms.contentSha256)
  }`;

  return `begin;
select pg_advisory_xact_lock(hashtextextended(${
    quote(`${tenantId}:canonical-local-signing-v1`)
  }, 0));
do $bootstrap$
begin
  if exists (select 1 from public.app_tenant_configuration_component_revisions where ${context} and id not in (${
    [c.operational, c.legal, c.fee, c.provider].map(quote).join(",")
  })) then raise exception 'local signing configuration conflict component_inventory'; end if;
  ${componentGuards}
  ${
    exactRowGuard(
      "public.app_tenant_configuration_manifests",
      `(${context}) or id=${quote(ids.manifest)}`,
      manifestExpected,
      "manifests",
    )
  }
  ${
    exactRowGuard(
      "public.app_tenant_signing_material_revisions",
      `(${context}) or id in (${
        [m.operational, m.legal, m.fee].map(quote).join(",")
      })`,
      materialExpected,
      "material_revisions",
    )
  }
  ${
    exactRowGuard(
      "public.app_tenant_signing_operational_material",
      `signing_material_revision_id=${quote(m.operational)}`,
      operationalExpected,
      "operational_material",
    )
  }
  ${
    exactRowGuard(
      "public.app_tenant_signing_legal_material",
      `signing_material_revision_id=${quote(m.legal)}`,
      legalExpected,
      "legal_material",
    )
  }
  ${
    exactRowGuard(
      "public.app_tenant_signing_fee_material",
      `signing_material_revision_id=${quote(m.fee)}`,
      feeExpected,
      "fee_material",
    )
  }
  if exists (select 1 from public.app_tenant_signing_configuration_invalidations where ${context} and subject_reference in (${
    [ids.manifest, c.operational, c.legal, c.fee, m.operational, m.legal, m.fee]
      .map(quote).join(",")
  })) then raise exception 'local signing configuration invalidated'; end if;
end
$bootstrap$;
insert into public.app_tenant_configuration_component_revisions(id,tenant_id,environment,component_kind,revision_id,content_sha256,approval_status,approved_at,approved_by_actor_ref)
select * from (values
  (${quote(c.operational)}::uuid,${
    quote(tenantId)
  }::uuid,'local','operational',${
    quote(componentRevisions.operational.revisionId)
  },${quote(componentRevisions.operational.contentSha256)},'APPROVED',${
    quote(graph.approvedAt)
  }::timestamptz,${quote(graph.actor)}),
  (${quote(c.legal)}::uuid,${quote(tenantId)}::uuid,'local','legal',${
    quote(componentRevisions.legal.revisionId)
  },${quote(componentRevisions.legal.contentSha256)},'APPROVED',${
    quote(graph.approvedAt)
  }::timestamptz,${quote(graph.actor)}),
  (${quote(c.fee)}::uuid,${quote(tenantId)}::uuid,'local','fee_commercial',${
    quote(componentRevisions.feeCommercial.revisionId)
  },${quote(componentRevisions.feeCommercial.contentSha256)},'APPROVED',${
    quote(graph.approvedAt)
  }::timestamptz,${quote(graph.actor)}),
  (${quote(c.provider)}::uuid,${
    quote(tenantId)
  }::uuid,'local','provider_integration',${
    quote(componentRevisions.providerIntegration.revisionId)
  },${quote(componentRevisions.providerIntegration.contentSha256)},'APPROVED',${
    quote(graph.approvedAt)
  }::timestamptz,${quote(graph.actor)})
) as expected(id,tenant_id,environment,component_kind,revision_id,content_sha256,approval_status,approved_at,approved_by_actor_ref)
where not exists (select 1 from public.app_tenant_configuration_component_revisions existing where existing.id=expected.id);
insert into public.app_tenant_configuration_manifests(id,schema_version,manifest_revision_id,tenant_id,environment,operational_component_revision_id,legal_component_revision_id,fee_commercial_component_revision_id,provider_integration_component_revision_id,approval_status,approved_at,approved_by_actor_ref,effective_from,canonical_sha256)
select ${quote(ids.manifest)},'tenant-configuration-manifest-v1',${
    quote(manifest.manifestRevisionId)
  },${quote(tenantId)},'local',${quote(c.operational)},${quote(c.legal)},${
    quote(c.fee)
  },${quote(c.provider)},'APPROVED',${quote(graph.approvedAt)},${
    quote(graph.actor)
  },${quote(graph.approvedAt)},${quote(manifest.canonicalSha256)}
where not exists (select 1 from public.app_tenant_configuration_manifests where id=${
    quote(ids.manifest)
  });
insert into public.app_tenant_signing_material_revisions(id,tenant_id,environment,material_kind,material_revision_id,component_revision_id,canonical_content_sha256,binding_authority)
select * from (values
  (${quote(m.operational)}::uuid,${
    quote(tenantId)
  }::uuid,'local','operational',${
    quote(graph.operational.materialRevisionId)
  },${quote(c.operational)}::uuid,${
    quote(graph.operational.canonicalContentSha256)
  },'server_canonical_signing_material_v1'),
  (${quote(m.legal)}::uuid,${quote(tenantId)}::uuid,'local','legal',${
    quote(graph.legal.materialRevisionId)
  },${quote(c.legal)}::uuid,${
    quote(graph.legal.canonicalContentSha256)
  },'server_canonical_signing_material_v1'),
  (${quote(m.fee)}::uuid,${quote(tenantId)}::uuid,'local','fee_commercial',${
    quote(graph.fee.materialRevisionId)
  },${quote(c.fee)}::uuid,${
    quote(graph.fee.canonicalContentSha256)
  },'server_canonical_signing_material_v1')
) as expected(id,tenant_id,environment,material_kind,material_revision_id,component_revision_id,canonical_content_sha256,binding_authority)
where not exists (select 1 from public.app_tenant_signing_material_revisions existing where existing.id=expected.id);
insert into public.app_tenant_signing_operational_material(signing_material_revision_id,operator_legal_entity_reference,operator_identity_sha256,regulated_operator_legal_entity_reference,contracting_party_legal_entity_reference,controller_legal_entity_reference,mandate_grantee_legal_entity_reference)
select ${quote(m.operational)},${
    quote(graph.operational.content.operatorLegalEntityReference)
  },${quote(graph.operational.content.operatorIdentitySha256)},${
    quote(
      graph.operational.content.roleBindings
        .regulatedOperatorLegalEntityReference,
    )
  },${
    quote(
      graph.operational.content.roleBindings
        .contractingPartyLegalEntityReference,
    )
  },${
    quote(
      graph.operational.content.roleBindings.controllerLegalEntityReference ??
        "",
    )
  },${
    quote(
      graph.operational.content.roleBindings.mandateGranteeLegalEntityReference,
    )
  }
where not exists (select 1 from public.app_tenant_signing_operational_material where signing_material_revision_id=${
    quote(m.operational)
  });
insert into public.app_tenant_signing_legal_material(signing_material_revision_id,bundle_revision,bundle_canonical_sha256,privacy_notice_document_reference,privacy_notice_version,privacy_notice_language,privacy_notice_content_sha256,service_terms_document_reference,service_terms_version,service_terms_language,service_terms_content_sha256,fee_terms_document_reference,fee_terms_version,fee_terms_language,fee_terms_content_sha256,mandate_document_reference,mandate_version,mandate_language,mandate_content_sha256)
select ${quote(m.legal)},${quote(graph.legal.content.bundleRevision)},${
    quote(graph.legal.canonicalContentSha256)
  },${quote(privacy.documentReference)},${quote(privacy.version)},'nl',${
    quote(privacy.contentSha256)
  },${quote(service.documentReference)},${quote(service.version)},'nl',${
    quote(service.contentSha256)
  },${quote(feeTerms.documentReference)},${quote(feeTerms.version)},'nl',${
    quote(feeTerms.contentSha256)
  },${quote(mandate.documentReference)},${quote(mandate.version)},'nl',${
    quote(mandate.contentSha256)
  }
where not exists (select 1 from public.app_tenant_signing_legal_material where signing_material_revision_id=${
    quote(m.legal)
  });
insert into public.app_tenant_signing_fee_material(signing_material_revision_id,document_type,document_reference,version,language,content_sha256)
select ${quote(m.fee)},'fee_terms',${
    quote(graph.fee.content.governingFeeTerms.documentReference)
  },${quote(graph.fee.content.governingFeeTerms.version)},'nl',${
    quote(graph.fee.content.governingFeeTerms.contentSha256)
  }
where not exists (select 1 from public.app_tenant_signing_fee_material where signing_material_revision_id=${
    quote(m.fee)
  });
commit;
`;
}

class RestQuery implements PromiseLike<QueryResult> {
  readonly #apiUrl: string;
  readonly #key: string;
  readonly #table: string;
  readonly #columns: string;
  readonly #filters: Array<readonly [string, string]> = [];
  #limit: number | null = null;

  constructor(apiUrl: string, key: string, table: string, columns: string) {
    if (!READ_TABLES.has(table)) fail("local_signing_read_table_denied");
    this.#apiUrl = apiUrl;
    this.#key = key;
    this.#table = table;
    this.#columns = columns;
  }

  eq(column: string, value: string): RestQuery {
    if (!/^[a-z_]+$/.test(column)) fail("local_signing_filter_invalid");
    this.#filters.push([column, value]);
    return this;
  }

  limit(count: number): RestQuery {
    if (!Number.isInteger(count) || count < 1 || count > 2_000) {
      fail("local_signing_limit_invalid");
    }
    this.#limit = count;
    return this;
  }

  async #execute(): Promise<QueryResult> {
    const url = new URL(`${this.#apiUrl}/rest/v1/${this.#table}`);
    url.searchParams.set("select", this.#columns);
    for (const [column, value] of this.#filters) {
      url.searchParams.set(column, `eq.${value}`);
    }
    if (this.#limit !== null) {
      url.searchParams.set("limit", String(this.#limit));
    }
    try {
      const response = await fetch(url, {
        headers: {
          apikey: this.#key,
          Authorization: `Bearer ${this.#key}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return { data: null, error: { status: response.status } };
      }
      return { data: await response.json(), error: null };
    } catch {
      return { data: null, error: { code: "local_read_failed" } };
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.#execute().then(onfulfilled, onrejected);
  }
}

class RestClient {
  constructor(readonly apiUrl: string, readonly key: string) {}
  from(table: string) {
    return {
      select: (columns: string) =>
        new RestQuery(this.apiUrl, this.key, table, columns),
    };
  }
}

async function signingReadiness(
  environment: RuntimeEnvironment,
): Promise<void> {
  const key = environment.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!key) fail("local_signing_service_role_missing");
  const serverEnvironment = {
    get: (name: string) => environment[name],
  };
  const gate = await enforceAppTenantResolutionGate(
    "local",
    "canonical-local-signing-readiness",
    { authorityMode: "AUTHORITATIVE", serverEnvironment, sink: null },
  );
  if (!gate.ok) fail(`local_signing_tenant_resolution_${gate.code}`);
  const client = new RestClient(environment.SUPABASE_URL, key);
  const configuration = await new DataPlaneTenantConfigurationV1Adapter(client)
    .resolveForExecutionContext(gate.executionContext);
  if (!configuration.ok) {
    fail(`local_signing_configuration_${configuration.code}`);
  }
  const evaluationTime = new Date().toISOString();
  const materials = await resolveTenantSigningMaterialBundleV1(
    client,
    gate.executionContext,
    configuration.value,
    evaluationTime,
  );
  if (!materials.ok) fail(`local_signing_${materials.code}`);
  const documents = await resolveSigningLegalDocumentBundle(
    materials.value.legal.content.documents,
    {
      supabaseUrl: environment.SUPABASE_URL,
      evaluationTime,
      localActivationEffectiveFrom: configuration.value.manifest.effectiveFrom,
    },
  );
  if (documents?.length !== 4) {
    fail("local_signing_legal_documents_unavailable");
  }
  const receipt = await createSignupSigningPresentationReceiptV2({
    intakeId: crypto.randomUUID(),
    authenticatedAuthUserId: crypto.randomUUID(),
    tenantExecution: gate.executionContext,
    configuration: configuration.value,
    materials: materials.value,
    legalDocuments: documents,
    presentedAt: evaluationTime,
    requestId: "canonical-local-signing-readiness",
  });
  const browserDocuments = receipt
    ? createReceiptBoundLegalDocuments(
      receipt.response.receipt_reference,
      receipt.response.legal_documents,
    )
    : null;
  if (
    !browserDocuments || browserDocuments.length !== 4 ||
    browserDocuments.some((document) => !legalDocumentIsSigningReady(document))
  ) fail("local_signing_legal_document_delivery_unavailable");
  console.log("LOCAL_SIGNING_LEGAL_DOCUMENT_DELIVERY=PASS");
}

async function runPsql(databaseUrl: string, sql: string): Promise<void> {
  const child = new Deno.Command("psql", {
    args: [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();
  const result = await child.output();
  if (result.code !== 0) {
    const stderr = new TextDecoder().decode(result.stderr);
    const conflict = stderr.match(
      /local signing configuration conflict (component_inventory|component_operational|component_legal|component_fee_commercial|component_provider_integration|manifests|material_revisions|operational_material|legal_material|fee_material)/,
    )?.[1];
    if (conflict) fail(`local_signing_configuration_conflict_${conflict}`);
    if (stderr.includes("local signing configuration invalidated")) {
      fail("local_signing_configuration_invalidated");
    }
    fail("local_signing_bootstrap_transaction_failed");
  }
}

function safeReason(error: unknown): string {
  return error instanceof LocalSigningConfigurationError
    ? error.code
    : "local_signing_configuration_unexpected";
}

if (import.meta.main) {
  try {
    const operation = Deno.args[0] ?? "";
    const environment = Object.fromEntries(
      [
        "DATABASE_URL",
        "ENVIRONMENT",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "ENVAL_TENANT_RESOLUTION_AUTHORITY_MODE",
        "ENVAL_TENANT_RESOLUTION_SHADOW_MODE",
        "ENVAL_TENANT_REFERENCE",
        "ENVAL_TRUSTED_TENANT_ROUTING_KEY",
        "ENVAL_DATA_PLANE_LOCATOR_ID",
        "ENVAL_DATA_PLANE_DEPLOYMENT_OWNERSHIP",
        "ENVAL_DATA_PLANE_PROVIDER_TYPE",
        "ENVAL_DATA_PLANE_REFERENCE",
        "ENVAL_FIXED_DATA_PLANE_REFERENCE",
        "ENVAL_APPLICATION_ROUTE_REFERENCE",
        "ENVAL_DATA_PLANE_SECRET_REFERENCE_ID",
      ].map((name) => [name, Deno.env.get(name) ?? ""]),
    );
    assertLocalSigningConfigurationTarget(environment);
    if (operation === "bootstrap") {
      const graph = await buildLocalSigningConfigurationGraph(
        environment.ENVAL_TENANT_REFERENCE,
      );
      await runPsql(
        environment.DATABASE_URL,
        buildLocalSigningBootstrapSql(graph),
      );
      console.log("LOCAL_SIGNING_BOOTSTRAP=PASS");
    } else if (operation === "ready") {
      await signingReadiness(environment);
      console.log("LOCAL_SIGNING_READINESS=PASS");
    } else {
      fail("local_signing_operation_invalid");
    }
  } catch (error) {
    console.error(
      `LOCAL_SIGNING_CONFIGURATION=FAIL\nREASON=${safeReason(error)}`,
    );
    Deno.exitCode = 1;
  }
}
