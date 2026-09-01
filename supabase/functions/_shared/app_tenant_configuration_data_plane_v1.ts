import {
  createTenantConfigurationServerSelectionAuthorityV1,
  type TenantConfigurationClockPort,
  type TenantConfigurationResult,
  type TenantConfigurationServerSelectionAuthorityV1,
  type TenantConfigurationSourcePort,
} from "./app_tenant_configuration.ts";
import {
  type AppTenantExecutionContext,
  isBoundAppTenantExecutionContext,
} from "./app_tenant_resolution_shadow.ts";

type QueryResult = Readonly<{
  data: unknown;
  error: unknown;
}>;

export type TenantConfigurationDataPlaneClient = Readonly<{
  from(table: string): Readonly<{
    select(columns: string): TenantConfigurationFilteredQuery;
  }>;
}>;

type TenantConfigurationFilteredQuery =
  & PromiseLike<QueryResult>
  & Readonly<{
    eq(column: string, value: string): TenantConfigurationFilteredQuery;
    limit(count: number): TenantConfigurationFilteredQuery;
  }>;

const COMPONENT_TABLE = "app_tenant_configuration_component_revisions";
const MANIFEST_TABLE = "app_tenant_configuration_manifests";
const MAX_MANIFEST_HISTORY = 256;
const MAX_COMPONENT_HISTORY = 1_024;
const SERVER_CLOCK: TenantConfigurationClockPort = Object.freeze({
  now: () => new Date(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : text(value);
}

function canonicalTimestamp(value: unknown): string {
  const parsed = new Date(text(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function queryRows(
  result: QueryResult,
  maximum: number,
): readonly Record<string, unknown>[] | null {
  if (
    result.error || !Array.isArray(result.data) ||
    result.data.length > maximum || result.data.some((row) => !isRecord(row))
  ) return null;
  return result.data as readonly Record<string, unknown>[];
}

function componentSource(
  rows: readonly Record<string, unknown>[],
  context: AppTenantExecutionContext,
): readonly unknown[] | null {
  const revisionByRowId = new Map(
    rows.map((row) => [text(row.id), text(row.revision_id)]),
  );
  if (revisionByRowId.size !== rows.length) return null;
  const values: unknown[] = [];
  for (const row of rows) {
    if (
      text(row.tenant_id) !== context.tenantId ||
      text(row.environment) !== context.environment
    ) return null;
    const supersedesRowId = optionalText(row.supersedes_component_revision_id);
    const supersedesRevisionId = supersedesRowId === undefined
      ? undefined
      : revisionByRowId.get(supersedesRowId);
    if (supersedesRowId !== undefined && !supersedesRevisionId) return null;
    values.push(Object.freeze({
      componentKind: text(row.component_kind),
      revisionId: text(row.revision_id),
      contentSha256: text(row.content_sha256),
      approvalStatus: text(row.approval_status),
      approvedAt: canonicalTimestamp(row.approved_at),
      approvedByActorRef: text(row.approved_by_actor_ref),
      ...(supersedesRevisionId ? { supersedesRevisionId } : {}),
    }));
  }
  return Object.freeze(values);
}

function manifestSource(
  rows: readonly Record<string, unknown>[],
  componentsByRowId: ReadonlyMap<string, Record<string, unknown>>,
  context: AppTenantExecutionContext,
): readonly unknown[] | null {
  const revisionByRowId = new Map(
    rows.map((row) => [text(row.id), text(row.manifest_revision_id)]),
  );
  if (revisionByRowId.size !== rows.length) return null;
  const componentReference = (
    rowId: unknown,
    expectedKind: string,
  ): Readonly<Record<string, unknown>> | null => {
    const component = componentsByRowId.get(text(rowId));
    if (!component || text(component.component_kind) !== expectedKind) {
      return null;
    }
    return Object.freeze({
      componentKind: text(component.component_kind),
      revisionId: text(component.revision_id),
      contentSha256: text(component.content_sha256),
    });
  };
  const values: unknown[] = [];
  for (const row of rows) {
    if (
      text(row.tenant_id) !== context.tenantId ||
      text(row.environment) !== context.environment
    ) return null;
    const operational = componentReference(
      row.operational_component_revision_id,
      "operational",
    );
    const legal = componentReference(row.legal_component_revision_id, "legal");
    const feeCommercial = componentReference(
      row.fee_commercial_component_revision_id,
      "fee_commercial",
    );
    const providerIntegration = componentReference(
      row.provider_integration_component_revision_id,
      "provider_integration",
    );
    if (!operational || !legal || !feeCommercial || !providerIntegration) {
      return null;
    }
    const supersedesRowId = optionalText(row.supersedes_manifest_id);
    const supersedesManifestRevisionId = supersedesRowId === undefined
      ? undefined
      : revisionByRowId.get(supersedesRowId);
    if (supersedesRowId !== undefined && !supersedesManifestRevisionId) {
      return null;
    }
    const effectiveUntil = row.effective_until === null
      ? undefined
      : canonicalTimestamp(row.effective_until);
    values.push(Object.freeze({
      schemaVersion: text(row.schema_version),
      manifestRevisionId: text(row.manifest_revision_id),
      tenantId: text(row.tenant_id),
      environment: text(row.environment),
      components: Object.freeze({
        operational,
        legal,
        feeCommercial,
        providerIntegration,
      }),
      approvalStatus: text(row.approval_status),
      approvedAt: canonicalTimestamp(row.approved_at),
      approvedByActorRef: text(row.approved_by_actor_ref),
      effectiveFrom: canonicalTimestamp(row.effective_from),
      ...(effectiveUntil ? { effectiveUntil } : {}),
      ...(supersedesManifestRevisionId ? { supersedesManifestRevisionId } : {}),
      canonicalSha256: text(row.canonical_sha256),
    }));
  }
  return Object.freeze(values);
}

export class DataPlaneTenantConfigurationV1Adapter
  implements TenantConfigurationSourcePort {
  readonly #client: TenantConfigurationDataPlaneClient;
  readonly #selectionAuthority: TenantConfigurationServerSelectionAuthorityV1;

  constructor(
    client: TenantConfigurationDataPlaneClient,
    clock: TenantConfigurationClockPort = SERVER_CLOCK,
  ) {
    this.#client = client;
    this.#selectionAuthority =
      createTenantConfigurationServerSelectionAuthorityV1(clock);
  }

  async resolveForExecutionContext(
    context: AppTenantExecutionContext,
  ): Promise<TenantConfigurationResult> {
    if (!isBoundAppTenantExecutionContext(context)) {
      return { ok: false, code: "invalid_execution_context" };
    }
    try {
      const manifestRows = queryRows(
        await this.#client.from(MANIFEST_TABLE)
          .select(
            "id,schema_version,manifest_revision_id,tenant_id,environment,operational_component_revision_id,legal_component_revision_id,fee_commercial_component_revision_id,provider_integration_component_revision_id,approval_status,approved_at,approved_by_actor_ref,effective_from,effective_until,supersedes_manifest_id,canonical_sha256",
          )
          .eq("tenant_id", context.tenantId)
          .eq("environment", context.environment)
          .limit(MAX_MANIFEST_HISTORY + 1),
        MAX_MANIFEST_HISTORY,
      );
      if (!manifestRows) {
        return { ok: false, code: "tenant_configuration_source_unavailable" };
      }
      const componentRows = queryRows(
        await this.#client.from(COMPONENT_TABLE)
          .select(
            "id,tenant_id,environment,component_kind,revision_id,content_sha256,approval_status,approved_at,approved_by_actor_ref,supersedes_component_revision_id",
          )
          .eq("tenant_id", context.tenantId)
          .eq("environment", context.environment)
          .limit(MAX_COMPONENT_HISTORY + 1),
        MAX_COMPONENT_HISTORY,
      );
      if (!componentRows) {
        return { ok: false, code: "tenant_configuration_source_unavailable" };
      }
      const components = componentSource(componentRows, context);
      if (!components) {
        return { ok: false, code: "tenant_configuration_source_unavailable" };
      }
      const componentsByRowId = new Map(
        componentRows.map((row) => [text(row.id), row]),
      );
      const manifests = manifestSource(
        manifestRows,
        componentsByRowId,
        context,
      );
      if (!manifests) {
        return { ok: false, code: "tenant_configuration_source_unavailable" };
      }
      return await this.#selectionAuthority.resolveForExecutionContext({
        context,
        manifests,
        componentRevisions: components,
      });
    } catch (_error) {
      return { ok: false, code: "tenant_configuration_source_unavailable" };
    }
  }
}
