import { payloadHash } from "./app_foundation.ts";
import type { ResolvedTenantConfigurationV1 } from "./app_tenant_configuration.ts";
import type { ResolvedTenantSigningMaterialBundleV1 } from "./app_tenant_signing_material_data_plane_v1.ts";
import type { AppTenantExecutionContext } from "./app_tenant_resolution_shadow.ts";
import type { ResolvedSigningLegalDocument } from "./signing_legal_runtime.ts";

export const SIGNING_PRESENTATION_RECEIPT_TTL_MILLISECONDS = 60 * 60 * 1_000;
export const SIGNING_PRESENTATION_RECEIPT_SCHEMA_VERSION =
  "signup-signing-presentation-receipt-v1" as const;

export type SignupSigningPresentationReceiptV1 = Readonly<{
  databaseRow: Readonly<Record<string, string>>;
  response: Readonly<{
    ok: true;
    mode: "signup_signing_presentation_v1";
    receipt_reference: string;
    receipt_sha256: string;
    presented_at: string;
    expires_at: string;
    legal_documents: readonly Readonly<{
      document_type: ResolvedSigningLegalDocument["documentType"];
      version: string;
      language: "nl";
      title: string;
      canonical_content: string;
      content_sha256: string;
      effective_from: string | null;
    }>[];
  }>;
}>;

export async function createSignupSigningPresentationReceiptV1(input: {
  intakeId: string;
  authenticatedAuthUserId: string;
  tenantExecution: AppTenantExecutionContext;
  configuration: ResolvedTenantConfigurationV1;
  materials: ResolvedTenantSigningMaterialBundleV1;
  legalDocuments: readonly ResolvedSigningLegalDocument[];
  presentedAt: string;
  requestId: string;
}): Promise<SignupSigningPresentationReceiptV1 | null> {
  const presentedTime = Date.parse(input.presentedAt);
  if (
    !Number.isFinite(presentedTime) || input.legalDocuments.length !== 4 ||
    new Set(input.legalDocuments.map((document) => document.documentType))
        .size !== 4
  ) return null;
  const expiresAt = new Date(
    presentedTime + SIGNING_PRESENTATION_RECEIPT_TTL_MILLISECONDS,
  ).toISOString();
  const documents = input.legalDocuments.map((document) =>
    Object.freeze({
      document_type: document.documentType,
      document_reference: document.documentReference,
      version: document.version,
      language: document.language,
      title: document.title,
      content_sha256: document.contentSha256,
    })
  );
  const hashInput = Object.freeze({
    schema_version: SIGNING_PRESENTATION_RECEIPT_SCHEMA_VERSION,
    intake_id: input.intakeId,
    authenticated_auth_user_id: input.authenticatedAuthUserId,
    tenant_id: input.tenantExecution.tenantId,
    environment: input.tenantExecution.environment,
    data_plane_locator_id: input.tenantExecution.dataPlaneLocatorId,
    resolved_data_plane_reference:
      input.tenantExecution.resolvedDataPlaneReference,
    manifest_revision_id: input.materials.manifestRowId,
    manifest_canonical_sha256: input.configuration.manifest.canonicalSha256,
    operational_component_revision_id:
      input.materials.operationalComponentRowId,
    legal_component_revision_id: input.materials.legalComponentRowId,
    fee_component_revision_id: input.materials.feeComponentRowId,
    operational_signing_material_revision_id: input.materials.operationalRowId,
    operational_signing_material_sha256:
      input.materials.operational.canonicalContentSha256,
    legal_signing_material_revision_id: input.materials.legalRowId,
    legal_signing_material_sha256: input.materials.legal.canonicalContentSha256,
    fee_signing_material_revision_id: input.materials.feeRowId,
    fee_signing_material_sha256: input.materials.fee.canonicalContentSha256,
    legal_bundle_revision: input.materials.legal.content.bundleRevision,
    legal_bundle_sha256: input.materials.legal.canonicalContentSha256,
    documents,
    presented_at: input.presentedAt,
    expires_at: expiresAt,
    request_id: input.requestId,
  });
  const receiptSha256 = await payloadHash(hashInput);
  const receiptReference = `SPR-${crypto.randomUUID()}`;
  const byType = new Map(
    input.legalDocuments.map((document) => [document.documentType, document]),
  );
  const privacy = byType.get("privacy_notice");
  const service = byType.get("service_terms");
  const fee = byType.get("fee_terms");
  const mandate = byType.get("mandate");
  if (!privacy || !service || !fee || !mandate) return null;
  const databaseRow = Object.freeze({
    receipt_reference: receiptReference,
    receipt_sha256: receiptSha256,
    receipt_schema_version: SIGNING_PRESENTATION_RECEIPT_SCHEMA_VERSION,
    intake_id: input.intakeId,
    authenticated_auth_user_id: input.authenticatedAuthUserId,
    tenant_id: input.tenantExecution.tenantId,
    environment: input.tenantExecution.environment,
    data_plane_locator_id: input.tenantExecution.dataPlaneLocatorId,
    resolved_data_plane_reference:
      input.tenantExecution.resolvedDataPlaneReference,
    manifest_revision_id: input.materials.manifestRowId,
    manifest_canonical_sha256: input.configuration.manifest.canonicalSha256,
    operational_component_revision_id:
      input.materials.operationalComponentRowId,
    legal_component_revision_id: input.materials.legalComponentRowId,
    fee_component_revision_id: input.materials.feeComponentRowId,
    operational_signing_material_revision_id: input.materials.operationalRowId,
    operational_signing_material_sha256:
      input.materials.operational.canonicalContentSha256,
    legal_signing_material_revision_id: input.materials.legalRowId,
    legal_signing_material_sha256: input.materials.legal.canonicalContentSha256,
    fee_signing_material_revision_id: input.materials.feeRowId,
    fee_signing_material_sha256: input.materials.fee.canonicalContentSha256,
    legal_bundle_revision: input.materials.legal.content.bundleRevision,
    legal_bundle_sha256: input.materials.legal.canonicalContentSha256,
    privacy_notice_document_reference: privacy.documentReference,
    privacy_notice_version: privacy.version,
    privacy_notice_language: privacy.language,
    privacy_notice_content_sha256: privacy.contentSha256,
    service_terms_document_reference: service.documentReference,
    service_terms_version: service.version,
    service_terms_language: service.language,
    service_terms_content_sha256: service.contentSha256,
    fee_terms_document_reference: fee.documentReference,
    fee_terms_version: fee.version,
    fee_terms_language: fee.language,
    fee_terms_content_sha256: fee.contentSha256,
    mandate_document_reference: mandate.documentReference,
    mandate_version: mandate.version,
    mandate_language: mandate.language,
    mandate_content_sha256: mandate.contentSha256,
    presented_at: input.presentedAt,
    expires_at: expiresAt,
    request_id: input.requestId,
  });
  return Object.freeze({
    databaseRow,
    response: Object.freeze({
      ok: true,
      mode: "signup_signing_presentation_v1",
      receipt_reference: receiptReference,
      receipt_sha256: receiptSha256,
      presented_at: input.presentedAt,
      expires_at: expiresAt,
      legal_documents: Object.freeze(
        input.legalDocuments.map((document) =>
          Object.freeze({
            document_type: document.documentType,
            version: document.version,
            language: document.language,
            title: document.title,
            canonical_content: document.canonicalContent,
            content_sha256: document.contentSha256,
            effective_from: document.effectiveFrom,
          })
        ),
      ),
    }),
  });
}
