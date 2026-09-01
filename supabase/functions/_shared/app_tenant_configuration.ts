import { payloadHash } from "./app_foundation.ts";
import type { AppTenantExecutionContext } from "./app_tenant_resolution_shadow.ts";
import { isValidTenantReference } from "../../../platform/runtime/tenant-resolution/tenant_resolution.ts";

export const TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION =
  "tenant-configuration-manifest-v1" as const;

export const TENANT_CONFIGURATION_COMPONENT_KINDS = Object.freeze(
  [
    "operational",
    "legal",
    "fee_commercial",
    "provider_integration",
  ] as const,
);

export type TenantConfigurationComponentKind =
  typeof TENANT_CONFIGURATION_COMPONENT_KINDS[number];

export type ApprovedTenantConfigurationComponentRevision = Readonly<{
  componentKind: TenantConfigurationComponentKind;
  revisionId: string;
  contentSha256: string;
  approvalStatus: "APPROVED";
  approvedAt: string;
  approvedByActorRef: string;
  supersedesRevisionId?: string;
}>;

export type TenantConfigurationComponentReferenceV1 = Readonly<{
  componentKind: TenantConfigurationComponentKind;
  revisionId: string;
  contentSha256: string;
}>;

export type TenantConfigurationManifestComponentsV1 = Readonly<{
  operational: TenantConfigurationComponentReferenceV1;
  legal: TenantConfigurationComponentReferenceV1;
  feeCommercial: TenantConfigurationComponentReferenceV1;
  providerIntegration: TenantConfigurationComponentReferenceV1;
}>;

export type TenantConfigurationManifestHashInputV1 = Readonly<{
  schemaVersion: typeof TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION;
  manifestRevisionId: string;
  tenantId: string;
  environment: string;
  components: TenantConfigurationManifestComponentsV1;
  approvalStatus: "APPROVED";
  approvedAt: string;
  approvedByActorRef: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  supersedesManifestRevisionId?: string;
}>;

export type TenantConfigurationManifestV1 =
  & TenantConfigurationManifestHashInputV1
  & Readonly<{
    canonicalSha256: string;
  }>;

export type ResolvedTenantConfigurationV1 = Readonly<{
  manifest: TenantConfigurationManifestV1;
  componentRevisions: Readonly<{
    operational: ApprovedTenantConfigurationComponentRevision;
    legal: ApprovedTenantConfigurationComponentRevision;
    feeCommercial: ApprovedTenantConfigurationComponentRevision;
    providerIntegration: ApprovedTenantConfigurationComponentRevision;
  }>;
}>;

export type TenantConfigurationFailureCode =
  | "invalid_execution_context"
  | "invalid_evaluation_time"
  | "component_revision_invalid"
  | "component_revision_duplicate"
  | "component_supersession_invalid"
  | "manifest_invalid"
  | "manifest_not_approved"
  | "manifest_hash_mismatch"
  | "manifest_duplicate"
  | "manifest_supersession_invalid"
  | "tenant_configuration_missing"
  | "tenant_configuration_ambiguous"
  | "component_revision_missing"
  | "component_revision_mismatch"
  | "component_revision_not_approved_at_event_time";

export type TenantConfigurationResult =
  | Readonly<{ ok: true; value: ResolvedTenantConfigurationV1 }>
  | Readonly<{ ok: false; code: TenantConfigurationFailureCode }>;

export interface TenantConfigurationSourcePort {
  resolveForExecutionContext(
    context: AppTenantExecutionContext,
  ): Promise<TenantConfigurationResult>;
}

export interface TenantConfigurationClockPort {
  now(): Date;
}

export type TenantConfigurationSelectionSourceV1 = Readonly<{
  context: AppTenantExecutionContext;
  manifests: readonly unknown[];
  componentRevisions: readonly unknown[];
}>;

export interface TenantConfigurationServerSelectionAuthorityV1 {
  resolveForExecutionContext(
    source: TenantConfigurationSelectionSourceV1,
  ): Promise<TenantConfigurationResult>;
}

const TRUSTED_EVALUATION_INSTANTS = new WeakSet<object>();
const TRUSTED_EVALUATION_INSTANT_TOKEN = Symbol(
  "tenant_configuration_server_evaluation_instant",
);

class TrustedTenantConfigurationEvaluationInstant {
  readonly canonicalUtc: string;

  constructor(
    canonicalUtc: string,
    token: typeof TRUSTED_EVALUATION_INSTANT_TOKEN,
  ) {
    if (token !== TRUSTED_EVALUATION_INSTANT_TOKEN) {
      throw new TypeError("tenant_configuration_server_clock_required");
    }
    this.canonicalUtc = canonicalUtc;
    TRUSTED_EVALUATION_INSTANTS.add(this);
    Object.freeze(this);
  }
}

function trustedTenantConfigurationEvaluationInstantFromServerDate(
  value: Date,
):
  | Readonly<{ ok: true; value: TrustedTenantConfigurationEvaluationInstant }>
  | Readonly<{ ok: false; code: "invalid_evaluation_time" }> {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return { ok: false, code: "invalid_evaluation_time" };
  }
  return {
    ok: true,
    value: new TrustedTenantConfigurationEvaluationInstant(
      value.toISOString(),
      TRUSTED_EVALUATION_INSTANT_TOKEN,
    ),
  };
}

export function createTenantConfigurationServerSelectionAuthorityV1(
  clock: TenantConfigurationClockPort,
): TenantConfigurationServerSelectionAuthorityV1 {
  return Object.freeze({
    async resolveForExecutionContext(
      source: TenantConfigurationSelectionSourceV1,
    ): Promise<TenantConfigurationResult> {
      let evaluationInstant:
        | Readonly<{
          ok: true;
          value: TrustedTenantConfigurationEvaluationInstant;
        }>
        | Readonly<{ ok: false; code: "invalid_evaluation_time" }>;
      try {
        evaluationInstant =
          trustedTenantConfigurationEvaluationInstantFromServerDate(
            clock.now(),
          );
      } catch (_error) {
        return { ok: false, code: "invalid_evaluation_time" };
      }
      if (!evaluationInstant.ok) return evaluationInstant;
      return await selectTenantConfigurationManifestV1({
        ...source,
        evaluationInstant: evaluationInstant.value,
      });
    },
  });
}

type JsonRecord = Record<string, unknown>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const ACTOR_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;

const COMPONENT_REVISION_REQUIRED_KEYS = Object.freeze([
  "approvalStatus",
  "approvedAt",
  "approvedByActorRef",
  "componentKind",
  "contentSha256",
  "revisionId",
]);
const COMPONENT_REVISION_OPTIONAL_KEYS = Object.freeze([
  "supersedesRevisionId",
]);
const COMPONENT_REFERENCE_KEYS = Object.freeze([
  "componentKind",
  "contentSha256",
  "revisionId",
]);
const MANIFEST_COMPONENT_KEYS = Object.freeze([
  "feeCommercial",
  "legal",
  "operational",
  "providerIntegration",
]);
const MANIFEST_REQUIRED_KEYS = Object.freeze([
  "approvalStatus",
  "approvedAt",
  "approvedByActorRef",
  "canonicalSha256",
  "components",
  "effectiveFrom",
  "environment",
  "manifestRevisionId",
  "schemaVersion",
  "tenantId",
]);
const MANIFEST_OPTIONAL_KEYS = Object.freeze([
  "effectiveUntil",
  "supersedesManifestRevisionId",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key));
}

function isComponentKind(
  value: unknown,
): value is TenantConfigurationComponentKind {
  return TENANT_CONFIGURATION_COMPONENT_KINDS.includes(
    value as TenantConfigurationComponentKind,
  );
}

function isRevisionId(value: unknown): value is string {
  return typeof value === "string" && REVISION_ID_PATTERN.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value;
}

function isTrustedTenantConfigurationEvaluationInstant(
  value: unknown,
): value is TrustedTenantConfigurationEvaluationInstant {
  return Boolean(value) && typeof value === "object" &&
    TRUSTED_EVALUATION_INSTANTS.has(value as object);
}

function isActorReference(value: unknown): value is string {
  return typeof value === "string" && ACTOR_REFERENCE_PATTERN.test(value);
}

function freezeComponentRevision(
  value: ApprovedTenantConfigurationComponentRevision,
): ApprovedTenantConfigurationComponentRevision {
  return Object.freeze({ ...value });
}

function freezeComponentReference(
  value: TenantConfigurationComponentReferenceV1,
): TenantConfigurationComponentReferenceV1 {
  return Object.freeze({ ...value });
}

function freezeManifestComponents(
  value: TenantConfigurationManifestComponentsV1,
): TenantConfigurationManifestComponentsV1 {
  return Object.freeze({
    operational: freezeComponentReference(value.operational),
    legal: freezeComponentReference(value.legal),
    feeCommercial: freezeComponentReference(value.feeCommercial),
    providerIntegration: freezeComponentReference(value.providerIntegration),
  });
}

function freezeManifest(
  value: TenantConfigurationManifestV1,
): TenantConfigurationManifestV1 {
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    manifestRevisionId: value.manifestRevisionId,
    tenantId: value.tenantId,
    environment: value.environment,
    components: freezeManifestComponents(value.components),
    approvalStatus: value.approvalStatus,
    approvedAt: value.approvedAt,
    approvedByActorRef: value.approvedByActorRef,
    effectiveFrom: value.effectiveFrom,
    ...(value.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: value.effectiveUntil }),
    ...(value.supersedesManifestRevisionId === undefined
      ? {}
      : { supersedesManifestRevisionId: value.supersedesManifestRevisionId }),
    canonicalSha256: value.canonicalSha256,
  });
}

function validateComponentReference(
  input: unknown,
  expectedKind: TenantConfigurationComponentKind,
): TenantConfigurationComponentReferenceV1 | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, COMPONENT_REFERENCE_KEYS) ||
    input.componentKind !== expectedKind ||
    !isRevisionId(input.revisionId) ||
    !isSha256(input.contentSha256)
  ) return null;
  return freezeComponentReference({
    componentKind: expectedKind,
    revisionId: input.revisionId,
    contentSha256: input.contentSha256,
  });
}

export function validateApprovedTenantConfigurationComponentRevision(
  input: unknown,
): ApprovedTenantConfigurationComponentRevision | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(
      input,
      COMPONENT_REVISION_REQUIRED_KEYS,
      COMPONENT_REVISION_OPTIONAL_KEYS,
    ) ||
    !isComponentKind(input.componentKind) ||
    !isRevisionId(input.revisionId) ||
    !isSha256(input.contentSha256) ||
    input.approvalStatus !== "APPROVED" ||
    !isCanonicalTimestamp(input.approvedAt) ||
    !isActorReference(input.approvedByActorRef) ||
    (input.supersedesRevisionId !== undefined &&
      !isRevisionId(input.supersedesRevisionId)) ||
    input.supersedesRevisionId === input.revisionId
  ) return null;
  return freezeComponentRevision({
    componentKind: input.componentKind,
    revisionId: input.revisionId,
    contentSha256: input.contentSha256,
    approvalStatus: "APPROVED",
    approvedAt: input.approvedAt,
    approvedByActorRef: input.approvedByActorRef,
    ...(input.supersedesRevisionId === undefined
      ? {}
      : { supersedesRevisionId: input.supersedesRevisionId }),
  });
}

export async function tenantConfigurationManifestCanonicalSha256(
  input: TenantConfigurationManifestHashInputV1,
): Promise<string> {
  return await payloadHash(input);
}

function manifestHashInput(
  value: TenantConfigurationManifestV1,
): TenantConfigurationManifestHashInputV1 {
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    manifestRevisionId: value.manifestRevisionId,
    tenantId: value.tenantId,
    environment: value.environment,
    components: freezeManifestComponents(value.components),
    approvalStatus: value.approvalStatus,
    approvedAt: value.approvedAt,
    approvedByActorRef: value.approvedByActorRef,
    effectiveFrom: value.effectiveFrom,
    ...(value.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: value.effectiveUntil }),
    ...(value.supersedesManifestRevisionId === undefined
      ? {}
      : { supersedesManifestRevisionId: value.supersedesManifestRevisionId }),
  });
}

export async function validateTenantConfigurationManifestV1(
  input: unknown,
): Promise<
  | Readonly<{ ok: true; value: TenantConfigurationManifestV1 }>
  | Readonly<{
    ok: false;
    code:
      | "manifest_invalid"
      | "manifest_not_approved"
      | "manifest_hash_mismatch";
  }>
> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, MANIFEST_REQUIRED_KEYS, MANIFEST_OPTIONAL_KEYS)
  ) return { ok: false, code: "manifest_invalid" };
  if (input.approvalStatus !== "APPROVED") {
    return { ok: false, code: "manifest_not_approved" };
  }
  if (
    input.schemaVersion !== TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION ||
    !isRevisionId(input.manifestRevisionId) ||
    !isValidTenantReference(input.tenantId) ||
    typeof input.environment !== "string" ||
    !ENVIRONMENT_PATTERN.test(input.environment) ||
    !isCanonicalTimestamp(input.approvedAt) ||
    !isActorReference(input.approvedByActorRef) ||
    !isCanonicalTimestamp(input.effectiveFrom) ||
    (input.effectiveUntil !== undefined &&
      !isCanonicalTimestamp(input.effectiveUntil)) ||
    (input.supersedesManifestRevisionId !== undefined &&
      !isRevisionId(input.supersedesManifestRevisionId)) ||
    input.supersedesManifestRevisionId === input.manifestRevisionId ||
    !isSha256(input.canonicalSha256) ||
    !isRecord(input.components) ||
    !hasExactKeys(input.components, MANIFEST_COMPONENT_KEYS)
  ) return { ok: false, code: "manifest_invalid" };

  const operational = validateComponentReference(
    input.components.operational,
    "operational",
  );
  const legal = validateComponentReference(input.components.legal, "legal");
  const feeCommercial = validateComponentReference(
    input.components.feeCommercial,
    "fee_commercial",
  );
  const providerIntegration = validateComponentReference(
    input.components.providerIntegration,
    "provider_integration",
  );
  if (!operational || !legal || !feeCommercial || !providerIntegration) {
    return { ok: false, code: "manifest_invalid" };
  }
  if (
    input.effectiveUntil !== undefined &&
    Date.parse(input.effectiveUntil) <= Date.parse(input.effectiveFrom)
  ) return { ok: false, code: "manifest_invalid" };

  const value = freezeManifest({
    schemaVersion: TENANT_CONFIGURATION_MANIFEST_SCHEMA_VERSION,
    manifestRevisionId: input.manifestRevisionId,
    tenantId: input.tenantId,
    environment: input.environment,
    components: { operational, legal, feeCommercial, providerIntegration },
    approvalStatus: "APPROVED",
    approvedAt: input.approvedAt,
    approvedByActorRef: input.approvedByActorRef,
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: input.effectiveUntil }),
    ...(input.supersedesManifestRevisionId === undefined
      ? {}
      : { supersedesManifestRevisionId: input.supersedesManifestRevisionId }),
    canonicalSha256: input.canonicalSha256,
  });
  if (
    await tenantConfigurationManifestCanonicalSha256(
      manifestHashInput(value),
    ) !==
      value.canonicalSha256
  ) return { ok: false, code: "manifest_hash_mismatch" };
  return { ok: true, value };
}

function validateLinearSupersession<
  T extends Readonly<{
    id: string;
    supersedesId?: string;
    group: string;
  }>,
>(
  records: readonly T[],
): boolean {
  const byId = new Map(records.map((record) => [record.id, record]));
  const successorCount = new Map<string, number>();
  for (const record of records) {
    if (!record.supersedesId) continue;
    const predecessor = byId.get(record.supersedesId);
    if (!predecessor || predecessor.group !== record.group) return false;
    const count = (successorCount.get(predecessor.id) ?? 0) + 1;
    successorCount.set(predecessor.id, count);
    if (count > 1) return false;
  }
  for (const record of records) {
    const seen = new Set<string>();
    let current: T | undefined = record;
    while (current?.supersedesId) {
      if (seen.has(current.id)) return false;
      seen.add(current.id);
      current = byId.get(current.supersedesId);
    }
  }
  return true;
}

function componentRevisionSet(
  input: readonly unknown[],
):
  | Readonly<{
    ok: true;
    values: readonly ApprovedTenantConfigurationComponentRevision[];
  }>
  | Readonly<{ ok: false; code: TenantConfigurationFailureCode }> {
  const values: ApprovedTenantConfigurationComponentRevision[] = [];
  const ids = new Set<string>();
  for (const candidate of input) {
    const value = validateApprovedTenantConfigurationComponentRevision(
      candidate,
    );
    if (!value) return { ok: false, code: "component_revision_invalid" };
    if (ids.has(value.revisionId)) {
      return { ok: false, code: "component_revision_duplicate" };
    }
    ids.add(value.revisionId);
    values.push(value);
  }
  if (
    !validateLinearSupersession(values.map((value) => ({
      id: value.revisionId,
      supersedesId: value.supersedesRevisionId,
      group: value.componentKind,
    })))
  ) return { ok: false, code: "component_supersession_invalid" };
  return { ok: true, values: Object.freeze(values) };
}

async function manifestSet(
  input: readonly unknown[],
): Promise<
  | Readonly<{ ok: true; values: readonly TenantConfigurationManifestV1[] }>
  | Readonly<{ ok: false; code: TenantConfigurationFailureCode }>
> {
  const values: TenantConfigurationManifestV1[] = [];
  const ids = new Set<string>();
  for (const candidate of input) {
    const validation = await validateTenantConfigurationManifestV1(candidate);
    if (!validation.ok) return validation;
    if (ids.has(validation.value.manifestRevisionId)) {
      return { ok: false, code: "manifest_duplicate" };
    }
    ids.add(validation.value.manifestRevisionId);
    values.push(validation.value);
  }
  if (
    !validateLinearSupersession(values.map((value) => ({
      id: value.manifestRevisionId,
      supersedesId: value.supersedesManifestRevisionId,
      group: `${value.tenantId}:${value.environment}`,
    })))
  ) return { ok: false, code: "manifest_supersession_invalid" };
  return { ok: true, values: Object.freeze(values) };
}

function resolveComponent(
  reference: TenantConfigurationComponentReferenceV1,
  revisions: readonly ApprovedTenantConfigurationComponentRevision[],
  evaluationTimeMs: number,
  manifestApprovedAtMs: number,
):
  | Readonly<{ ok: true; value: ApprovedTenantConfigurationComponentRevision }>
  | Readonly<{ ok: false; code: TenantConfigurationFailureCode }> {
  const byId = revisions.find((revision) =>
    revision.revisionId === reference.revisionId
  );
  if (!byId) return { ok: false, code: "component_revision_missing" };
  if (
    byId.componentKind !== reference.componentKind ||
    byId.contentSha256 !== reference.contentSha256
  ) return { ok: false, code: "component_revision_mismatch" };
  const componentApprovedAtMs = Date.parse(byId.approvedAt);
  if (
    componentApprovedAtMs > evaluationTimeMs ||
    componentApprovedAtMs > manifestApprovedAtMs
  ) {
    return {
      ok: false,
      code: "component_revision_not_approved_at_event_time",
    };
  }
  return { ok: true, value: byId };
}

async function selectTenantConfigurationManifestV1(
  input: Readonly<{
    context: AppTenantExecutionContext;
    evaluationInstant: TrustedTenantConfigurationEvaluationInstant;
    manifests: readonly unknown[];
    componentRevisions: readonly unknown[];
  }>,
): Promise<TenantConfigurationResult> {
  if (
    !input.context || !Object.isFrozen(input.context) ||
    !isValidTenantReference(input.context.tenantId) ||
    !ENVIRONMENT_PATTERN.test(input.context.environment)
  ) return { ok: false, code: "invalid_execution_context" };
  if (
    !isTrustedTenantConfigurationEvaluationInstant(input.evaluationInstant)
  ) {
    return { ok: false, code: "invalid_evaluation_time" };
  }
  const components = componentRevisionSet(input.componentRevisions);
  if (!components.ok) return components;
  const manifests = await manifestSet(input.manifests);
  if (!manifests.ok) return manifests;

  const evaluationTimeMs = Date.parse(input.evaluationInstant.canonicalUtc);
  const applicable = manifests.values.filter((manifest) =>
    manifest.tenantId === input.context.tenantId &&
    manifest.environment === input.context.environment &&
    Date.parse(manifest.approvedAt) <= evaluationTimeMs &&
    Date.parse(manifest.effectiveFrom) <= evaluationTimeMs &&
    (manifest.effectiveUntil === undefined ||
      evaluationTimeMs < Date.parse(manifest.effectiveUntil))
  );
  if (applicable.length === 0) {
    return { ok: false, code: "tenant_configuration_missing" };
  }
  if (applicable.length !== 1) {
    return { ok: false, code: "tenant_configuration_ambiguous" };
  }
  const manifest = applicable[0];
  const manifestApprovedAtMs = Date.parse(manifest.approvedAt);
  const operational = resolveComponent(
    manifest.components.operational,
    components.values,
    evaluationTimeMs,
    manifestApprovedAtMs,
  );
  const legal = resolveComponent(
    manifest.components.legal,
    components.values,
    evaluationTimeMs,
    manifestApprovedAtMs,
  );
  const feeCommercial = resolveComponent(
    manifest.components.feeCommercial,
    components.values,
    evaluationTimeMs,
    manifestApprovedAtMs,
  );
  const providerIntegration = resolveComponent(
    manifest.components.providerIntegration,
    components.values,
    evaluationTimeMs,
    manifestApprovedAtMs,
  );
  if (!operational.ok) return operational;
  if (!legal.ok) return legal;
  if (!feeCommercial.ok) return feeCommercial;
  if (!providerIntegration.ok) return providerIntegration;
  return {
    ok: true,
    value: Object.freeze({
      manifest,
      componentRevisions: Object.freeze({
        operational: operational.value,
        legal: legal.value,
        feeCommercial: feeCommercial.value,
        providerIntegration: providerIntegration.value,
      }),
    }),
  };
}
