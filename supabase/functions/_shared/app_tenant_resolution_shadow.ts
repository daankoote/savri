import {
  isValidTenantReference,
  resolveTenantRuntimeContext,
} from "../../../platform/runtime/tenant-resolution/tenant_resolution.ts";
import {
  buildTrustedTenantRoutingContext,
  type TrustedTenantRoutingContext,
} from "../../../platform/runtime/tenant-resolution/trusted_ingress.ts";
import type { PlatformControlPlaneReader } from "../../../platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts";
import type { ServerOwnedStaticSingleTenantConfiguration } from "../../../platform/runtime/tenant-resolution/adapters/static_single_tenant_v1.ts";
import {
  composeTenantResolutionAdapter,
  type ServerOwnedTenantResolutionComposition,
  TENANT_RESOLUTION_DEPLOYMENT_MODES,
  type TenantResolutionDeploymentMode,
} from "../../../platform/runtime/tenant-resolution/tenant_resolution_composition.ts";

export type CurrentAuthoritativeTenantRuntimeContext = Readonly<{
  tenantId: string;
  environment: string;
  locatorId: string;
  deploymentOwnership:
    | "ENVAL_MANAGED_DEDICATED"
    | "CUSTOMER_MANAGED_SELF_HOSTED";
  providerType: string;
  dataPlaneReference: string;
}>;

export const APP_TENANT_RESOLUTION_AUTHORITY_MODES = Object.freeze(
  ["SHADOW", "AUTHORITATIVE"] as const,
);

export type AppTenantResolutionAuthorityMode =
  typeof APP_TENANT_RESOLUTION_AUTHORITY_MODES[number];

export type AppTenantResolutionShadowExecution = Readonly<{
  current: CurrentAuthoritativeTenantRuntimeContext;
  trustedRoutingContext: TrustedTenantRoutingContext;
  composition: ServerOwnedTenantResolutionComposition;
}>;

export type AppTenantResolutionShadowDiagnostic = Readonly<{
  authorityMode: AppTenantResolutionAuthorityMode | "unknown";
  mode: TenantResolutionDeploymentMode | "unknown";
  parityStatus: "pass" | "mismatch" | "resolver_failure" | "not_configured";
  tenantReferenceHash: string | null;
  correlationReferenceHash: string | null;
  failureClass: "composition" | "resolution" | "timeout" | "unexpected" | null;
}>;

export type AppTenantResolutionShadowObservationOptions = Readonly<{
  authorityMode?: string | null;
  execution?: AppTenantResolutionShadowExecution | null;
  serverEnvironment?: ServerEnvironmentReader;
  managedReader?: PlatformControlPlaneReader | null;
  sink?: ((diagnostic: AppTenantResolutionShadowDiagnostic) => void) | null;
  timeoutMs?: number;
}>;

export type AppTenantResolutionGateFailureCode =
  | "tenant_resolution_unavailable"
  | "tenant_resolution_mismatch"
  | "tenant_resolution_configuration_invalid";

export type AppTenantResolutionGateResult =
  | Readonly<{
    ok: true;
    authorityMode: AppTenantResolutionAuthorityMode;
    diagnostic: AppTenantResolutionShadowDiagnostic;
  }>
  | Readonly<{
    ok: false;
    authorityMode: AppTenantResolutionAuthorityMode | "unknown";
    code: AppTenantResolutionGateFailureCode;
    diagnostic: AppTenantResolutionShadowDiagnostic;
  }>;

export type ServerEnvironmentReader = Readonly<{
  get(name: string): string | undefined;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const CREDENTIAL_PATTERN =
  /(password|passwd|service.?role|database.?url|raw.?secret|credential|access.?token|api.?key)/i;
const DEFAULT_TIMEOUT_MS = 250;

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value === value.trim() &&
    value.length > 0 && value.length <= max && !CREDENTIAL_PATTERN.test(value);
}

function safeMode(value: unknown): TenantResolutionDeploymentMode | "unknown" {
  return TENANT_RESOLUTION_DEPLOYMENT_MODES.includes(
      value as TenantResolutionDeploymentMode,
    )
    ? value as TenantResolutionDeploymentMode
    : "unknown";
}

function safeAuthorityMode(
  value: unknown,
): AppTenantResolutionAuthorityMode | "unknown" {
  return APP_TENANT_RESOLUTION_AUTHORITY_MODES.includes(
      value as AppTenantResolutionAuthorityMode,
    )
    ? value as AppTenantResolutionAuthorityMode
    : "unknown";
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function diagnostic(
  mode: unknown,
  parityStatus: AppTenantResolutionShadowDiagnostic["parityStatus"],
  tenantId: string | null,
  correlationReference: string | null,
  failureClass: AppTenantResolutionShadowDiagnostic["failureClass"] = null,
  authorityMode: unknown = "SHADOW",
): Promise<AppTenantResolutionShadowDiagnostic> {
  return Object.freeze({
    authorityMode: safeAuthorityMode(authorityMode),
    mode: safeMode(mode),
    parityStatus,
    tenantReferenceHash: tenantId && isValidTenantReference(tenantId)
      ? await sha256(tenantId)
      : null,
    correlationReferenceHash: correlationReference &&
        bounded(correlationReference, 200)
      ? await sha256(correlationReference)
      : null,
    failureClass,
  });
}

function normalizeCurrent(
  current: CurrentAuthoritativeTenantRuntimeContext,
): CurrentAuthoritativeTenantRuntimeContext | null {
  if (
    !current || !isValidTenantReference(current.tenantId) ||
    !TOKEN_PATTERN.test(current.environment) ||
    !UUID_PATTERN.test(current.locatorId) ||
    ![
      "ENVAL_MANAGED_DEDICATED",
      "CUSTOMER_MANAGED_SELF_HOSTED",
    ].includes(current.deploymentOwnership) ||
    !TOKEN_PATTERN.test(current.providerType) ||
    !bounded(current.dataPlaneReference, 200)
  ) return null;
  return Object.freeze({ ...current });
}

export async function runAppTenantResolutionShadow(
  execution: AppTenantResolutionShadowExecution,
  correlationReference: string | null = null,
  authorityMode: AppTenantResolutionAuthorityMode = "SHADOW",
): Promise<AppTenantResolutionShadowDiagnostic> {
  const mode = execution?.composition?.deploymentMode;
  try {
    const current = normalizeCurrent(execution.current);
    if (!current) {
      return await diagnostic(
        mode,
        "resolver_failure",
        null,
        correlationReference,
        "composition",
        authorityMode,
      );
    }
    const composition = composeTenantResolutionAdapter(execution.composition);
    if (!composition.ok) {
      return await diagnostic(
        mode,
        "resolver_failure",
        current.tenantId,
        correlationReference,
        "composition",
        authorityMode,
      );
    }
    const resolved = await resolveTenantRuntimeContext(
      composition.adapter,
      execution.trustedRoutingContext,
    );
    if (!resolved.ok) {
      return await diagnostic(
        mode,
        "resolver_failure",
        current.tenantId,
        correlationReference,
        "resolution",
        authorityMode,
      );
    }
    const shadow = {
      tenantId: resolved.value.tenantId,
      environment: resolved.value.dataPlane.environment,
      locatorId: resolved.value.dataPlane.locatorId,
      deploymentOwnership: resolved.value.dataPlane.deploymentOwnership,
      providerType: resolved.value.dataPlane.providerType,
      dataPlaneReference: resolved.value.dataPlane.dataPlaneReference,
    };
    const parity = current.tenantId === shadow.tenantId &&
      current.environment === shadow.environment &&
      current.locatorId === shadow.locatorId &&
      current.deploymentOwnership === shadow.deploymentOwnership &&
      current.providerType === shadow.providerType &&
      current.dataPlaneReference === shadow.dataPlaneReference;
    return await diagnostic(
      mode,
      parity ? "pass" : "mismatch",
      current.tenantId,
      correlationReference,
      null,
      authorityMode,
    );
  } catch {
    return await diagnostic(
      mode,
      "resolver_failure",
      null,
      correlationReference,
      "unexpected",
      authorityMode,
    );
  }
}

function environmentValue(
  environment: ServerEnvironmentReader,
  name: string,
): string {
  return String(environment.get(name) ?? "").trim();
}

export function buildAppTenantResolutionShadowFromServerEnvironment(
  environment: ServerEnvironmentReader,
  runtimeEnvironment: string,
  managedReader: PlatformControlPlaneReader | null = null,
): AppTenantResolutionShadowExecution | null {
  const mode = environmentValue(
    environment,
    "ENVAL_TENANT_RESOLUTION_SHADOW_MODE",
  );
  if (!mode) return null;

  const tenantId = environmentValue(environment, "ENVAL_TENANT_REFERENCE");
  const trustedRoutingKey = environmentValue(
    environment,
    "ENVAL_TRUSTED_TENANT_ROUTING_KEY",
  );
  const provenance = mode === "static_single_tenant_v1"
    ? "DEPLOYMENT_FIXED"
    : environmentValue(environment, "ENVAL_TRUSTED_INGRESS_PROVENANCE");
  const trustedRoutingContext = buildTrustedTenantRoutingContext({
    provenance,
    selectedRoutingIdentity: trustedRoutingKey,
    environment: runtimeEnvironment,
    allowedRoutes: [{
      routingIdentity: trustedRoutingKey,
      environment: runtimeEnvironment,
    }],
  });
  if (!trustedRoutingContext.ok) return null;
  const locatorId = environmentValue(
    environment,
    "ENVAL_DATA_PLANE_LOCATOR_ID",
  );
  const dataPlaneReference = environmentValue(
    environment,
    "ENVAL_DATA_PLANE_REFERENCE",
  );
  const current = {
    tenantId,
    environment: runtimeEnvironment,
    locatorId,
    deploymentOwnership: environmentValue(
      environment,
      "ENVAL_DATA_PLANE_DEPLOYMENT_OWNERSHIP",
    ) as CurrentAuthoritativeTenantRuntimeContext["deploymentOwnership"],
    providerType: environmentValue(
      environment,
      "ENVAL_DATA_PLANE_PROVIDER_TYPE",
    ),
    dataPlaneReference,
  };
  let composition: ServerOwnedTenantResolutionComposition;
  if (mode === "platform_control_plane_v1") {
    composition = {
      deploymentMode: mode,
      platformControlPlaneReader: managedReader,
    };
  } else if (mode === "static_single_tenant_v1") {
    const staticConfiguration: ServerOwnedStaticSingleTenantConfiguration = {
      trustedRoutingKey,
      tenantId,
      dataPlane: {
        locatorId,
        deploymentOwnership: environmentValue(
          environment,
          "ENVAL_DATA_PLANE_DEPLOYMENT_OWNERSHIP",
        ) as ServerOwnedStaticSingleTenantConfiguration["dataPlane"][
          "deploymentOwnership"
        ],
        environment: runtimeEnvironment,
        providerType: environmentValue(
          environment,
          "ENVAL_DATA_PLANE_PROVIDER_TYPE",
        ),
        dataPlaneReference,
        applicationRouteReference: environmentValue(
          environment,
          "ENVAL_APPLICATION_ROUTE_REFERENCE",
        ),
        secretReferenceId: environmentValue(
          environment,
          "ENVAL_DATA_PLANE_SECRET_REFERENCE_ID",
        ),
      },
    };
    composition = {
      deploymentMode: mode,
      staticSingleTenantConfigurations: [staticConfiguration],
    };
  } else {
    composition = { deploymentMode: mode };
  }
  return Object.freeze({
    current,
    trustedRoutingContext: trustedRoutingContext.value,
    composition,
  });
}

function defaultServerEnvironment(): ServerEnvironmentReader {
  return { get: (name) => Deno.env.get(name) };
}

function defaultSink(diagnosticValue: AppTenantResolutionShadowDiagnostic) {
  console.info(
    "tenant_resolution_shadow",
    JSON.stringify(diagnosticValue),
  );
}

function emitSafeDiagnostic(
  diagnosticValue: AppTenantResolutionShadowDiagnostic,
  sink: AppTenantResolutionShadowObservationOptions["sink"],
) {
  const selectedSink = sink === undefined ? defaultSink : sink;
  if (!selectedSink) return;
  try {
    selectedSink(diagnosticValue);
  } catch {
    // Tenant-resolution diagnostics never affect request handling.
  }
}

export async function observeAppTenantResolutionShadow(
  runtimeEnvironment: string,
  correlationReference: string | null,
  options: AppTenantResolutionShadowObservationOptions = {},
): Promise<AppTenantResolutionShadowDiagnostic> {
  try {
    const authorityMode = safeAuthorityMode(options.authorityMode ?? "SHADOW");
    const execution = options.execution ??
      buildAppTenantResolutionShadowFromServerEnvironment(
        options.serverEnvironment ?? defaultServerEnvironment(),
        runtimeEnvironment,
        options.managedReader ?? null,
      );
    if (!execution) {
      return await diagnostic(
        "unknown",
        "not_configured",
        null,
        correlationReference,
        null,
        authorityMode,
      );
    }
    const timeoutMs = Number.isInteger(options.timeoutMs) &&
        Number(options.timeoutMs) > 0 && Number(options.timeoutMs) <= 2_000
      ? Number(options.timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    let timeoutId: number | undefined;
    const timeout = new Promise<AppTenantResolutionShadowDiagnostic>(
      (resolve) => {
        timeoutId = setTimeout(async () =>
          resolve(
            await diagnostic(
              execution.composition.deploymentMode,
              "resolver_failure",
              execution.current.tenantId,
              correlationReference,
              "timeout",
              authorityMode,
            ),
          ), timeoutMs);
      },
    );
    let observed: AppTenantResolutionShadowDiagnostic;
    try {
      observed = await Promise.race([
        runAppTenantResolutionShadow(
          execution,
          correlationReference,
          authorityMode === "unknown" ? "SHADOW" : authorityMode,
        ),
        timeout,
      ]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
    emitSafeDiagnostic(observed, options.sink);
    return observed;
  } catch {
    const observed = await diagnostic(
      "unknown",
      "resolver_failure",
      null,
      correlationReference,
      "unexpected",
      options.authorityMode ?? "SHADOW",
    );
    emitSafeDiagnostic(observed, options.sink);
    return observed;
  }
}

export async function enforceAppTenantResolutionGate(
  runtimeEnvironment: string,
  correlationReference: string | null,
  options: AppTenantResolutionShadowObservationOptions = {},
): Promise<AppTenantResolutionGateResult> {
  const serverEnvironment = options.serverEnvironment ??
    defaultServerEnvironment();
  let configuredAuthorityMode: string;
  try {
    configuredAuthorityMode = options.authorityMode ??
      (environmentValue(
        serverEnvironment,
        "ENVAL_TENANT_RESOLUTION_AUTHORITY_MODE",
      ) || "SHADOW");
  } catch {
    const observed = await diagnostic(
      "unknown",
      "resolver_failure",
      null,
      correlationReference,
      "composition",
      "unknown",
    );
    emitSafeDiagnostic(observed, options.sink);
    return Object.freeze({
      ok: false,
      authorityMode: "unknown",
      code: "tenant_resolution_configuration_invalid",
      diagnostic: observed,
    });
  }
  const authorityMode = safeAuthorityMode(configuredAuthorityMode);

  if (authorityMode === "unknown") {
    const observed = await diagnostic(
      "unknown",
      "resolver_failure",
      null,
      correlationReference,
      "composition",
      authorityMode,
    );
    emitSafeDiagnostic(observed, options.sink);
    return Object.freeze({
      ok: false,
      authorityMode,
      code: "tenant_resolution_configuration_invalid",
      diagnostic: observed,
    });
  }

  if (authorityMode === "SHADOW") {
    const observed = await observeAppTenantResolutionShadow(
      runtimeEnvironment,
      correlationReference,
      { ...options, authorityMode },
    );
    return Object.freeze({
      ok: true,
      authorityMode,
      diagnostic: observed,
    });
  }

  let execution: AppTenantResolutionShadowExecution | null;
  try {
    execution = options.execution ??
      buildAppTenantResolutionShadowFromServerEnvironment(
        serverEnvironment,
        runtimeEnvironment,
        options.managedReader ?? null,
      );
  } catch {
    execution = null;
  }
  if (!execution) {
    const observed = await diagnostic(
      "unknown",
      "resolver_failure",
      null,
      correlationReference,
      "composition",
      authorityMode,
    );
    emitSafeDiagnostic(observed, options.sink);
    return Object.freeze({
      ok: false,
      authorityMode,
      code: "tenant_resolution_configuration_invalid",
      diagnostic: observed,
    });
  }

  const observed = await observeAppTenantResolutionShadow(
    runtimeEnvironment,
    correlationReference,
    { ...options, authorityMode, execution },
  );
  if (observed.parityStatus === "pass") {
    return Object.freeze({ ok: true, authorityMode, diagnostic: observed });
  }
  const code: AppTenantResolutionGateFailureCode =
    observed.parityStatus === "mismatch"
      ? "tenant_resolution_mismatch"
      : observed.failureClass === "composition"
      ? "tenant_resolution_configuration_invalid"
      : "tenant_resolution_unavailable";
  return Object.freeze({
    ok: false,
    authorityMode,
    code,
    diagnostic: observed,
  });
}
