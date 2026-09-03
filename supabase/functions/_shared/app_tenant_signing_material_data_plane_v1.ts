import type { ResolvedTenantConfigurationV1 } from "./app_tenant_configuration.ts";
import {
  createTenantFeeSigningMaterialV1,
  createTenantLegalSigningMaterialV1,
  createTenantOperationalSigningMaterialV1,
  type TenantFeeSigningMaterialV1,
  type TenantLegalSigningMaterialV1,
  type TenantOperationalSigningMaterialV1,
} from "./app_tenant_signing_material.ts";
import type { AppTenantExecutionContext } from "./app_tenant_resolution_shadow.ts";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;
type FilteredQuery =
  & PromiseLike<QueryResult>
  & Readonly<{
    eq(column: string, value: string): FilteredQuery;
    limit(count: number): FilteredQuery;
  }>;

export type TenantSigningMaterialDataPlaneClient = Readonly<{
  from(table: string): Readonly<{
    select(columns: string): FilteredQuery;
  }>;
}>;

export type ResolvedTenantSigningMaterialBundleV1 = Readonly<{
  manifestRowId: string;
  operationalRowId: string;
  legalRowId: string;
  feeRowId: string;
  operationalComponentRowId: string;
  legalComponentRowId: string;
  feeComponentRowId: string;
  operational: TenantOperationalSigningMaterialV1;
  legal: TenantLegalSigningMaterialV1;
  fee: TenantFeeSigningMaterialV1;
}>;

export type TenantSigningMaterialDataPlaneResult =
  | Readonly<{ ok: true; value: ResolvedTenantSigningMaterialBundleV1 }>
  | Readonly<{
    ok: false;
    code:
      | "signing_material_missing"
      | "signing_material_ambiguous"
      | "signing_material_invalid"
      | "signing_material_invalidated"
      | "signing_material_source_unavailable";
  }>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rows(result: QueryResult, maximum: number) {
  if (
    result.error || !Array.isArray(result.data) || result.data.length > maximum
  ) return null;
  const values = result.data.map(record);
  return values.every(Boolean) ? values as Record<string, unknown>[] : null;
}

function exactlyOne(
  values: readonly Record<string, unknown>[],
  predicate: (value: Record<string, unknown>) => boolean,
): Record<string, unknown> | null | "ambiguous" {
  const matches = values.filter(predicate);
  return matches.length === 1
    ? matches[0]
    : matches.length
    ? "ambiguous"
    : null;
}

async function childRow(
  client: TenantSigningMaterialDataPlaneClient,
  table: string,
  columns: string,
  materialRowId: string,
): Promise<Record<string, unknown> | null | "ambiguous" | "unavailable"> {
  const result = rows(
    await client.from(table).select(columns)
      .eq("signing_material_revision_id", materialRowId).limit(2),
    1,
  );
  if (!result) return "unavailable";
  return result.length === 1 ? result[0] : result.length ? "ambiguous" : null;
}

export async function resolveTenantSigningMaterialBundleV1(
  client: TenantSigningMaterialDataPlaneClient,
  context: AppTenantExecutionContext,
  configuration: ResolvedTenantConfigurationV1,
  evaluationTime: string,
): Promise<TenantSigningMaterialDataPlaneResult> {
  const evaluatedAt = Date.parse(evaluationTime);
  if (!Number.isFinite(evaluatedAt)) {
    return { ok: false, code: "signing_material_invalid" };
  }
  try {
    const componentRows = rows(
      await client.from("app_tenant_configuration_component_revisions")
        .select("id,component_kind,revision_id,content_sha256")
        .eq("tenant_id", context.tenantId)
        .eq("environment", context.environment).limit(1_025),
      1_024,
    );
    const manifestRows = rows(
      await client.from("app_tenant_configuration_manifests")
        .select("id,manifest_revision_id,canonical_sha256")
        .eq("tenant_id", context.tenantId)
        .eq("environment", context.environment).limit(257),
      256,
    );
    const materialRows = rows(
      await client.from("app_tenant_signing_material_revisions")
        .select(
          "id,material_kind,material_revision_id,component_revision_id,canonical_content_sha256,binding_authority",
        )
        .eq("tenant_id", context.tenantId)
        .eq("environment", context.environment).limit(65),
      64,
    );
    if (!componentRows || !manifestRows || !materialRows) {
      return { ok: false, code: "signing_material_source_unavailable" };
    }

    const component = (
      kind: "operational" | "legal" | "fee_commercial",
      revisionId: string,
      contentSha256: string,
    ) =>
      exactlyOne(componentRows, (row) =>
        text(row.component_kind) === kind &&
        text(row.revision_id) === revisionId &&
        text(row.content_sha256) === contentSha256 && UUID.test(text(row.id)));
    const operationalComponent = component(
      "operational",
      configuration.componentRevisions.operational.revisionId,
      configuration.componentRevisions.operational.contentSha256,
    );
    const legalComponent = component(
      "legal",
      configuration.componentRevisions.legal.revisionId,
      configuration.componentRevisions.legal.contentSha256,
    );
    const feeComponent = component(
      "fee_commercial",
      configuration.componentRevisions.feeCommercial.revisionId,
      configuration.componentRevisions.feeCommercial.contentSha256,
    );
    const manifest = exactlyOne(
      manifestRows,
      (row) =>
        text(row.manifest_revision_id) ===
          configuration.manifest.manifestRevisionId &&
        text(row.canonical_sha256) === configuration.manifest.canonicalSha256 &&
        UUID.test(text(row.id)),
    );
    if (
      operationalComponent === "ambiguous" ||
      legalComponent === "ambiguous" || feeComponent === "ambiguous" ||
      manifest === "ambiguous"
    ) return { ok: false, code: "signing_material_ambiguous" };
    if (
      !operationalComponent || !legalComponent || !feeComponent || !manifest
    ) {
      return { ok: false, code: "signing_material_missing" };
    }

    const material = (kind: string, componentRowId: string) =>
      exactlyOne(materialRows, (row) =>
        text(row.material_kind) === kind &&
        text(row.component_revision_id) === componentRowId &&
        text(row.binding_authority) ===
          "server_canonical_signing_material_v1" &&
        UUID.test(text(row.id)));
    const operationalRoot = material(
      "operational",
      text(operationalComponent.id),
    );
    const legalRoot = material("legal", text(legalComponent.id));
    const feeRoot = material("fee_commercial", text(feeComponent.id));
    if (
      operationalRoot === "ambiguous" || legalRoot === "ambiguous" ||
      feeRoot === "ambiguous"
    ) {
      return { ok: false, code: "signing_material_ambiguous" };
    }
    if (!operationalRoot || !legalRoot || !feeRoot) {
      return { ok: false, code: "signing_material_missing" };
    }

    const [operationalChild, legalChild, feeChild] = await Promise.all([
      childRow(
        client,
        "app_tenant_signing_operational_material",
        "operator_legal_entity_reference,operator_identity_sha256,regulated_operator_legal_entity_reference,contracting_party_legal_entity_reference,controller_legal_entity_reference,mandate_grantee_legal_entity_reference",
        text(operationalRoot.id),
      ),
      childRow(
        client,
        "app_tenant_signing_legal_material",
        "bundle_revision,privacy_notice_document_reference,privacy_notice_version,privacy_notice_language,privacy_notice_content_sha256,service_terms_document_reference,service_terms_version,service_terms_language,service_terms_content_sha256,fee_terms_document_reference,fee_terms_version,fee_terms_language,fee_terms_content_sha256,mandate_document_reference,mandate_version,mandate_language,mandate_content_sha256",
        text(legalRoot.id),
      ),
      childRow(
        client,
        "app_tenant_signing_fee_material",
        "document_type,document_reference,version,language,content_sha256",
        text(feeRoot.id),
      ),
    ]);
    if (
      operationalChild === "ambiguous" || legalChild === "ambiguous" ||
      feeChild === "ambiguous"
    ) return { ok: false, code: "signing_material_ambiguous" };
    if (
      operationalChild === "unavailable" || legalChild === "unavailable" ||
      feeChild === "unavailable"
    ) return { ok: false, code: "signing_material_source_unavailable" };
    if (!operationalChild || !legalChild || !feeChild) {
      return { ok: false, code: "signing_material_missing" };
    }

    const documents = ([
      ["privacy_notice", "privacy_notice"],
      ["service_terms", "service_terms"],
      ["fee_terms", "fee_terms"],
      ["mandate", "mandate"],
    ] as const).map(([prefix, documentType]) => ({
      documentReference: text(legalChild[`${prefix}_document_reference`]),
      documentType,
      version: text(legalChild[`${prefix}_version`]),
      language: text(legalChild[`${prefix}_language`]),
      contentSha256: text(legalChild[`${prefix}_content_sha256`]),
    }));
    const operational = await createTenantOperationalSigningMaterialV1({
      tenantId: context.tenantId,
      environment: context.environment,
      materialRevisionId: text(operationalRoot.material_revision_id),
      componentRevision: configuration.componentRevisions.operational,
      operatorLegalEntityReference: text(
        operationalChild.operator_legal_entity_reference,
      ),
      operatorIdentitySha256: text(operationalChild.operator_identity_sha256),
      roleBindings: {
        regulatedOperatorLegalEntityReference: text(
          operationalChild.regulated_operator_legal_entity_reference,
        ),
        contractingPartyLegalEntityReference: text(
          operationalChild.contracting_party_legal_entity_reference,
        ),
        mandateGranteeLegalEntityReference: text(
          operationalChild.mandate_grantee_legal_entity_reference,
        ),
        ...(operationalChild.controller_legal_entity_reference === null ? {} : {
          controllerLegalEntityReference: text(
            operationalChild.controller_legal_entity_reference,
          ),
        }),
      },
    });
    const legal = await createTenantLegalSigningMaterialV1({
      tenantId: context.tenantId,
      environment: context.environment,
      materialRevisionId: text(legalRoot.material_revision_id),
      componentRevision: configuration.componentRevisions.legal,
      bundleRevision: text(legalChild.bundle_revision),
      documents,
    });
    const fee = await createTenantFeeSigningMaterialV1({
      tenantId: context.tenantId,
      environment: context.environment,
      materialRevisionId: text(feeRoot.material_revision_id),
      componentRevision: configuration.componentRevisions.feeCommercial,
      governingFeeTerms: {
        documentReference: text(feeChild.document_reference),
        documentType: text(feeChild.document_type),
        version: text(feeChild.version),
        language: text(feeChild.language),
        contentSha256: text(feeChild.content_sha256),
      },
    });
    if (!operational.ok || !legal.ok || !fee.ok) {
      return { ok: false, code: "signing_material_invalid" };
    }
    const feeTerms = legal.value.content.documents.find((document) =>
      document.documentType === "fee_terms"
    );
    if (
      !feeTerms ||
      JSON.stringify(feeTerms) !==
        JSON.stringify(fee.value.content.governingFeeTerms)
    ) return { ok: false, code: "signing_material_invalid" };

    const invalidations = rows(
      await client.from("app_tenant_signing_configuration_invalidations")
        .select("subject_type,subject_reference,effective_at")
        .eq("tenant_id", context.tenantId)
        .eq("environment", context.environment).limit(257),
      256,
    );
    if (!invalidations) {
      return { ok: false, code: "signing_material_source_unavailable" };
    }
    const protectedReferences = new Set([
      text(manifest.id),
      text(operationalComponent.id),
      text(legalComponent.id),
      text(feeComponent.id),
      text(operationalRoot.id),
      text(legalRoot.id),
      text(feeRoot.id),
    ]);
    if (
      invalidations.some((row) =>
        protectedReferences.has(text(row.subject_reference)) &&
        Date.parse(text(row.effective_at)) <= evaluatedAt
      )
    ) return { ok: false, code: "signing_material_invalidated" };

    return {
      ok: true,
      value: Object.freeze({
        manifestRowId: text(manifest.id),
        operationalRowId: text(operationalRoot.id),
        legalRowId: text(legalRoot.id),
        feeRowId: text(feeRoot.id),
        operationalComponentRowId: text(operationalComponent.id),
        legalComponentRowId: text(legalComponent.id),
        feeComponentRowId: text(feeComponent.id),
        operational: operational.value,
        legal: legal.value,
        fee: fee.value,
      }),
    };
  } catch (_error) {
    return { ok: false, code: "signing_material_source_unavailable" };
  }
}
