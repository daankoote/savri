import {
  createSigningLegalDocumentReferenceV1,
  createTenantFeeSigningMaterialV1,
  createTenantLegalSigningMaterialV1,
  createTenantOperationalSigningMaterialV1,
  feeSigningMaterialCanonicalSha256V1,
  type FeeSigningMaterialContentV1,
  legalSigningMaterialCanonicalSha256V1,
  type LegalSigningMaterialContentV1,
  operationalSigningMaterialCanonicalSha256V1,
  type OperationalSigningMaterialContentV1,
  type SigningLegalDocumentReferenceV1,
  validateTenantSigningConfigurationInvalidationV1,
} from "../../supabase/functions/_shared/app_tenant_signing_material.ts";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TENANT_ID = "a1000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "a1000000-0000-4000-8000-000000000002";
const COMPONENT_IDS = Object.freeze({
  operational: "a2000000-0000-4000-8000-000000000001",
  legal: "a2000000-0000-4000-8000-000000000002",
  fee: "a2000000-0000-4000-8000-000000000003",
  provider: "a2000000-0000-4000-8000-000000000004",
  operationalSuccessor: "a2000000-0000-4000-8000-000000000005",
});
const MATERIAL_IDS = Object.freeze({
  operational: "a3000000-0000-4000-8000-000000000001",
  legal: "a3000000-0000-4000-8000-000000000002",
  fee: "a3000000-0000-4000-8000-000000000003",
});
const APPROVED_AT = "2026-01-01T00:00:00.000Z";
const ACTOR = "sl01b-proof";
const OPERATOR_REFERENCE = "operator:synthetic-proof-v1";

type CommandResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

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
    .slice(0, 300);
}

async function command(
  name: string,
  args: string[],
  stdin?: string,
  env?: Record<string, string>,
): Promise<CommandResult> {
  const child = new Deno.Command(name, {
    args,
    env,
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

async function psql(sql: string): Promise<string> {
  const result = await command(
    "psql",
    [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    sql,
  );
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}

function approvedComponent(
  componentKind:
    | "operational"
    | "legal"
    | "fee_commercial"
    | "provider_integration",
  revisionId: string,
  contentSha256: string,
) {
  return Object.freeze({
    componentKind,
    revisionId,
    contentSha256,
    approvalStatus: "APPROVED" as const,
    approvedAt: APPROVED_AT,
    approvedByActorRef: ACTOR,
  });
}

const documentInputs = Object.freeze(
  [
    {
      documentReference: "legal:synthetic-privacy-v1",
      documentType: "privacy_notice",
      version: "privacy-synthetic-v1",
      language: "nl",
      canonicalContent: "Synthetic privacy proof content.",
    },
    {
      documentReference: "legal:synthetic-service-v1",
      documentType: "service_terms",
      version: "service-synthetic-v1",
      language: "nl",
      canonicalContent: "Synthetic service terms proof content.",
    },
    {
      documentReference: "legal:synthetic-fee-v1",
      documentType: "fee_terms",
      version: "fee-synthetic-v1",
      language: "nl",
      canonicalContent:
        "Synthetic fee terms proof content without a percentage.",
    },
    {
      documentReference: "legal:synthetic-mandate-v1",
      documentType: "mandate",
      version: "mandate-synthetic-v1",
      language: "nl",
      canonicalContent: "Synthetic mandate proof content.",
    },
  ] as const,
);

const documents = await Promise.all(
  documentInputs.map(createSigningLegalDocumentReferenceV1),
);
assert(documents.every(Boolean), "synthetic_document_reference_invalid");
const legalDocuments = documents as SigningLegalDocumentReferenceV1[];

const operationalContent: OperationalSigningMaterialContentV1 = Object.freeze({
  schemaVersion: "tenant-signing-operational-material-v1",
  operatorLegalEntityReference: OPERATOR_REFERENCE,
  operatorIdentitySha256: "1".repeat(64),
  roleBindings: Object.freeze({
    regulatedOperatorLegalEntityReference: OPERATOR_REFERENCE,
    contractingPartyLegalEntityReference: OPERATOR_REFERENCE,
    controllerLegalEntityReference: OPERATOR_REFERENCE,
    mandateGranteeLegalEntityReference: OPERATOR_REFERENCE,
  }),
});
const legalContent: LegalSigningMaterialContentV1 = Object.freeze({
  schemaVersion: "tenant-signing-legal-material-v1",
  bundleRevision: "synthetic-bundle-v1",
  documents: Object.freeze([...legalDocuments]),
});
const feeContent: FeeSigningMaterialContentV1 = Object.freeze({
  schemaVersion: "tenant-signing-fee-material-v1",
  governingFeeTerms: legalDocuments.find((document) =>
    document.documentType === "fee_terms"
  )!,
});

const hashes = Object.freeze({
  operational: await operationalSigningMaterialCanonicalSha256V1(
    operationalContent,
  ),
  legal: await legalSigningMaterialCanonicalSha256V1(legalContent),
  fee: await feeSigningMaterialCanonicalSha256V1(feeContent),
});
const components = Object.freeze({
  operational: approvedComponent(
    "operational",
    "operational-synthetic-v1",
    hashes.operational,
  ),
  legal: approvedComponent("legal", "legal-synthetic-v1", hashes.legal),
  fee: approvedComponent(
    "fee_commercial",
    "fee-synthetic-v1",
    hashes.fee,
  ),
  provider: approvedComponent(
    "provider_integration",
    "provider-synthetic-v1",
    "4".repeat(64),
  ),
});

const operationalInput = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
  materialRevisionId: "operational-material-v1",
  componentRevision: components.operational,
  operatorLegalEntityReference: OPERATOR_REFERENCE,
  operatorIdentitySha256: "1".repeat(64),
  roleBindings: operationalContent.roleBindings,
});
const legalInput = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
  materialRevisionId: "legal-material-v1",
  componentRevision: components.legal,
  bundleRevision: legalContent.bundleRevision,
  documents: legalContent.documents,
});
const feeInput = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
  materialRevisionId: "fee-material-v1",
  componentRevision: components.fee,
  governingFeeTerms: feeContent.governingFeeTerms,
});

const operational = await createTenantOperationalSigningMaterialV1(
  operationalInput,
);
assert(
  operational.ok &&
    operational.value.materialKind === "operational" &&
    operational.value.canonicalContentSha256 ===
      components.operational.contentSha256,
  "Q01_operational_binding_invalid",
);
q(1);

const wrongOperational = await createTenantOperationalSigningMaterialV1({
  ...operationalInput,
  componentRevision: {
    ...components.operational,
    contentSha256: "9".repeat(64),
  },
});
assert(
  !wrongOperational.ok && wrongOperational.code === "material_hash_mismatch",
  "Q02_wrong_operational_hash_accepted",
);
q(2);

const legal = await createTenantLegalSigningMaterialV1(legalInput);
assert(
  legal.ok && legal.value.materialKind === "legal" &&
    legal.value.canonicalContentSha256 === components.legal.contentSha256,
  "Q03_legal_binding_invalid",
);
q(3);

const wrongLegal = await createTenantLegalSigningMaterialV1({
  ...legalInput,
  componentRevision: components.operational,
});
assert(
  !wrongLegal.ok && wrongLegal.code === "component_kind_mismatch",
  "Q04_wrong_legal_component_accepted",
);
q(4);

assert(
  legal.ok &&
    legal.value.content.documents.map((document) => document.documentType)
        .join("|") === "privacy_notice|service_terms|fee_terms|mandate",
  "Q05_legal_slots_invalid",
);
q(5);

const missingSlot = await createTenantLegalSigningMaterialV1({
  ...legalInput,
  documents: legalDocuments.slice(0, 3),
});
const duplicateSlot = await createTenantLegalSigningMaterialV1({
  ...legalInput,
  documents: [
    legalDocuments[0],
    legalDocuments[0],
    legalDocuments[2],
    legalDocuments[3],
  ],
});
const wrongSlot = await createTenantLegalSigningMaterialV1({
  ...legalInput,
  documents: [
    legalDocuments[0],
    legalDocuments[1],
    legalDocuments[2],
    { ...legalDocuments[3], documentType: "unknown" },
  ],
});
assert(
  !missingSlot.ok && !duplicateSlot.ok && !wrongSlot.ok,
  "Q06_invalid_legal_slot_set_accepted",
);
q(6);

assert(
  await createSigningLegalDocumentReferenceV1({
        ...documentInputs[0],
        version: "",
      }) === null &&
    await createSigningLegalDocumentReferenceV1({
        ...documentInputs[0],
        language: "en",
      }) === null &&
    legalDocuments.every((document) =>
      document.documentReference && document.version && document.language &&
      /^[0-9a-f]{64}$/.test(document.contentSha256)
    ),
  "Q07_legal_document_provenance_not_strict",
);
q(7);

assert(
  legal.ok && legal.value.canonicalContentSha256 === hashes.legal &&
    hashes.legal === await legalSigningMaterialCanonicalSha256V1(
        legal.value.content,
      ),
  "Q08_bundle_hash_invalid",
);
q(8);

const moduleSource = await Deno.readTextFile(
  new URL(
    "../../supabase/functions/_shared/app_tenant_signing_material.ts",
    import.meta.url,
  ),
);
const migrationSource = await Deno.readTextFile(
  new URL(
    "../../supabase/migrations/20260901220000_app_tenant_signing_material.sql",
    import.meta.url,
  ),
);
assert(
  !migrationSource.match(/\bjsonb?\b/i) &&
    !migrationSource.includes("Synthetic privacy proof content") &&
    !moduleSource.includes("SIGNING_LEGAL_RUNTIME_DOCUMENTS") &&
    !moduleSource.includes("De beoogde contractspartij"),
  "Q09_legal_text_or_generic_payload_duplicated",
);
q(9);

const fee = await createTenantFeeSigningMaterialV1(feeInput);
assert(
  fee.ok && fee.value.materialKind === "fee_commercial" &&
    fee.value.canonicalContentSha256 === components.fee.contentSha256,
  "Q10_fee_binding_invalid",
);
q(10);

assert(
  fee.ok && Object.keys(fee.value.content).sort().join("|") ===
      "governingFeeTerms|schemaVersion" &&
    !migrationSource.match(
      /fee_percentage|customer_share|calculator_configuration|settlement_parameter/i,
    ),
  "Q11_fee_material_not_document_only",
);
q(11);

const providerMaterial = await createTenantFeeSigningMaterialV1({
  ...feeInput,
  componentRevision: components.provider,
});
assert(
  !providerMaterial.ok && providerMaterial.code === "component_kind_mismatch",
  "Q12_provider_component_accepted",
);
q(12);

const unknownRole = await createTenantOperationalSigningMaterialV1({
  ...operationalInput,
  roleBindings: {
    ...operationalContent.roleBindings,
    support: OPERATOR_REFERENCE,
  },
});
assert(!unknownRole.ok, "Q13_unknown_operator_role_accepted");
q(13);

const supportField = await createTenantOperationalSigningMaterialV1({
  ...operationalInput,
  supportIdentity: "synthetic-support",
});
const brandingField = await createTenantOperationalSigningMaterialV1({
  ...operationalInput,
  branding: "synthetic-brand",
});
assert(
  !supportField.ok && !brandingField.ok,
  "Q14_non_material_fields_accepted",
);
q(14);

const unknownField = await createTenantLegalSigningMaterialV1({
  ...legalInput,
  extension: "not-allowed",
});
assert(!unknownField.ok, "Q15_unknown_field_accepted");
q(15);

const secretField = await createTenantFeeSigningMaterialV1({
  ...feeInput,
  apiKey: "not-a-real-secret",
});
assert(
  !secretField.ok &&
    !migrationSource.match(
      /\b(api_key|password|private_key|access_token|refresh_token|secret_value)\b/i,
    ),
  "Q16_secret_field_accepted",
);
q(16);

assert(operational.ok, "Q17_operational_missing");
const frozenBefore = JSON.stringify(operational.value);
try {
  (operational.value as { tenantId: string }).tenantId = OTHER_TENANT_ID;
} catch (_error) {
  // Frozen authority values reject mutation in strict mode.
}
assert(
  Object.isFrozen(operational.value) &&
    Object.isFrozen(operational.value.content) &&
    Object.isFrozen(operational.value.content.roleBindings) &&
    JSON.stringify(operational.value) === frozenBefore,
  "Q17_runtime_material_mutable",
);
q(17);

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function componentRowsSql(): string {
  return `
    insert into public.app_tenant_configuration_component_revisions(
      id, tenant_id, environment, component_kind, revision_id,
      content_sha256, approval_status, approved_at, approved_by_actor_ref
    ) values
      ('${COMPONENT_IDS.operational}', '${TENANT_ID}', 'local', 'operational',
       'operational-synthetic-v1', '${hashes.operational}', 'APPROVED',
       '${APPROVED_AT}', '${ACTOR}'),
      ('${COMPONENT_IDS.legal}', '${TENANT_ID}', 'local', 'legal',
       'legal-synthetic-v1', '${hashes.legal}', 'APPROVED',
       '${APPROVED_AT}', '${ACTOR}'),
      ('${COMPONENT_IDS.fee}', '${TENANT_ID}', 'local', 'fee_commercial',
       'fee-synthetic-v1', '${hashes.fee}', 'APPROVED',
       '${APPROVED_AT}', '${ACTOR}'),
      ('${COMPONENT_IDS.provider}', '${TENANT_ID}', 'local',
       'provider_integration', 'provider-synthetic-v1', '${"4".repeat(64)}',
       'APPROVED', '${APPROVED_AT}', '${ACTOR}');
  `;
}

function materialRowsSql(): string {
  const byType = new Map(
    legalDocuments.map((document) => [document.documentType, document]),
  );
  const privacy = byType.get("privacy_notice")!;
  const service = byType.get("service_terms")!;
  const feeTerms = byType.get("fee_terms")!;
  const mandate = byType.get("mandate")!;
  return `
    insert into public.app_tenant_signing_material_revisions(
      id, tenant_id, environment, material_kind, material_revision_id,
      component_revision_id, canonical_content_sha256, binding_authority
    ) values
      ('${MATERIAL_IDS.operational}', '${TENANT_ID}', 'local', 'operational',
       'operational-material-v1', '${COMPONENT_IDS.operational}',
       '${hashes.operational}', 'server_canonical_signing_material_v1'),
      ('${MATERIAL_IDS.legal}', '${TENANT_ID}', 'local', 'legal',
       'legal-material-v1', '${COMPONENT_IDS.legal}', '${hashes.legal}',
       'server_canonical_signing_material_v1'),
      ('${MATERIAL_IDS.fee}', '${TENANT_ID}', 'local', 'fee_commercial',
       'fee-material-v1', '${COMPONENT_IDS.fee}', '${hashes.fee}',
       'server_canonical_signing_material_v1');

    insert into public.app_tenant_signing_operational_material(
      signing_material_revision_id, operator_legal_entity_reference,
      operator_identity_sha256,
      regulated_operator_legal_entity_reference,
      contracting_party_legal_entity_reference,
      controller_legal_entity_reference,
      mandate_grantee_legal_entity_reference
    ) values (
      '${MATERIAL_IDS.operational}', ${sqlLiteral(OPERATOR_REFERENCE)},
      '${"1".repeat(64)}', ${sqlLiteral(OPERATOR_REFERENCE)},
      ${sqlLiteral(OPERATOR_REFERENCE)}, ${sqlLiteral(OPERATOR_REFERENCE)},
      ${sqlLiteral(OPERATOR_REFERENCE)}
    );

    insert into public.app_tenant_signing_legal_material(
      signing_material_revision_id, bundle_revision,
      bundle_canonical_sha256,
      privacy_notice_document_reference, privacy_notice_version,
      privacy_notice_language, privacy_notice_content_sha256,
      service_terms_document_reference, service_terms_version,
      service_terms_language, service_terms_content_sha256,
      fee_terms_document_reference, fee_terms_version,
      fee_terms_language, fee_terms_content_sha256,
      mandate_document_reference, mandate_version, mandate_language,
      mandate_content_sha256
    ) values (
      '${MATERIAL_IDS.legal}', 'synthetic-bundle-v1', '${hashes.legal}',
      ${sqlLiteral(privacy.documentReference)}, ${sqlLiteral(privacy.version)},
      'nl', '${privacy.contentSha256}',
      ${sqlLiteral(service.documentReference)}, ${sqlLiteral(service.version)},
      'nl', '${service.contentSha256}',
      ${sqlLiteral(feeTerms.documentReference)},
      ${sqlLiteral(feeTerms.version)}, 'nl', '${feeTerms.contentSha256}',
      ${sqlLiteral(mandate.documentReference)},
      ${sqlLiteral(mandate.version)}, 'nl', '${mandate.contentSha256}'
    );

    insert into public.app_tenant_signing_fee_material(
      signing_material_revision_id, document_type, document_reference,
      version, language, content_sha256
    ) values (
      '${MATERIAL_IDS.fee}', 'fee_terms',
      ${sqlLiteral(feeTerms.documentReference)},
      ${sqlLiteral(feeTerms.version)}, 'nl', '${feeTerms.contentSha256}'
    );
    set constraints all immediate;
  `;
}

async function databaseFixture(body: string): Promise<string> {
  return await psql(`
    begin;
    ${componentRowsSql()}
    ${materialRowsSql()}
    ${body}
    rollback;
  `);
}

const dbUpdateRejected = await databaseFixture(`
  do $$
  declare rejected boolean := false;
  begin
    begin
      update public.app_tenant_signing_material_revisions
      set material_revision_id = 'changed-material-v1'
      where id = '${MATERIAL_IDS.operational}';
    exception when others then rejected := true;
    end;
    if not rejected then raise exception 'immutable update accepted'; end if;
  end;
  $$;
  select 'update_rejected';
`);
assert(dbUpdateRejected === "update_rejected", "Q18_database_update_accepted");
q(18);

const dbDeleteRejected = await databaseFixture(`
  do $$
  declare rejected boolean := false;
  begin
    begin
      delete from public.app_tenant_signing_fee_material
      where signing_material_revision_id = '${MATERIAL_IDS.fee}';
    exception when others then rejected := true;
    end;
    if not rejected then raise exception 'immutable delete accepted'; end if;
  end;
  $$;
  select 'delete_rejected';
`);
assert(dbDeleteRejected === "delete_rejected", "Q19_database_delete_accepted");
q(19);

const supersessionResult = await databaseFixture(`
  insert into public.app_tenant_configuration_component_revisions(
    id, tenant_id, environment, component_kind, revision_id,
    content_sha256, approval_status, approved_at, approved_by_actor_ref,
    supersedes_component_revision_id
  ) values (
    '${COMPONENT_IDS.operationalSuccessor}', '${TENANT_ID}', 'local',
    'operational', 'operational-synthetic-v2', '${"5".repeat(64)}',
    'APPROVED', '${APPROVED_AT}', '${ACTOR}',
    '${COMPONENT_IDS.operational}'
  );
  select count(*)::text
  from public.app_tenant_signing_configuration_invalidations;
`);
assert(supersessionResult === "0", "Q20_supersession_implied_invalidation");
q(20);

const invalidationResult = await databaseFixture(`
  insert into public.app_tenant_signing_configuration_invalidations(
    tenant_id, environment, subject_type, subject_reference, effective_at,
    reason_code, authorized_actor_ref, evidence_reference
  ) values (
    '${TENANT_ID}', 'local', 'signing_material_revision',
    '${MATERIAL_IDS.operational}', '2026-02-01T00:00:00.000Z',
    'explicit_invalidation', '${ACTOR}', 'evidence:sl01b-proof'
  );
  do $$
  declare update_rejected boolean := false;
  declare delete_rejected boolean := false;
  begin
    begin
      update public.app_tenant_signing_configuration_invalidations
      set evidence_reference = 'evidence:changed'
      where subject_reference = '${MATERIAL_IDS.operational}';
    exception when others then update_rejected := true;
    end;
    begin
      delete from public.app_tenant_signing_configuration_invalidations
      where subject_reference = '${MATERIAL_IDS.operational}';
    exception when others then delete_rejected := true;
    end;
    if not update_rejected or not delete_rejected then
      raise exception 'invalidation was mutable';
    end if;
  end;
  $$;
  select count(*)::text
  from public.app_tenant_signing_configuration_invalidations;
`);
assert(
  invalidationResult === "1" &&
    validateTenantSigningConfigurationInvalidationV1({
        tenantId: TENANT_ID,
        environment: "local",
        subjectType: "signing_material_revision",
        subjectReference: MATERIAL_IDS.operational,
        effectiveAt: "2026-02-01T00:00:00.000Z",
        reasonCode: "explicit_invalidation",
        authorizedActorRef: ACTOR,
        evidenceReference: "evidence:sl01b-proof",
      }) !== null,
  "Q21_invalidation_not_append_only",
);
q(21);

const crossContextResult = await databaseFixture(`
  do $$
  declare rejected boolean := false;
  begin
    begin
      insert into public.app_tenant_signing_material_revisions(
        tenant_id, environment, material_kind, material_revision_id,
        component_revision_id, canonical_content_sha256, binding_authority
      ) values (
        '${OTHER_TENANT_ID}', 'local', 'operational', 'cross-context-v1',
        '${COMPONENT_IDS.operational}', '${hashes.operational}',
        'server_canonical_signing_material_v1'
      );
    exception when others then rejected := true;
    end;
    if not rejected then raise exception 'cross context accepted'; end if;
  end;
  $$;
  select 'cross_context_rejected';
`);
assert(
  crossContextResult === "cross_context_rejected",
  "Q22_cross_context_binding_accepted",
);
q(22);

const hashBindingResult = await databaseFixture(`
  select count(*)::text
  from public.app_tenant_signing_material_revisions material
  join public.app_tenant_configuration_component_revisions component
    on component.id = material.component_revision_id
   and component.tenant_id = material.tenant_id
   and component.environment = material.environment
   and component.component_kind = material.material_kind
   and component.content_sha256 = material.canonical_content_sha256
  where material.binding_authority =
    'server_canonical_signing_material_v1'
    and material.tenant_id = '${TENANT_ID}'
    and material.id in (
      '${MATERIAL_IDS.operational}',
      '${MATERIAL_IDS.legal}',
      '${MATERIAL_IDS.fee}'
    );
`);
assert(hashBindingResult === "3", "Q23_component_content_hash_not_bound");
q(23);

const persistedCount = await psql(`
  select count(*)::text
  from public.app_tenant_signing_material_revisions
  where id in (
    '${MATERIAL_IDS.operational}',
    '${MATERIAL_IDS.legal}',
    '${MATERIAL_IDS.fee}'
  );
`);
assert(
  persistedCount === "0" &&
    !migrationSource.includes("privacy-notice-nl-v1") &&
    !migrationSource.includes("ENVAL B.V."),
  "Q24_real_validation_candidate_seeded",
);
q(24);

const currentSigningSources = await Promise.all([
  "../../supabase/functions/api-app-signup-signing-presentation/index.ts",
  "../../supabase/functions/api-app-signup-signing-challenge/index.ts",
  "../../supabase/functions/api-app-signup-signing-finalize/index.ts",
  "../../supabase/functions/_shared/signup_signing.ts",
].map((path) => Deno.readTextFile(new URL(path, import.meta.url))));
assert(
  currentSigningSources[0].includes(
    "app_tenant_signing_material_data_plane_v1",
  ) &&
    currentSigningSources[1].includes(
      "app_tenant_signing_material_data_plane_v1",
    ) &&
    currentSigningSources.slice(2).every((source) =>
      !source.includes("app_tenant_signing_material")
    ) &&
    currentSigningSources.every((source) =>
      !source.includes('from "../_shared/app_tenant_signing_material.ts"')
    ),
  "Q25_current_signing_consumer_changed",
);
q(25);

const waveA1 = await command(
  "deno",
  [
    "run",
    "--allow-all",
    "scripts/proofs/qualification-wave-a1-private-clean.proof.ts",
  ],
  undefined,
  { ENVAL_ALLOW_LOCAL_QUALIFICATION_WRITES: "YES" },
);
assert(
  waveA1.code === 0 &&
    waveA1.stdout.includes(
      "QUALIFICATION_WAVE_A1_PRIVATE_CLEAN_END_TO_END=PASS",
    ),
  `Q26_wave_a1_regression_failed:${scrub(waveA1.stderr || waveA1.stdout)}`,
);
q(26);

const tf02 = await command("deno", [
  "run",
  "--allow-all",
  "scripts/proofs/app-tenant-configuration-persistence.proof.ts",
]);
assert(
  tf02.code === 0 &&
    tf02.stdout.includes("TF02C_PERSISTENCE_READ_PROOF=PASS") &&
    tf02.stdout.includes("Q36=PASS"),
  `Q27_tf02_regression_failed:${scrub(tf02.stderr || tf02.stdout)}`,
);
q(27);

const status = await command("git", ["status", "--short"]);
assert(
  status.code === 0 &&
    !moduleSource.match(/tenant.?2|dynamic.?switch|admin.?ui/i) &&
    !migrationSource.match(/tenant.?2|dynamic.?switch|admin.?ui/i),
  "Q28_scope_expansion_detected",
);
q(28);

console.log("SL01B_SIGNING_MATERIAL_PROOF=PASS");
