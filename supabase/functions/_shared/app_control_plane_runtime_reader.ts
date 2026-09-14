import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type {
  PlatformControlPlaneReader,
  PlatformDataPlaneLocatorRecord,
  PlatformRoutingRecord,
} from "../../../platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts";
import type {
  PlatformPresentationConfigReader,
  PlatformPresentationConfigRecord,
} from "../../../platform/runtime/presentation/adapters/platform_control_plane_presentation_v1.ts";

type QueryResult = Readonly<{
  data: unknown;
  error: unknown;
}>;

type PlatformSchemaClient = Readonly<{
  from(table: string): any;
}>;

export type PlatformControlPlaneRuntimeReader =
  & PlatformControlPlaneReader
  & PlatformPresentationConfigReader;

export type PlatformControlPlaneEnvironmentReader = Readonly<{
  get(name: string): string | undefined;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rows(result: QueryResult): readonly Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) {
    throw new Error("platform_control_plane_read_unavailable");
  }
  if (result.data.some((value) => !isRecord(value))) {
    throw new Error("platform_control_plane_response_invalid");
  }
  return result.data as readonly Record<string, unknown>[];
}

export function createPlatformControlPlaneRuntimeReader(
  client: PlatformSchemaClient,
): PlatformControlPlaneRuntimeReader {
  return Object.freeze({
    async findRoutingIdentities(
      normalizedHost: string,
    ): Promise<readonly PlatformRoutingRecord[]> {
      const routingRows = rows(
        await client.from("routing_identities")
          .select("id,tenant_id,lifecycle_status")
          .eq("identity_kind", "host")
          .eq("normalized_value", normalizedHost),
      );
      if (routingRows.length === 0) return [];
      const tenantIds = [
        ...new Set(
          routingRows.map((row) => text(row.tenant_id))
            .filter(Boolean),
        ),
      ];
      const tenantRows = rows(
        await client.from("tenants")
          .select("id,lifecycle_status")
          .in("id", tenantIds),
      );
      const tenantStatuses = new Map(
        tenantRows.map((row) => [text(row.id), text(row.lifecycle_status)]),
      );
      return routingRows.map((row) =>
        Object.freeze({
          routingIdentityId: text(row.id),
          routingLifecycleStatus: text(row.lifecycle_status),
          tenantId: text(row.tenant_id),
          tenantLifecycleStatus: tenantStatuses.get(text(row.tenant_id)) ?? "",
        })
      );
    },

    async findDataPlaneLocators(
      tenantId: string,
    ): Promise<readonly PlatformDataPlaneLocatorRecord[]> {
      const locatorRows = rows(
        await client.from("data_plane_locators")
          .select(
            "id,tenant_id,lifecycle_status,deployment_ownership,environment,provider_type,provider_project_ref,application_route_ref,secret_reference_id",
          )
          .eq("tenant_id", tenantId),
      );
      return locatorRows.map((row) =>
        Object.freeze({
          locatorId: text(row.id),
          tenantId: text(row.tenant_id),
          lifecycleStatus: text(row.lifecycle_status),
          deploymentOwnership: text(row.deployment_ownership),
          environment: text(row.environment),
          providerType: text(row.provider_type),
          dataPlaneReference: text(row.provider_project_ref),
          applicationRouteReference: text(row.application_route_ref),
          secretReferenceId: text(row.secret_reference_id),
        })
      );
    },

    async findCurrentPresentationConfigs(
      tenantId: string,
      environment: string,
    ): Promise<readonly PlatformPresentationConfigRecord[]> {
      const presentationRows = rows(
        await client.from("current_tenant_presentation_configs")
          .select(
            "tenant_id,environment,version_sequence,schema_version,config_version,display_name,short_mark,product_label,tagline,logo_ref,logo_inverse_ref,favicon_ref,social_image_ref,asset_alt_text,export_basename",
          )
          .eq("tenant_id", tenantId)
          .eq("environment", environment),
      );
      return presentationRows.map((row) =>
        Object.freeze({
          tenantId: text(row.tenant_id),
          environment: text(row.environment),
          versionSequence: Number(row.version_sequence),
          schemaVersion: text(row.schema_version),
          configVersion: text(row.config_version),
          displayName: text(row.display_name),
          shortMark: text(row.short_mark),
          productLabel: text(row.product_label),
          tagline: row.tagline === null ? null : text(row.tagline),
          logoReference: text(row.logo_ref),
          logoInverseReference: row.logo_inverse_ref === null
            ? null
            : text(row.logo_inverse_ref),
          faviconReference: row.favicon_ref === null
            ? null
            : text(row.favicon_ref),
          socialImageReference: row.social_image_ref === null
            ? null
            : text(row.social_image_ref),
          assetAltText: text(row.asset_alt_text),
          exportBasename: row.export_basename === null
            ? null
            : text(row.export_basename),
        })
      );
    },
  });
}

export function createPlatformControlPlaneRuntimeReaderFromEnvironment(
  environment: PlatformControlPlaneEnvironmentReader,
): PlatformControlPlaneRuntimeReader | null {
  const url = String(
    environment.get("ENVAL_CONTROL_PLANE_SUPABASE_URL") ?? "",
  ).trim();
  const serviceRoleKey = String(
    environment.get("ENVAL_CONTROL_PLANE_SERVICE_ROLE_KEY") ?? "",
  ).trim();
  if (!url || !serviceRoleKey) return null;
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema: "platform" },
  });
  return createPlatformControlPlaneRuntimeReader(client);
}
