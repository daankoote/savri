export type DeploymentEnvironment = string;
export type TenantReference = string;
export type DataPlaneLocatorReference = string;
export type SecretReference = string;

export type TrustedTenantRoutingContext = Readonly<{
  trustedRoutingKey: string;
  environment: DeploymentEnvironment;
}>;

export type ResolvedTenantReference = Readonly<{
  tenantId: TenantReference;
}>;

export type ResolvedDataPlaneLocation = Readonly<{
  locatorId: DataPlaneLocatorReference;
  deploymentOwnership:
    | "ENVAL_MANAGED_DEDICATED"
    | "CUSTOMER_MANAGED_SELF_HOSTED";
  environment: DeploymentEnvironment;
  providerType: string;
  dataPlaneReference: string;
  applicationRouteReference: string;
  secretReferenceId: SecretReference;
}>;

export type ResolvedTenantContext = Readonly<{
  tenantId: TenantReference;
  dataPlane: ResolvedDataPlaneLocation;
}>;

export type TenantResolutionFailureCode =
  | "invalid_trusted_routing_context"
  | "unknown_routing_identity"
  | "inactive_routing_identity"
  | "ambiguous_routing_identity"
  | "inactive_tenant"
  | "no_active_data_plane_locator"
  | "multiple_active_data_plane_locators"
  | "malformed_data_plane_locator"
  | "environment_mismatch";

export type ResolutionResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: TenantResolutionFailureCode }>;

export interface TenantResolverPort {
  resolveTenant(
    context: TrustedTenantRoutingContext,
  ): Promise<ResolutionResult<ResolvedTenantReference>>;
}

export interface TenantDataPlaneLocator {
  locateDataPlane(
    tenant: ResolvedTenantReference,
    environment: DeploymentEnvironment,
  ): Promise<ResolutionResult<ResolvedDataPlaneLocation>>;
}

export type TenantResolutionAdapter =
  & TenantResolverPort
  & TenantDataPlaneLocator;

function validBoundedValue(value: string, max: number): boolean {
  return value === value.trim() && value.length > 0 && value.length <= max;
}

export function validateTrustedRoutingContext(
  context: TrustedTenantRoutingContext,
): ResolutionResult<TrustedTenantRoutingContext> {
  if (
    !context ||
    !validBoundedValue(context.trustedRoutingKey, 500) ||
    !validBoundedValue(context.environment, 64) ||
    context.environment !== context.environment.toLowerCase()
  ) {
    return { ok: false, code: "invalid_trusted_routing_context" };
  }
  return { ok: true, value: context };
}

export async function resolveTenantRuntimeContext(
  adapter: TenantResolutionAdapter,
  context: TrustedTenantRoutingContext,
): Promise<ResolutionResult<ResolvedTenantContext>> {
  const trusted = validateTrustedRoutingContext(context);
  if (!trusted.ok) return trusted;

  const tenant = await adapter.resolveTenant(trusted.value);
  if (!tenant.ok) return tenant;

  const location = await adapter.locateDataPlane(
    tenant.value,
    trusted.value.environment,
  );
  if (!location.ok) return location;
  if (location.value.environment !== trusted.value.environment) {
    return { ok: false, code: "environment_mismatch" };
  }

  return {
    ok: true,
    value: Object.freeze({
      tenantId: tenant.value.tenantId,
      dataPlane: Object.freeze({ ...location.value }),
    }),
  };
}
