export const TRUSTED_ROUTING_PROVENANCES = Object.freeze(
  ["DEPLOYMENT_FIXED", "MANAGED_LOCAL_PROOF"] as const,
);

export type TrustedRoutingProvenance =
  typeof TRUSTED_ROUTING_PROVENANCES[number];

export type TrustedTenantRoutingContext = Readonly<{
  trustedRoutingKey: string;
  environment: string;
  provenance: TrustedRoutingProvenance;
}>;

export type ServerOwnedTrustedIngressRoute = Readonly<{
  routingIdentity: string;
  environment: string;
}>;

export type ServerOwnedTrustedIngressConfiguration = Readonly<{
  provenance: string;
  selectedRoutingIdentity: string;
  environment: string;
  allowedRoutes: readonly ServerOwnedTrustedIngressRoute[];
}>;

export type TrustedIngressFailureCode =
  | "malformed_trusted_ingress_configuration"
  | "unknown_trust_provenance"
  | "invalid_routing_identity"
  | "unknown_routing_identity"
  | "environment_mismatch"
  | "ambiguous_routing_configuration";

export type TrustedIngressResult =
  | Readonly<{ ok: true; value: TrustedTenantRoutingContext }>
  | Readonly<{ ok: false; code: TrustedIngressFailureCode }>;

const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const CONFIGURATION_KEYS = Object.freeze([
  "allowedRoutes",
  "environment",
  "provenance",
  "selectedRoutingIdentity",
]);
const ROUTE_KEYS = Object.freeze(["environment", "routingIdentity"]);
const CONTEXT_KEYS = Object.freeze([
  "environment",
  "provenance",
  "trustedRoutingKey",
]);

function exactObjectKeys(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).sort().join("|") ===
      expected.join("|");
}

export function normalizeTrustedRoutingIdentity(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 253) {
    return null;
  }
  if (
    value !== value.trim() || value.endsWith(".") || value.includes("..") ||
    /[^\x21-\x7e]/.test(value) || /[\/:?#@,]/.test(value)
  ) return null;

  const normalized = value.toLowerCase();
  const labels = normalized.split(".");
  if (
    labels.some((label) =>
      label.length < 1 || label.length > 63 || !HOST_LABEL_PATTERN.test(label)
    )
  ) return null;
  return normalized;
}

function normalizeEnvironment(value: unknown): string | null {
  return typeof value === "string" && ENVIRONMENT_PATTERN.test(value)
    ? value
    : null;
}

function isTrustedRoutingProvenance(
  value: unknown,
): value is TrustedRoutingProvenance {
  return TRUSTED_ROUTING_PROVENANCES.includes(
    value as TrustedRoutingProvenance,
  );
}

export function isTrustedTenantRoutingContext(
  value: unknown,
): value is TrustedTenantRoutingContext {
  if (!exactObjectKeys(value, CONTEXT_KEYS)) return false;
  const routingIdentity = normalizeTrustedRoutingIdentity(
    value.trustedRoutingKey,
  );
  return routingIdentity !== null &&
    routingIdentity === value.trustedRoutingKey &&
    normalizeEnvironment(value.environment) === value.environment &&
    isTrustedRoutingProvenance(value.provenance);
}

export function buildTrustedTenantRoutingContext(
  configuration: ServerOwnedTrustedIngressConfiguration,
): TrustedIngressResult {
  if (!exactObjectKeys(configuration, CONFIGURATION_KEYS)) {
    return { ok: false, code: "malformed_trusted_ingress_configuration" };
  }
  if (!isTrustedRoutingProvenance(configuration.provenance)) {
    return { ok: false, code: "unknown_trust_provenance" };
  }
  const selectedRoutingIdentity = normalizeTrustedRoutingIdentity(
    configuration.selectedRoutingIdentity,
  );
  if (!selectedRoutingIdentity) {
    return { ok: false, code: "invalid_routing_identity" };
  }
  const environment = normalizeEnvironment(configuration.environment);
  if (!environment) {
    return { ok: false, code: "environment_mismatch" };
  }
  if (
    !Array.isArray(configuration.allowedRoutes) ||
    configuration.allowedRoutes.length === 0
  ) {
    return { ok: false, code: "unknown_routing_identity" };
  }

  const normalizedRoutes: Array<
    Readonly<{
      routingIdentity: string;
      environment: string;
    }>
  > = [];
  const exactRoutes = new Set<string>();
  for (const route of configuration.allowedRoutes) {
    if (!exactObjectKeys(route, ROUTE_KEYS)) {
      return { ok: false, code: "malformed_trusted_ingress_configuration" };
    }
    const routingIdentity = normalizeTrustedRoutingIdentity(
      route.routingIdentity,
    );
    const routeEnvironment = normalizeEnvironment(route.environment);
    if (!routingIdentity) {
      return { ok: false, code: "invalid_routing_identity" };
    }
    if (!routeEnvironment) {
      return { ok: false, code: "environment_mismatch" };
    }
    const exactRoute = `${routingIdentity}\u0000${routeEnvironment}`;
    if (exactRoutes.has(exactRoute)) {
      return { ok: false, code: "ambiguous_routing_configuration" };
    }
    exactRoutes.add(exactRoute);
    normalizedRoutes.push({ routingIdentity, environment: routeEnvironment });
  }

  const identityRoutes = normalizedRoutes.filter((route) =>
    route.routingIdentity === selectedRoutingIdentity
  );
  if (identityRoutes.length === 0) {
    return { ok: false, code: "unknown_routing_identity" };
  }
  const environmentRoutes = identityRoutes.filter((route) =>
    route.environment === environment
  );
  if (environmentRoutes.length === 0) {
    return { ok: false, code: "environment_mismatch" };
  }
  if (environmentRoutes.length !== 1) {
    return { ok: false, code: "ambiguous_routing_configuration" };
  }

  return {
    ok: true,
    value: Object.freeze({
      trustedRoutingKey: selectedRoutingIdentity,
      environment,
      provenance: configuration.provenance,
    }),
  };
}
