import {
  type DeploymentEnvironment,
  isValidResolvedDataPlaneLocation,
  isValidTenantReference,
  type ResolutionResult,
  type ResolvedDataPlaneLocation,
  type ResolvedTenantReference,
  type TenantResolutionAdapter,
  type TrustedTenantRoutingContext,
} from "../tenant_resolution.ts";

export type PlatformRoutingRecord = Readonly<{
  routingIdentityId: string;
  routingLifecycleStatus: string;
  tenantId: string;
  tenantLifecycleStatus: string;
}>;

export type PlatformDataPlaneLocatorRecord = Readonly<{
  locatorId: string;
  tenantId: string;
  lifecycleStatus: string;
  deploymentOwnership: string;
  environment: string;
  providerType: string;
  dataPlaneReference: string;
  applicationRouteReference: string;
  secretReferenceId: string;
}>;

export interface PlatformControlPlaneReader {
  findRoutingIdentities(
    normalizedHost: string,
  ): Promise<readonly PlatformRoutingRecord[]>;
  findDataPlaneLocators(
    tenantId: string,
  ): Promise<readonly PlatformDataPlaneLocatorRecord[]>;
}

const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
export function normalizeTrustedHost(value: string): string | null {
  const normalized = String(value ?? "").trim().toLowerCase().replace(
    /\.$/,
    "",
  );
  if (
    normalized.length < 1 || normalized.length > 253 ||
    normalized.includes("..") || !HOST_PATTERN.test(normalized)
  ) return null;
  return normalized;
}

function validLocator(
  record: PlatformDataPlaneLocatorRecord,
): record is PlatformDataPlaneLocatorRecord & {
  deploymentOwnership:
    | "ENVAL_MANAGED_DEDICATED"
    | "CUSTOMER_MANAGED_SELF_HOSTED";
} {
  return isValidTenantReference(record.tenantId) &&
    isValidResolvedDataPlaneLocation({
      locatorId: record.locatorId,
      deploymentOwnership: record.deploymentOwnership,
      environment: record.environment,
      providerType: record.providerType,
      dataPlaneReference: record.dataPlaneReference,
      applicationRouteReference: record.applicationRouteReference,
      secretReferenceId: record.secretReferenceId,
    });
}

export class PlatformControlPlaneV1Adapter implements TenantResolutionAdapter {
  readonly #reader: PlatformControlPlaneReader;

  constructor(reader: PlatformControlPlaneReader) {
    this.#reader = reader;
  }

  async resolveTenant(
    context: TrustedTenantRoutingContext,
  ): Promise<ResolutionResult<ResolvedTenantReference>> {
    const normalizedHost = normalizeTrustedHost(context.trustedRoutingKey);
    if (!normalizedHost) {
      return { ok: false, code: "invalid_trusted_routing_context" };
    }

    const matches = await this.#reader.findRoutingIdentities(normalizedHost);
    if (matches.length === 0) {
      return { ok: false, code: "unknown_routing_identity" };
    }
    const activeRoutes = matches.filter((record) =>
      record.routingLifecycleStatus === "active"
    );
    if (activeRoutes.length === 0) {
      return { ok: false, code: "inactive_routing_identity" };
    }
    if (activeRoutes.length !== 1) {
      return { ok: false, code: "ambiguous_routing_identity" };
    }
    if (activeRoutes[0].tenantLifecycleStatus !== "active") {
      return { ok: false, code: "inactive_tenant" };
    }
    if (!isValidTenantReference(activeRoutes[0].tenantId)) {
      return { ok: false, code: "ambiguous_routing_identity" };
    }
    return {
      ok: true,
      value: Object.freeze({ tenantId: activeRoutes[0].tenantId }),
    };
  }

  async locateDataPlane(
    tenant: ResolvedTenantReference,
    environment: DeploymentEnvironment,
  ): Promise<ResolutionResult<ResolvedDataPlaneLocation>> {
    const records = await this.#reader.findDataPlaneLocators(tenant.tenantId);
    const active = records.filter((record) =>
      record.lifecycleStatus === "active"
    );
    const matchingEnvironment = active.filter((record) =>
      record.environment === environment
    );

    if (matchingEnvironment.length === 0) {
      return {
        ok: false,
        code: active.length > 0
          ? "environment_mismatch"
          : "no_active_data_plane_locator",
      };
    }
    if (matchingEnvironment.length !== 1) {
      return { ok: false, code: "multiple_active_data_plane_locators" };
    }

    const record = matchingEnvironment[0];
    if (record.tenantId !== tenant.tenantId || !validLocator(record)) {
      return { ok: false, code: "malformed_data_plane_locator" };
    }

    return {
      ok: true,
      value: Object.freeze({
        locatorId: record.locatorId,
        deploymentOwnership: record.deploymentOwnership,
        environment: record.environment,
        providerType: record.providerType,
        dataPlaneReference: record.dataPlaneReference,
        applicationRouteReference: record.applicationRouteReference,
        secretReferenceId: record.secretReferenceId,
      }),
    };
  }
}
