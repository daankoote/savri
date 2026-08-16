import {
  isTrustedTenantRoutingContext,
  type TrustedTenantRoutingContext,
} from "./trusted_ingress.ts";
export type { TrustedTenantRoutingContext } from "./trusted_ingress.ts";

export type DeploymentEnvironment = string;
export type TenantReference = string;
export type DataPlaneLocatorReference = string;
export type SecretReference = string;

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const DATA_PLANE_LOCATION_KEYS = Object.freeze([
  "applicationRouteReference",
  "dataPlaneReference",
  "deploymentOwnership",
  "environment",
  "locatorId",
  "providerType",
  "secretReferenceId",
]);
const DEPLOYMENT_OWNERSHIP = new Set([
  "ENVAL_MANAGED_DEDICATED",
  "CUSTOMER_MANAGED_SELF_HOSTED",
]);

function validBoundedValue(value: string, max: number): boolean {
  return typeof value === "string" && value === value.trim() &&
    value.length > 0 && value.length <= max;
}

function containsCredentialMaterial(value: string): boolean {
  return /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\//i.test(
    value,
  ) ||
    /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value) ||
    /(?:^|[?&#])(password|passwd|token|api[_-]?key|secret|credential)=/i.test(
      value,
    ) ||
    /\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/.test(value);
}

export function isValidTenantReference(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isValidResolvedDataPlaneLocation(
  value: unknown,
): value is ResolvedDataPlaneLocation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const location = value as Record<string, unknown>;
  if (
    Object.keys(location).sort().join("|") !==
      DATA_PLANE_LOCATION_KEYS.join("|")
  ) return false;
  return isValidTenantReference(location.locatorId) &&
    isValidTenantReference(location.secretReferenceId) &&
    typeof location.deploymentOwnership === "string" &&
    DEPLOYMENT_OWNERSHIP.has(location.deploymentOwnership) &&
    typeof location.environment === "string" &&
    TOKEN_PATTERN.test(location.environment) &&
    typeof location.providerType === "string" &&
    TOKEN_PATTERN.test(location.providerType) &&
    typeof location.dataPlaneReference === "string" &&
    validBoundedValue(location.dataPlaneReference, 200) &&
    !containsCredentialMaterial(location.dataPlaneReference) &&
    typeof location.applicationRouteReference === "string" &&
    validBoundedValue(location.applicationRouteReference, 500) &&
    !containsCredentialMaterial(location.applicationRouteReference);
}

export function validateTrustedRoutingContext(
  context: TrustedTenantRoutingContext,
): ResolutionResult<TrustedTenantRoutingContext> {
  if (!isTrustedTenantRoutingContext(context)) {
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
