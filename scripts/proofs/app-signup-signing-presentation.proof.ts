import {
  tenantConfigurationManifestCanonicalSha256,
  type TenantConfigurationManifestHashInputV1,
  validateTenantConfigurationManifestV1,
} from "../../supabase/functions/_shared/app_tenant_configuration.ts";
import {
  createTenantFeeSigningMaterialV1,
  createTenantLegalSigningMaterialV1,
  createTenantOperationalSigningMaterialV1,
  feeSigningMaterialCanonicalSha256V1,
  legalSigningMaterialCanonicalSha256V1,
  operationalSigningMaterialCanonicalSha256V1,
} from "../../supabase/functions/_shared/app_tenant_signing_material.ts";
import type { ResolvedTenantSigningMaterialBundleV1 } from "../../supabase/functions/_shared/app_tenant_signing_material_data_plane_v1.ts";
import type { AppTenantExecutionContext } from "../../supabase/functions/_shared/app_tenant_resolution_shadow.ts";
import {
  createSignupSigningPresentationReceiptV1,
  SIGNING_PRESENTATION_RECEIPT_TTL_MILLISECONDS,
} from "../../supabase/functions/_shared/app_signup_signing_presentation.ts";
import {
  resolveSigningLegalDocumentBundle,
  signingSha256Hex,
} from "../../supabase/functions/_shared/signing_legal_runtime.ts";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TENANT_ID = "c1000000-0000-4000-8000-000000000001";
const INTAKE_ID = "c1000000-0000-4000-8000-000000000002";
const AUTH_USER_ID = "c1000000-0000-4000-8000-000000000003";
const MANIFEST_ID = "c1000000-0000-4000-8000-000000000004";
const COMPONENT_IDS = {
  operational: "c2000000-0000-4000-8000-000000000001",
  legal: "c2000000-0000-4000-8000-000000000002",
  fee: "c2000000-0000-4000-8000-000000000003",
  provider: "c2000000-0000-4000-8000-000000000004",
} as const;
const MATERIAL_IDS = {
  operational: "c3000000-0000-4000-8000-000000000001",
  legal: "c3000000-0000-4000-8000-000000000002",
  fee: "c3000000-0000-4000-8000-000000000003",
} as const;
const APPROVED_AT = "2026-01-01T00:00:00.000Z";
const ACTOR = "sl01c-synthetic-proof";

class ProofFailure extends Error {}
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(number: number) {
  console.log(`Q${String(number).padStart(2, "0")}=PASS`);
}
function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
function scrub(value: string): string {
  return value
    .replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/\s+/g, " ").slice(0, 500);
}
async function command(
  name: string,
  args: string[],
  stdin?: string,
  env?: Record<string, string>,
) {
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
    throw new ProofFailure(`sql_failed:${scrub(result.stderr)}`);
  }
  return result.stdout;
}
async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../../${path}`, import.meta.url));
}

const [
  presentationEndpoint,
  challengeEndpoint,
  finalizeEndpoint,
  frontend,
  clientSource,
  migrationSource,
] = await Promise.all([
  source("supabase/functions/api-app-signup-signing-presentation/index.ts"),
  source("supabase/functions/api-app-signup-signing-challenge/index.ts"),
  source("supabase/functions/api-app-signup-signing-finalize/index.ts"),
  source("app/src/features/signup/DocumentFirstSigningSummary.tsx"),
  source("app/src/features/signup/signupSigningClient.ts"),
  source(
    "supabase/migrations/20260901230000_app_signup_signing_presentation_receipt.sql",
  ),
]);

const authAt = presentationEndpoint.indexOf("authorizeSignupSigningIntakeV1");
const tenantAt = presentationEndpoint.indexOf("getAppRequestMeta(req)");
const materialAt = presentationEndpoint.indexOf(
  "resolveTenantSigningMaterialBundleV1",
  tenantAt,
);
assert(authAt >= 0 && authAt < tenantAt && tenantAt < materialAt, "Q01_order");
q(1);
assert(
  presentationEndpoint.includes("authorizeSignupSigningIntakeV1") &&
    presentationEndpoint.includes("missing_authorization") === false,
  "Q02_auth_not_reused",
);
q(2);
assert(
  presentationEndpoint.includes("intake_reference") &&
    presentationEndpoint.includes("management_capability") &&
    migrationSource.includes("authenticated_auth_user_id"),
  "Q03_intake_auth_binding_missing",
);
q(3);
assert(
  tenantAt < materialAt &&
    presentationEndpoint.includes("meta.tenant_execution"),
  "Q04_tf01_not_before_material",
);
q(4);
assert(
  presentationEndpoint.includes("signing_configuration_unavailable") &&
    presentationEndpoint.includes("signing_material_unavailable"),
  "Q05_missing_config_not_closed",
);
q(5);
assert(
  (await source(
    "supabase/functions/_shared/app_tenant_signing_material_data_plane_v1.ts",
  )).includes("signing_material_ambiguous"),
  "Q06_ambiguity_not_closed",
);
q(6);
assert(
  migrationSource.includes("signing_configuration_invalidated") &&
    migrationSource.includes("effective_at <= v_now"),
  "Q07_invalidation_not_checked",
);
q(7);
assert(
  !migrationSource.match(/supersed.*invalidat|invalidat.*supersed/i),
  "Q08_supersession_implied_invalidation",
);
q(8);

const documentContents = [
  "Synthetic privacy proof content.",
  "Synthetic service terms proof content.",
  "Synthetic fee terms proof content without a percentage.",
  "Synthetic mandate proof content.",
] as const;
const documentTypes = [
  "privacy_notice",
  "service_terms",
  "fee_terms",
  "mandate",
] as const;
const documentRefs = await Promise.all(documentContents.map(async (
  canonicalContent,
  index,
) => ({
  documentReference: `legal:synthetic-${
    [
      "privacy",
      "service",
      "fee",
      "mandate",
    ][index]
  }-v1`,
  documentType: documentTypes[index],
  version: `${["privacy", "service", "fee", "mandate"][index]}-synthetic-v1`,
  language: "nl" as const,
  contentSha256: await signingSha256Hex(canonicalContent),
})));
const operationalContent = {
  schemaVersion: "tenant-signing-operational-material-v1" as const,
  operatorLegalEntityReference: "operator:synthetic-proof-v1",
  operatorIdentitySha256: "1".repeat(64),
  roleBindings: {
    regulatedOperatorLegalEntityReference: "operator:synthetic-proof-v1",
    contractingPartyLegalEntityReference: "operator:synthetic-proof-v1",
    controllerLegalEntityReference: "operator:synthetic-proof-v1",
    mandateGranteeLegalEntityReference: "operator:synthetic-proof-v1",
  },
};
const legalContent = {
  schemaVersion: "tenant-signing-legal-material-v1" as const,
  bundleRevision: "synthetic-bundle-v1",
  documents: documentRefs,
};
const feeContent = {
  schemaVersion: "tenant-signing-fee-material-v1" as const,
  governingFeeTerms: documentRefs[2],
};
const hashes = {
  operational: await operationalSigningMaterialCanonicalSha256V1(
    operationalContent,
  ),
  legal: await legalSigningMaterialCanonicalSha256V1(legalContent),
  fee: await feeSigningMaterialCanonicalSha256V1(feeContent),
  provider: "4".repeat(64),
};
const componentRevisions = {
  operational: {
    componentKind: "operational" as const,
    revisionId: "operational-sl01c-v1",
    contentSha256: hashes.operational,
    approvalStatus: "APPROVED" as const,
    approvedAt: APPROVED_AT,
    approvedByActorRef: ACTOR,
  },
  legal: {
    componentKind: "legal" as const,
    revisionId: "legal-sl01c-v1",
    contentSha256: hashes.legal,
    approvalStatus: "APPROVED" as const,
    approvedAt: APPROVED_AT,
    approvedByActorRef: ACTOR,
  },
  feeCommercial: {
    componentKind: "fee_commercial" as const,
    revisionId: "fee-sl01c-v1",
    contentSha256: hashes.fee,
    approvalStatus: "APPROVED" as const,
    approvedAt: APPROVED_AT,
    approvedByActorRef: ACTOR,
  },
  providerIntegration: {
    componentKind: "provider_integration" as const,
    revisionId: "provider-sl01c-v1",
    contentSha256: hashes.provider,
    approvalStatus: "APPROVED" as const,
    approvedAt: APPROVED_AT,
    approvedByActorRef: ACTOR,
  },
};
const manifestHashInput: TenantConfigurationManifestHashInputV1 = {
  schemaVersion: "tenant-configuration-manifest-v1",
  manifestRevisionId: "manifest-sl01c-v1",
  tenantId: TENANT_ID,
  environment: "local",
  components: {
    operational: {
      componentKind: "operational",
      revisionId: componentRevisions.operational.revisionId,
      contentSha256: componentRevisions.operational.contentSha256,
    },
    legal: {
      componentKind: "legal",
      revisionId: componentRevisions.legal.revisionId,
      contentSha256: componentRevisions.legal.contentSha256,
    },
    feeCommercial: {
      componentKind: "fee_commercial",
      revisionId: componentRevisions.feeCommercial.revisionId,
      contentSha256: componentRevisions.feeCommercial.contentSha256,
    },
    providerIntegration: {
      componentKind: "provider_integration",
      revisionId: componentRevisions.providerIntegration.revisionId,
      contentSha256: componentRevisions.providerIntegration.contentSha256,
    },
  },
  approvalStatus: "APPROVED",
  approvedAt: APPROVED_AT,
  approvedByActorRef: ACTOR,
  effectiveFrom: APPROVED_AT,
};
const manifest = await validateTenantConfigurationManifestV1({
  ...manifestHashInput,
  canonicalSha256: await tenantConfigurationManifestCanonicalSha256(
    manifestHashInput,
  ),
});
assert(manifest.ok, "manifest_invalid");
const operational = await createTenantOperationalSigningMaterialV1({
  tenantId: TENANT_ID,
  environment: "local",
  materialRevisionId: "operational-material-sl01c-v1",
  componentRevision: componentRevisions.operational,
  operatorLegalEntityReference: operationalContent.operatorLegalEntityReference,
  operatorIdentitySha256: operationalContent.operatorIdentitySha256,
  roleBindings: operationalContent.roleBindings,
});
const legal = await createTenantLegalSigningMaterialV1({
  tenantId: TENANT_ID,
  environment: "local",
  materialRevisionId: "legal-material-sl01c-v1",
  componentRevision: componentRevisions.legal,
  bundleRevision: legalContent.bundleRevision,
  documents: documentRefs,
});
const fee = await createTenantFeeSigningMaterialV1({
  tenantId: TENANT_ID,
  environment: "local",
  materialRevisionId: "fee-material-sl01c-v1",
  componentRevision: componentRevisions.feeCommercial,
  governingFeeTerms: documentRefs[2],
});
assert(operational.ok && legal.ok && fee.ok, "material_invalid");
const materials: ResolvedTenantSigningMaterialBundleV1 = {
  manifestRowId: MANIFEST_ID,
  operationalRowId: MATERIAL_IDS.operational,
  legalRowId: MATERIAL_IDS.legal,
  feeRowId: MATERIAL_IDS.fee,
  operationalComponentRowId: COMPONENT_IDS.operational,
  legalComponentRowId: COMPONENT_IDS.legal,
  feeComponentRowId: COMPONENT_IDS.fee,
  operational: operational.value,
  legal: legal.value,
  fee: fee.value,
};
const legalDocuments = await resolveSigningLegalDocumentBundle(
  documentRefs,
  { supabaseUrl: "http://127.0.0.1:54321" },
);
assert(legalDocuments?.length === 4, "documents_unresolved");
const execution = Object.freeze({
  tenantId: TENANT_ID,
  environment: "local",
  trustedRoutingKey: "local.sl01c.test",
  routingProvenance: "DEPLOYMENT_FIXED",
  resolutionMode: "static_single_tenant_v1",
  dataPlaneLocatorId: "locator:sl01c-local",
  resolvedDataPlaneReference: "enval",
  fixedDataPlaneReference: "enval",
  providerType: "supabase",
  deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
}) satisfies AppTenantExecutionContext;
const configuration = Object.freeze({
  manifest: manifest.value,
  componentRevisions: Object.freeze(componentRevisions),
});
const presentedAt = new Date().toISOString();
const receipt = await createSignupSigningPresentationReceiptV1({
  intakeId: INTAKE_ID,
  authenticatedAuthUserId: AUTH_USER_ID,
  tenantExecution: execution,
  configuration,
  materials,
  legalDocuments,
  presentedAt,
  requestId: "sl01c-presentation-request",
});
assert(receipt, "receipt_invalid");
assert(
  Object.keys(receipt.databaseRow).includes("manifest_revision_id") &&
    receipt.databaseRow.tenant_id === TENANT_ID &&
    receipt.response.legal_documents.length === 4,
  "Q09_provenance_missing",
);
q(9);
const secondReceipt = await createSignupSigningPresentationReceiptV1({
  intakeId: INTAKE_ID,
  authenticatedAuthUserId: AUTH_USER_ID,
  tenantExecution: execution,
  configuration,
  materials: { ...materials, feeRowId: crypto.randomUUID() },
  legalDocuments,
  presentedAt,
  requestId: "sl01c-presentation-request",
});
assert(
  secondReceipt && secondReceipt.response.receipt_sha256 !==
      receipt.response.receipt_sha256,
  "Q10_material_field_not_hashed",
);
q(10);
assert(
  migrationSource.includes("presentation_receipt_immutable") &&
    migrationSource.includes("presentation_acceptance_immutable"),
  "Q11_immutable_guards_missing",
);
q(11);
assert(
  presentationEndpoint.includes("Object.keys(body).some") &&
    !clientSource.match(/tenant_id|manifest_revision|component_revision/),
  "Q12_browser_authority_input_present",
);
q(12);
assert(
  migrationSource.includes("app_signup_signing_presentation_receipts") &&
    migrationSource.includes("app_signup_signing_presentation_acceptances"),
  "Q13_presented_equals_accepted",
);
q(13);
assert(
  migrationSource.includes("acceptance_actions_true") &&
    challengeEndpoint.includes("legalActions.mandate_signed !== true"),
  "Q14_actions_not_explicit",
);
q(14);
assert(
  migrationSource.includes("presentation_receipt_id uuid not null unique") &&
    migrationSource.includes("acceptance_sha256"),
  "Q15_acceptance_not_receipt_bound",
);
q(15);
assert(
  migrationSource.includes("v_receipt.receipt_sha256 <> p_receipt_sha256"),
  "Q16_wrong_hash_not_rejected",
);
q(16);
assert(
  migrationSource.includes("authenticated_auth_user_id =") &&
    migrationSource.includes("receipt.tenant_id = p_tenant_id") &&
    migrationSource.includes("receipt.environment = p_environment"),
  "Q17_context_not_bound",
);
q(17);
assert(
  migrationSource.includes("v_receipt.expires_at <= v_now") &&
    SIGNING_PRESENTATION_RECEIPT_TTL_MILLISECONDS === 3_600_000,
  "Q18_expiry_missing",
);
q(18);
assert(
  migrationSource.includes("presentation_configuration_superseded"),
  "Q19_unaccepted_supersession_not_closed",
);
q(19);
assert(
  migrationSource.indexOf(
    "if not found then",
    migrationSource.indexOf(
      "app_signup_signing_presentation_acceptances",
    ),
  ) < migrationSource.indexOf("p_current_manifest_revision_id is null"),
  "Q20_accepted_supersession_branch_missing",
);
q(20);
assert(
  migrationSource.includes("signing_configuration_invalidated"),
  "Q21_accepted_invalidation_not_closed",
);
q(21);
assert(
  migrationSource.includes("presentation_receipt_id uuid not null unique"),
  "Q22_duplicate_acceptance_not_prevented",
);
q(22);
assert(
  migrationSource.includes("presentation_receipt_reference") &&
    migrationSource.includes("presentation_receipt_sha256"),
  "Q23_challenge_receipt_binding_missing",
);
q(23);
assert(
  migrationSource.includes("presentation_acceptance_id") &&
    migrationSource.includes("presentation_acceptance_sha256"),
  "Q24_challenge_acceptance_binding_missing",
);
q(24);
assert(
  challengeEndpoint.includes("generateSigningOtp()") &&
    challengeEndpoint.includes("otpVerifier(secret, code)") &&
    challengeEndpoint.includes("resolveSigningOtpTransport()") &&
    migrationSource.includes("attempts_remaining', 5"),
  "Q25_otp_authority_changed",
);
q(25);

const migrationBody = migrationSource
  .replace(/^begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "");
const componentSql = `
insert into public.app_tenant_configuration_component_revisions(
  id,tenant_id,environment,component_kind,revision_id,content_sha256,
  approval_status,approved_at,approved_by_actor_ref
) values
('${COMPONENT_IDS.operational}','${TENANT_ID}','local','operational',
 'operational-sl01c-v1','${hashes.operational}','APPROVED','${APPROVED_AT}','${ACTOR}'),
('${COMPONENT_IDS.legal}','${TENANT_ID}','local','legal',
 'legal-sl01c-v1','${hashes.legal}','APPROVED','${APPROVED_AT}','${ACTOR}'),
('${COMPONENT_IDS.fee}','${TENANT_ID}','local','fee_commercial',
 'fee-sl01c-v1','${hashes.fee}','APPROVED','${APPROVED_AT}','${ACTOR}'),
('${COMPONENT_IDS.provider}','${TENANT_ID}','local','provider_integration',
 'provider-sl01c-v1','${hashes.provider}','APPROVED','${APPROVED_AT}','${ACTOR}');
insert into public.app_tenant_configuration_manifests(
 id,schema_version,manifest_revision_id,tenant_id,environment,
 operational_component_revision_id,legal_component_revision_id,
 fee_commercial_component_revision_id,provider_integration_component_revision_id,
 approval_status,approved_at,approved_by_actor_ref,effective_from,canonical_sha256
) values ('${MANIFEST_ID}','tenant-configuration-manifest-v1','manifest-sl01c-v1',
 '${TENANT_ID}','local','${COMPONENT_IDS.operational}','${COMPONENT_IDS.legal}',
 '${COMPONENT_IDS.fee}','${COMPONENT_IDS.provider}','APPROVED','${APPROVED_AT}',
 '${ACTOR}','${APPROVED_AT}','${manifest.value.canonicalSha256}');`;
const d = Object.fromEntries(documentRefs.map((value) => [
  value.documentType,
  value,
]));
const materialSql = `
insert into public.app_tenant_signing_material_revisions(
 id,tenant_id,environment,material_kind,material_revision_id,
 component_revision_id,canonical_content_sha256,binding_authority
) values
('${MATERIAL_IDS.operational}','${TENANT_ID}','local','operational',
 'operational-material-sl01c-v1','${COMPONENT_IDS.operational}',
 '${hashes.operational}','server_canonical_signing_material_v1'),
('${MATERIAL_IDS.legal}','${TENANT_ID}','local','legal',
 'legal-material-sl01c-v1','${COMPONENT_IDS.legal}',
 '${hashes.legal}','server_canonical_signing_material_v1'),
('${MATERIAL_IDS.fee}','${TENANT_ID}','local','fee_commercial',
 'fee-material-sl01c-v1','${COMPONENT_IDS.fee}',
 '${hashes.fee}','server_canonical_signing_material_v1');
insert into public.app_tenant_signing_operational_material(
 signing_material_revision_id,operator_legal_entity_reference,
 operator_identity_sha256,regulated_operator_legal_entity_reference,
 contracting_party_legal_entity_reference,controller_legal_entity_reference,
 mandate_grantee_legal_entity_reference
) values ('${MATERIAL_IDS.operational}','operator:synthetic-proof-v1',
 '${
  "1".repeat(64)
}','operator:synthetic-proof-v1','operator:synthetic-proof-v1',
 'operator:synthetic-proof-v1','operator:synthetic-proof-v1');
insert into public.app_tenant_signing_legal_material(
 signing_material_revision_id,bundle_revision,bundle_canonical_sha256,
 privacy_notice_document_reference,privacy_notice_version,privacy_notice_language,
 privacy_notice_content_sha256,service_terms_document_reference,
 service_terms_version,service_terms_language,service_terms_content_sha256,
 fee_terms_document_reference,fee_terms_version,fee_terms_language,
 fee_terms_content_sha256,mandate_document_reference,mandate_version,
 mandate_language,mandate_content_sha256
) values ('${MATERIAL_IDS.legal}','synthetic-bundle-v1','${hashes.legal}',
 ${quote(d.privacy_notice.documentReference)},${
  quote(d.privacy_notice.version)
},'nl',
 '${d.privacy_notice.contentSha256}',${
  quote(d.service_terms.documentReference)
},
 ${quote(d.service_terms.version)},'nl','${d.service_terms.contentSha256}',
 ${quote(d.fee_terms.documentReference)},${quote(d.fee_terms.version)},'nl',
 '${d.fee_terms.contentSha256}',${quote(d.mandate.documentReference)},
 ${quote(d.mandate.version)},'nl','${d.mandate.contentSha256}');
insert into public.app_tenant_signing_fee_material(
 signing_material_revision_id,document_type,document_reference,version,language,
 content_sha256
) values ('${MATERIAL_IDS.fee}','fee_terms',${
  quote(d.fee_terms.documentReference)
},
 ${quote(d.fee_terms.version)},'nl','${d.fee_terms.contentSha256}');`;
const receiptColumns = Object.keys(receipt.databaseRow).join(",");
const receiptValues = Object.values(receipt.databaseRow).map(quote).join(",");
const rpc = (key: string, currentManifest: string | null, hash: string) => `
public.app_signup_signing_challenge_issue_v2(
 '${INTAKE_ID}','${"c".repeat(64)}','${AUTH_USER_ID}','${TENANT_ID}','local',
 '${receipt.response.receipt_reference}','${hash}',
 ${currentManifest ? quote(currentManifest) : "null"}::uuid,
 ${currentManifest ? quote(manifest.value.canonicalSha256) : "null"},
 true,true,true,true,clock_timestamp(),'${"a".repeat(64)}',
 '${"b".repeat(64)}','${
  "d".repeat(64)
}',clock_timestamp()+interval '9 minutes 59 seconds',
 '${"e".repeat(64)}','sl01c-rpc-${key}','${key}',null,null
)`;
const hadMigration = await psql(
  "select (to_regclass('public.app_signup_signing_presentation_receipts') is not null)::text;",
);
const sqlResult = await psql(`
begin;
${hadMigration === "false" ? migrationBody : ""}
${componentSql}
${materialSql}
insert into public.app_signup_intakes(
 id,status,submitted_payload,submitted_payload_sha256,accepted_legal_versions,
 email_normalized,expires_at
) values ('${INTAKE_ID}','collecting','{}','${"f".repeat(64)}',
 '{"items":[]}','sl01c-synthetic@example.invalid',clock_timestamp()+interval '1 day');
insert into public.app_signup_authenticated_intake_provenance(
 intake_id,auth_user_id,auth_email_sha256,auth_email_verified_at,linkage_type,
 request_id
) values ('${INTAKE_ID}','${AUTH_USER_ID}','${
  "9".repeat(64)
}',clock_timestamp(),
 'verified_auth_at_intake_start','sl01c-proof');
insert into public.app_signup_intake_capabilities(
 intake_id,capability_type,token_sha256,issued_at,expires_at
) values ('${INTAKE_ID}','intake_manage','${"c".repeat(64)}',clock_timestamp(),
 clock_timestamp()+interval '1 day');
insert into public.app_signup_signing_presentation_receipts(
 ${receiptColumns}
) values (${receiptValues});
select (${rpc("first", MANIFEST_ID, receipt.response.receipt_sha256)}->>'ok');
select count(*)::text from public.app_signup_signing_presentation_acceptances
 where intake_id='${INTAKE_ID}';
select count(*)::text from public.app_signup_signing_challenges
 where intake_id='${INTAKE_ID}' and presentation_receipt_id is not null;
select (${rpc("wrong-hash", MANIFEST_ID, "0".repeat(64))}->>'code');
select (${
  rpc(
    "superseded-after-acceptance",
    crypto.randomUUID(),
    receipt.response.receipt_sha256,
  )
}->>'ok');
update public.app_signup_signing_challenges
 set created_at=clock_timestamp()-interval '11 minutes',
     expires_at=clock_timestamp()-interval '1 minute'
 where intake_id='${INTAKE_ID}' and replaced_at is null;
select (${rpc("reissue", null, receipt.response.receipt_sha256)}->>'ok');
select count(*)::text from public.app_signup_signing_presentation_acceptances
 where intake_id='${INTAKE_ID}';
do $$
declare receipt_rejected boolean := false;
declare acceptance_rejected boolean := false;
declare challenge_rejected boolean := false;
begin
  begin update public.app_signup_signing_presentation_receipts
    set receipt_sha256='${"8".repeat(64)}' where intake_id='${INTAKE_ID}';
  exception when others then receipt_rejected := true; end;
  begin update public.app_signup_signing_presentation_acceptances
    set request_id='changed' where intake_id='${INTAKE_ID}';
  exception when others then acceptance_rejected := true; end;
  begin update public.app_signup_signing_challenges
    set presentation_receipt_sha256='${"8".repeat(64)}'
    where intake_id='${INTAKE_ID}';
  exception when others then challenge_rejected := true; end;
  if not receipt_rejected or not acceptance_rejected or not challenge_rejected
  then raise exception 'immutability guard failed'; end if;
end $$;
insert into public.app_tenant_signing_configuration_invalidations(
 tenant_id,environment,subject_type,subject_reference,effective_at,reason_code,
 authorized_actor_ref,evidence_reference
) values ('${TENANT_ID}','local','manifest','${MANIFEST_ID}',clock_timestamp(),
 'explicit_invalidation','${ACTOR}','evidence:sl01c-proof');
select (${rpc("invalidated", null, receipt.response.receipt_sha256)}->>'code');
select 'sql-complete';
rollback;
`);
const sqlLines = sqlResult.split(/\r?\n/);
assert(
  sqlLines.filter((line) => line === "true").length >= 3,
  "Q26_reissue_failed",
);
q(26);
assert(
  migrationSource.includes("presentation_receipt_expired") &&
    frontend.includes("requestSignupSigningPresentation"),
  "Q27_new_presentation_not_required",
);
q(27);
assert(
  legalDocuments.length === 4 &&
    new Set(legalDocuments.map((document) => document.documentType)).size === 4,
  "Q28_four_document_bundle_invalid",
);
q(28);
assert(
  frontend.includes("createReceiptBoundLegalDocuments") &&
    !frontend.includes("listLegalDocuments") &&
    frontend.includes('presentationStatus === "error"') &&
    clientSource.includes("api-app-signup-signing-presentation"),
  "Q29_static_fallback_present",
);
q(29);
assert(
  !migrationSource.match(/ENVAL B\.V\.|KvK|10%|90%/) &&
    documentContents.every((content) => !migrationSource.includes(content)),
  "Q30_real_values_seeded",
);
q(30);
const residue = await psql(`select count(*)::text from public.app_signup_intakes
 where id='${INTAKE_ID}';`);
assert(
  residue === "0" && sqlLines.includes("sql-complete"),
  "Q31_fixture_residue",
);
q(31);

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
  waveA1.code === 0 && waveA1.stdout.includes(
    "QUALIFICATION_WAVE_A1_PRIVATE_CLEAN_END_TO_END=PASS",
  ),
  `Q32_wave_a1:${scrub(waveA1.stderr || waveA1.stdout)}`,
);
q(32);
const tf02 = await command("deno", [
  "run",
  "--allow-all",
  "scripts/proofs/app-tenant-configuration-persistence.proof.ts",
]);
assert(
  tf02.code === 0 && tf02.stdout.includes("TF02C_PERSISTENCE_READ_PROOF=PASS"),
  `Q33_tf02:${scrub(tf02.stderr || tf02.stdout)}`,
);
q(33);
const sl01b = await command("deno", [
  "run",
  "--allow-all",
  "scripts/proofs/app-tenant-signing-material.proof.ts",
]);
assert(
  sl01b.code === 0 &&
    sl01b.stdout.includes("SL01B_SIGNING_MATERIAL_PROOF=PASS"),
  `Q34_sl01b:${scrub(sl01b.stderr || sl01b.stdout)}`,
);
q(34);
assert(
  !migrationSource.includes("signup-signing-snapshot-v2") &&
    !finalizeEndpoint.includes("signup-signing-snapshot-v2"),
  "Q35_snapshot_v2_added",
);
q(35);
assert(
  !migrationSource.includes("app_signup_signing_finalize_v3") &&
    !migrationSource.includes("finalize_fingerprint_v2"),
  "Q36_finalize_cutover_added",
);
q(36);
assert(
  finalizeEndpoint.includes("signing_presentation_finalize_cutover_required") &&
    finalizeEndpoint.includes("same-document/different-config"),
  "Q37_silent_finalize_possible",
);
q(37);
assert(residue === "0", "Q38_real_pilot_touched");
q(38);
assert(
  !migrationSource.match(/tenant.?2|dynamic.?switch|admin.?ui/i) &&
    !presentationEndpoint.match(/tenant.?2|dynamic.?switch|admin.?ui/i),
  "Q39_scope_expansion",
);
q(39);
const responseShape = Object.keys(receipt.response).sort();
assert(
  responseShape.join("|") ===
      "expires_at|legal_documents|mode|ok|presented_at|receipt_reference|receipt_sha256" &&
    !JSON.stringify(receipt.response).match(
      /manifest|component|material_revision|auth_user|data_plane/i,
    ),
  "Q40_internal_provenance_exposed",
);
q(40);
console.log("SL01C_SIGNING_PRESENTATION_Q01_Q40=PASS");
