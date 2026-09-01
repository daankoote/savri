import { payloadHash } from "./app_foundation.ts";
import {
  type ApprovedTenantConfigurationComponentRevision,
  validateApprovedTenantConfigurationComponentRevision,
} from "./app_tenant_configuration.ts";
import {
  type SigningLegalDocumentType,
  signingSha256Hex,
} from "./signing_legal_runtime.ts";
import {
  isValidTenantReference,
} from "../../../platform/runtime/tenant-resolution/tenant_resolution.ts";

export const TENANT_SIGNING_MATERIAL_BINDING_AUTHORITY =
  "server_canonical_signing_material_v1" as const;

export const TENANT_SIGNING_MATERIAL_KINDS = Object.freeze(
  [
    "operational",
    "legal",
    "fee_commercial",
  ] as const,
);

export const TENANT_SIGNING_INVALIDATION_SUBJECT_TYPES = Object.freeze(
  [
    "manifest",
    "component_revision",
    "signing_material_revision",
  ] as const,
);

export type TenantSigningMaterialKind =
  typeof TENANT_SIGNING_MATERIAL_KINDS[number];
export type TenantSigningInvalidationSubjectType =
  typeof TENANT_SIGNING_INVALIDATION_SUBJECT_TYPES[number];

export type SigningLegalDocumentReferenceV1 = Readonly<{
  documentReference: string;
  documentType: SigningLegalDocumentType;
  version: string;
  language: "nl";
  contentSha256: string;
}>;

export type OperationalSigningMaterialContentV1 = Readonly<{
  schemaVersion: "tenant-signing-operational-material-v1";
  operatorLegalEntityReference: string;
  operatorIdentitySha256: string;
  roleBindings: Readonly<{
    regulatedOperatorLegalEntityReference: string;
    contractingPartyLegalEntityReference: string;
    mandateGranteeLegalEntityReference: string;
    controllerLegalEntityReference?: string;
  }>;
}>;

export type LegalSigningMaterialContentV1 = Readonly<{
  schemaVersion: "tenant-signing-legal-material-v1";
  bundleRevision: string;
  documents: readonly SigningLegalDocumentReferenceV1[];
}>;

export type FeeSigningMaterialContentV1 = Readonly<{
  schemaVersion: "tenant-signing-fee-material-v1";
  governingFeeTerms: SigningLegalDocumentReferenceV1;
}>;

type TenantSigningMaterialBindingV1<
  TKind extends TenantSigningMaterialKind,
  TContent,
> = Readonly<{
  tenantId: string;
  environment: string;
  materialKind: TKind;
  materialRevisionId: string;
  componentRevision: ApprovedTenantConfigurationComponentRevision;
  content: TContent;
  canonicalContentSha256: string;
  bindingAuthority: typeof TENANT_SIGNING_MATERIAL_BINDING_AUTHORITY;
}>;

export type TenantOperationalSigningMaterialV1 = TenantSigningMaterialBindingV1<
  "operational",
  OperationalSigningMaterialContentV1
>;
export type TenantLegalSigningMaterialV1 = TenantSigningMaterialBindingV1<
  "legal",
  LegalSigningMaterialContentV1
>;
export type TenantFeeSigningMaterialV1 = TenantSigningMaterialBindingV1<
  "fee_commercial",
  FeeSigningMaterialContentV1
>;

export type TenantSigningMaterialFailureCode =
  | "material_invalid"
  | "component_revision_invalid"
  | "component_kind_mismatch"
  | "material_hash_mismatch";

export type TenantSigningMaterialResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: TenantSigningMaterialFailureCode }>;

export type TenantSigningConfigurationInvalidationV1 = Readonly<{
  tenantId: string;
  environment: string;
  subjectType: TenantSigningInvalidationSubjectType;
  subjectReference: string;
  effectiveAt: string;
  reasonCode: "explicit_invalidation";
  authorizedActorRef: string;
  evidenceReference: string;
}>;

type JsonRecord = Record<string, unknown>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const LEGAL_DOCUMENT_TYPES = Object.freeze(
  [
    "privacy_notice",
    "service_terms",
    "fee_terms",
    "mandate",
  ] as const satisfies readonly SigningLegalDocumentType[],
);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function validReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

function validRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION_PATTERN.test(value);
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function validEnvironment(value: unknown): value is string {
  return typeof value === "string" && ENVIRONMENT_PATTERN.test(value);
}

function validCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value;
}

function validateContextAndRevision(
  input: JsonRecord,
  expectedKind: TenantSigningMaterialKind,
):
  | Readonly<{
    tenantId: string;
    environment: string;
    materialRevisionId: string;
    componentRevision: ApprovedTenantConfigurationComponentRevision;
  }>
  | TenantSigningMaterialFailureCode {
  if (
    !isValidTenantReference(input.tenantId) ||
    !validEnvironment(input.environment) ||
    !validRevision(input.materialRevisionId)
  ) return "material_invalid";
  const componentRevision =
    validateApprovedTenantConfigurationComponentRevision(
      input.componentRevision,
    );
  if (!componentRevision) return "component_revision_invalid";
  if (componentRevision.componentKind !== expectedKind) {
    return "component_kind_mismatch";
  }
  return Object.freeze({
    tenantId: input.tenantId as string,
    environment: input.environment,
    materialRevisionId: input.materialRevisionId,
    componentRevision,
  });
}

function validateDocumentReference(
  input: unknown,
): SigningLegalDocumentReferenceV1 | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "contentSha256",
      "documentReference",
      "documentType",
      "language",
      "version",
    ]) ||
    !validReference(input.documentReference) ||
    !LEGAL_DOCUMENT_TYPES.includes(
      input.documentType as SigningLegalDocumentType,
    ) ||
    !validRevision(input.version) ||
    input.language !== "nl" ||
    !validSha256(input.contentSha256)
  ) return null;
  return Object.freeze({
    documentReference: input.documentReference,
    documentType: input.documentType as SigningLegalDocumentType,
    version: input.version,
    language: "nl",
    contentSha256: input.contentSha256,
  });
}

export async function createSigningLegalDocumentReferenceV1(
  input: unknown,
): Promise<SigningLegalDocumentReferenceV1 | null> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "canonicalContent",
      "documentReference",
      "documentType",
      "language",
      "version",
    ]) ||
    typeof input.canonicalContent !== "string" ||
    !input.canonicalContent.trim()
  ) return null;
  return validateDocumentReference({
    documentReference: input.documentReference,
    documentType: input.documentType,
    version: input.version,
    language: input.language,
    contentSha256: await signingSha256Hex(input.canonicalContent),
  });
}

async function bindMaterial<TKind extends TenantSigningMaterialKind, TContent>(
  context: Exclude<
    ReturnType<typeof validateContextAndRevision>,
    TenantSigningMaterialFailureCode
  >,
  materialKind: TKind,
  content: TContent,
): Promise<
  TenantSigningMaterialResult<
    TenantSigningMaterialBindingV1<TKind, TContent>
  >
> {
  const canonicalContentSha256 = await payloadHash(content);
  if (canonicalContentSha256 !== context.componentRevision.contentSha256) {
    return { ok: false, code: "material_hash_mismatch" };
  }
  return {
    ok: true,
    value: Object.freeze({
      tenantId: context.tenantId,
      environment: context.environment,
      materialKind,
      materialRevisionId: context.materialRevisionId,
      componentRevision: context.componentRevision,
      content,
      canonicalContentSha256,
      bindingAuthority: TENANT_SIGNING_MATERIAL_BINDING_AUTHORITY,
    }),
  };
}

export async function operationalSigningMaterialCanonicalSha256V1(
  content: OperationalSigningMaterialContentV1,
): Promise<string> {
  return await payloadHash(content);
}

export async function legalSigningMaterialCanonicalSha256V1(
  content: LegalSigningMaterialContentV1,
): Promise<string> {
  return await payloadHash(content);
}

export async function feeSigningMaterialCanonicalSha256V1(
  content: FeeSigningMaterialContentV1,
): Promise<string> {
  return await payloadHash(content);
}

export async function createTenantOperationalSigningMaterialV1(
  input: unknown,
): Promise<TenantSigningMaterialResult<TenantOperationalSigningMaterialV1>> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "componentRevision",
      "environment",
      "materialRevisionId",
      "operatorIdentitySha256",
      "operatorLegalEntityReference",
      "roleBindings",
      "tenantId",
    ]) ||
    !validReference(input.operatorLegalEntityReference) ||
    !validSha256(input.operatorIdentitySha256) ||
    !isRecord(input.roleBindings) ||
    !hasExactKeys(
      input.roleBindings,
      [
        "contractingPartyLegalEntityReference",
        "mandateGranteeLegalEntityReference",
        "regulatedOperatorLegalEntityReference",
      ],
      ["controllerLegalEntityReference"],
    )
  ) return { ok: false, code: "material_invalid" };
  const operatorReference = input.operatorLegalEntityReference;
  const roleReferences = Object.values(input.roleBindings);
  if (
    roleReferences.some((reference) => reference !== operatorReference) ||
    (input.roleBindings.controllerLegalEntityReference !== undefined &&
      !validReference(input.roleBindings.controllerLegalEntityReference))
  ) return { ok: false, code: "material_invalid" };
  const context = validateContextAndRevision(input, "operational");
  if (typeof context === "string") return { ok: false, code: context };
  const roleBindings = Object.freeze({
    regulatedOperatorLegalEntityReference: input.roleBindings
      .regulatedOperatorLegalEntityReference as string,
    contractingPartyLegalEntityReference: input.roleBindings
      .contractingPartyLegalEntityReference as string,
    mandateGranteeLegalEntityReference: input.roleBindings
      .mandateGranteeLegalEntityReference as string,
    ...(input.roleBindings.controllerLegalEntityReference === undefined ? {} : {
      controllerLegalEntityReference: input.roleBindings
        .controllerLegalEntityReference as string,
    }),
  });
  const content = Object.freeze({
    schemaVersion: "tenant-signing-operational-material-v1" as const,
    operatorLegalEntityReference: operatorReference,
    operatorIdentitySha256: input.operatorIdentitySha256,
    roleBindings,
  });
  return await bindMaterial(context, "operational", content);
}

export async function createTenantLegalSigningMaterialV1(
  input: unknown,
): Promise<TenantSigningMaterialResult<TenantLegalSigningMaterialV1>> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "bundleRevision",
      "componentRevision",
      "documents",
      "environment",
      "materialRevisionId",
      "tenantId",
    ]) ||
    !validRevision(input.bundleRevision) ||
    !Array.isArray(input.documents) ||
    input.documents.length !== LEGAL_DOCUMENT_TYPES.length
  ) return { ok: false, code: "material_invalid" };
  const documents = input.documents.map(validateDocumentReference);
  if (documents.some((document) => !document)) {
    return { ok: false, code: "material_invalid" };
  }
  const byType = new Map(
    documents.map((document) => [document!.documentType, document!]),
  );
  if (byType.size !== LEGAL_DOCUMENT_TYPES.length) {
    return { ok: false, code: "material_invalid" };
  }
  const orderedDocuments = Object.freeze(
    LEGAL_DOCUMENT_TYPES.map((documentType) => byType.get(documentType)!),
  );
  if (orderedDocuments.some((document) => !document)) {
    return { ok: false, code: "material_invalid" };
  }
  const context = validateContextAndRevision(input, "legal");
  if (typeof context === "string") return { ok: false, code: context };
  const content = Object.freeze({
    schemaVersion: "tenant-signing-legal-material-v1" as const,
    bundleRevision: input.bundleRevision,
    documents: orderedDocuments,
  });
  return await bindMaterial(context, "legal", content);
}

export async function createTenantFeeSigningMaterialV1(
  input: unknown,
): Promise<TenantSigningMaterialResult<TenantFeeSigningMaterialV1>> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "componentRevision",
      "environment",
      "governingFeeTerms",
      "materialRevisionId",
      "tenantId",
    ])
  ) return { ok: false, code: "material_invalid" };
  const governingFeeTerms = validateDocumentReference(
    input.governingFeeTerms,
  );
  if (!governingFeeTerms || governingFeeTerms.documentType !== "fee_terms") {
    return { ok: false, code: "material_invalid" };
  }
  const context = validateContextAndRevision(input, "fee_commercial");
  if (typeof context === "string") return { ok: false, code: context };
  const content = Object.freeze({
    schemaVersion: "tenant-signing-fee-material-v1" as const,
    governingFeeTerms,
  });
  return await bindMaterial(context, "fee_commercial", content);
}

export function validateTenantSigningConfigurationInvalidationV1(
  input: unknown,
): TenantSigningConfigurationInvalidationV1 | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "authorizedActorRef",
      "effectiveAt",
      "environment",
      "evidenceReference",
      "reasonCode",
      "subjectReference",
      "subjectType",
      "tenantId",
    ]) ||
    !isValidTenantReference(input.tenantId) ||
    !validEnvironment(input.environment) ||
    !TENANT_SIGNING_INVALIDATION_SUBJECT_TYPES.includes(
      input.subjectType as TenantSigningInvalidationSubjectType,
    ) ||
    !validReference(input.subjectReference) ||
    !validCanonicalTimestamp(input.effectiveAt) ||
    input.reasonCode !== "explicit_invalidation" ||
    !validReference(input.authorizedActorRef) ||
    !validReference(input.evidenceReference)
  ) return null;
  return Object.freeze({
    tenantId: input.tenantId,
    environment: input.environment,
    subjectType: input.subjectType as TenantSigningInvalidationSubjectType,
    subjectReference: input.subjectReference,
    effectiveAt: input.effectiveAt,
    reasonCode: "explicit_invalidation",
    authorizedActorRef: input.authorizedActorRef,
    evidenceReference: input.evidenceReference,
  });
}
