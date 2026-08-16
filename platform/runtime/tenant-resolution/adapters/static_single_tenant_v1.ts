import {
  type DeploymentEnvironment,
  isValidResolvedDataPlaneLocation,
  isValidTenantReference,
  type ResolutionResult,
  type ResolvedDataPlaneLocation,
  type ResolvedTenantReference,
  type TenantResolutionAdapter,
  type TrustedTenantRoutingContext,
  validateTrustedRoutingContext,
} from "../tenant_resolution.ts";

export type ServerOwnedStaticSingleTenantConfiguration = Readonly<{
  trustedRoutingKey: string;
  tenantId: string;
  dataPlane: ResolvedDataPlaneLocation;
}>;

export type StaticSingleTenantCreationFailureCode =
  | "missing_static_single_tenant_config"
  | "ambiguous_static_single_tenant_config"
  | "malformed_static_single_tenant_config";

export type StaticSingleTenantCreationResult =
  | Readonly<{ ok: true; adapter: StaticSingleTenantV1Adapter }>
  | Readonly<{ ok: false; code: StaticSingleTenantCreationFailureCode }>;

const CONFIGURATION_KEYS = Object.freeze([
  "dataPlane",
  "tenantId",
  "trustedRoutingKey",
]);
const STATIC_SINGLE_TENANT_CONSTRUCTION_TOKEN = Symbol(
  "static_single_tenant_v1",
);

function exactConfigurationShape(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).sort().join("|") ===
      CONFIGURATION_KEYS.join("|");
}

function validConfiguration(
  value: unknown,
): value is ServerOwnedStaticSingleTenantConfiguration {
  if (!exactConfigurationShape(value)) return false;
  const trustedRoutingKey = value.trustedRoutingKey;
  const dataPlane = value.dataPlane;
  return typeof trustedRoutingKey === "string" &&
    isValidTenantReference(value.tenantId) &&
    isValidResolvedDataPlaneLocation(dataPlane) &&
    validateTrustedRoutingContext({
      trustedRoutingKey,
      environment: dataPlane.environment,
      provenance: "DEPLOYMENT_FIXED",
    }).ok;
}

export function createStaticSingleTenantV1Adapter(
  configurations: readonly unknown[] | null | undefined,
): StaticSingleTenantCreationResult {
  if (!Array.isArray(configurations) || configurations.length === 0) {
    return { ok: false, code: "missing_static_single_tenant_config" };
  }
  if (configurations.length !== 1) {
    return { ok: false, code: "ambiguous_static_single_tenant_config" };
  }
  const configuration = configurations[0];
  if (!validConfiguration(configuration)) {
    return { ok: false, code: "malformed_static_single_tenant_config" };
  }
  return {
    ok: true,
    adapter: new StaticSingleTenantV1Adapter(
      configuration,
      STATIC_SINGLE_TENANT_CONSTRUCTION_TOKEN,
    ),
  };
}

export class StaticSingleTenantV1Adapter implements TenantResolutionAdapter {
  readonly #configuration: ServerOwnedStaticSingleTenantConfiguration;

  constructor(
    configuration: ServerOwnedStaticSingleTenantConfiguration,
    constructionToken: typeof STATIC_SINGLE_TENANT_CONSTRUCTION_TOKEN,
  ) {
    if (constructionToken !== STATIC_SINGLE_TENANT_CONSTRUCTION_TOKEN) {
      throw new TypeError("static_single_tenant_factory_required");
    }
    this.#configuration = Object.freeze({
      trustedRoutingKey: configuration.trustedRoutingKey,
      tenantId: configuration.tenantId,
      dataPlane: Object.freeze({ ...configuration.dataPlane }),
    });
  }

  async resolveTenant(
    context: TrustedTenantRoutingContext,
  ): Promise<ResolutionResult<ResolvedTenantReference>> {
    if (
      context.provenance !== "DEPLOYMENT_FIXED" ||
      context.trustedRoutingKey !== this.#configuration.trustedRoutingKey
    ) {
      return { ok: false, code: "unknown_routing_identity" };
    }
    return {
      ok: true,
      value: Object.freeze({ tenantId: this.#configuration.tenantId }),
    };
  }

  async locateDataPlane(
    tenant: ResolvedTenantReference,
    environment: DeploymentEnvironment,
  ): Promise<ResolutionResult<ResolvedDataPlaneLocation>> {
    if (tenant.tenantId !== this.#configuration.tenantId) {
      return { ok: false, code: "malformed_data_plane_locator" };
    }
    if (environment !== this.#configuration.dataPlane.environment) {
      return { ok: false, code: "environment_mismatch" };
    }
    return {
      ok: true,
      value: Object.freeze({ ...this.#configuration.dataPlane }),
    };
  }
}
