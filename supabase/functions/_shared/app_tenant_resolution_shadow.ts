import {
  isValidTenantReference,
  resolveTenantRuntimeContext,
} from "../../../platform/runtime/tenant-resolution/tenant_resolution.ts";
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
  dataPlaneReference: string;
}>;

export type AppTenantResolutionShadowExecution = Readonly<{
  current: CurrentAuthoritativeTenantRuntimeContext;
  trustedRoutingKey: string;
  composition: ServerOwnedTenantResolutionComposition;
}>;

export type AppTenantResolutionShadowDiagnostic = Readonly<{
  mode: TenantResolutionDeploymentMode | "unknown";
  parityStatus: "pass" | "mismatch" | "resolver_failure" | "not_configured";
  tenantReferenceHash: string | null;
  correlationReferenceHash: string | null;
  failureClass: "composition" | "resolution" | "timeout" | "unexpected" | null;
}>;

export type AppTenantResolutionShadowObservationOptions = Readonly<{
  execution?: AppTenantResolutionShadowExecution | null;
  serverEnvironment?: ServerEnvironmentReader;
  managedReader?: PlatformControlPlaneReader | null;
  sink?: ((diagnostic: AppTenantResolutionShadowDiagnostic) => void) | null;
  timeoutMs?: number;
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
): Promise<AppTenantResolutionShadowDiagnostic> {
  return Object.freeze({
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
    !bounded(current.dataPlaneReference, 200)
  ) return null;
  return Object.freeze({ ...current });
}

export async function runAppTenantResolutionShadow(
  execution: AppTenantResolutionShadowExecution,
  correlationReference: string | null = null,
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
      );
    }
    const resolved = await resolveTenantRuntimeContext(composition.adapter, {
      trustedRoutingKey: execution.trustedRoutingKey,
      environment: current.environment,
    });
    if (!resolved.ok) {
      return await diagnostic(
        mode,
        "resolver_failure",
        current.tenantId,
        correlationReference,
        "resolution",
      );
    }
    const shadow = {
      tenantId: resolved.value.tenantId,
      environment: resolved.value.dataPlane.environment,
      locatorId: resolved.value.dataPlane.locatorId,
      dataPlaneReference: resolved.value.dataPlane.dataPlaneReference,
    };
    const parity = current.tenantId === shadow.tenantId &&
      current.environment === shadow.environment &&
      current.locatorId === shadow.locatorId &&
      current.dataPlaneReference === shadow.dataPlaneReference;
    return await diagnostic(
      mode,
      parity ? "pass" : "mismatch",
      current.tenantId,
      correlationReference,
    );
  } catch {
    return await diagnostic(
      mode,
      "resolver_failure",
      null,
      correlationReference,
      "unexpected",
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
  return Object.freeze({ current, trustedRoutingKey, composition });
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

export async function observeAppTenantResolutionShadow(
  runtimeEnvironment: string,
  correlationReference: string | null,
  options: AppTenantResolutionShadowObservationOptions = {},
): Promise<AppTenantResolutionShadowDiagnostic> {
  try {
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
            ),
          ), timeoutMs);
      },
    );
    let observed: AppTenantResolutionShadowDiagnostic;
    try {
      observed = await Promise.race([
        runAppTenantResolutionShadow(execution, correlationReference),
        timeout,
      ]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
    const sink = options.sink === undefined ? defaultSink : options.sink;
    if (sink) {
      try {
        sink(observed);
      } catch {
        // Shadow diagnostics never affect the authoritative request path.
      }
    }
    return observed;
  } catch {
    return await diagnostic(
      "unknown",
      "resolver_failure",
      null,
      correlationReference,
      "unexpected",
    );
  }
}
