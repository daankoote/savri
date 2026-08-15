import type {
  DeploymentEnvironment,
  ResolutionResult,
  ResolvedDataPlaneLocation,
  ResolvedTenantReference,
  TenantResolutionAdapter,
  TrustedTenantRoutingContext,
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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const DEPLOYMENT_OWNERSHIP = new Set([
  "ENVAL_MANAGED_DEDICATED",
  "CUSTOMER_MANAGED_SELF_HOSTED",
]);

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
  return UUID_PATTERN.test(record.locatorId) &&
    UUID_PATTERN.test(record.tenantId) &&
    UUID_PATTERN.test(record.secretReferenceId) &&
    DEPLOYMENT_OWNERSHIP.has(record.deploymentOwnership) &&
    TOKEN_PATTERN.test(record.environment) &&
    TOKEN_PATTERN.test(record.providerType) &&
    record.dataPlaneReference.trim() === record.dataPlaneReference &&
    record.dataPlaneReference.length > 0 &&
    record.dataPlaneReference.length <= 200 &&
    record.applicationRouteReference.trim() ===
      record.applicationRouteReference &&
    record.applicationRouteReference.length > 0 &&
    record.applicationRouteReference.length <= 500;
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
    if (!UUID_PATTERN.test(activeRoutes[0].tenantId)) {
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
