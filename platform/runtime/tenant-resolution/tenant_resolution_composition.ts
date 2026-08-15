import {
  type PlatformControlPlaneReader,
  PlatformControlPlaneV1Adapter,
} from "./adapters/platform_control_plane_v1.ts";
import {
  createStaticSingleTenantV1Adapter,
  type ServerOwnedStaticSingleTenantConfiguration,
  type StaticSingleTenantCreationFailureCode,
} from "./adapters/static_single_tenant_v1.ts";
import type { TenantResolutionAdapter } from "./tenant_resolution.ts";

export const TENANT_RESOLUTION_DEPLOYMENT_MODES = Object.freeze(
  [
    "platform_control_plane_v1",
    "static_single_tenant_v1",
  ] as const,
);

export type TenantResolutionDeploymentMode =
  typeof TENANT_RESOLUTION_DEPLOYMENT_MODES[number];

export type ServerOwnedTenantResolutionComposition = Readonly<{
  deploymentMode: string;
  platformControlPlaneReader?: PlatformControlPlaneReader | null;
  staticSingleTenantConfigurations?:
    | readonly ServerOwnedStaticSingleTenantConfiguration[]
    | null;
}>;

export type TenantResolutionCompositionFailureCode =
  | "unknown_deployment_mode"
  | "malformed_deployment_configuration"
  | "missing_platform_control_plane_reader"
  | "ambiguous_deployment_configuration"
  | StaticSingleTenantCreationFailureCode;

export type TenantResolutionCompositionResult =
  | Readonly<{ ok: true; adapter: TenantResolutionAdapter }>
  | Readonly<{ ok: false; code: TenantResolutionCompositionFailureCode }>;

export function composeTenantResolutionAdapter(
  configuration: ServerOwnedTenantResolutionComposition,
): TenantResolutionCompositionResult {
  const allowedKeys = new Set([
    "deploymentMode",
    "platformControlPlaneReader",
    "staticSingleTenantConfigurations",
  ]);
  if (
    !configuration || typeof configuration !== "object" ||
    Object.keys(configuration).some((key) => !allowedKeys.has(key))
  ) {
    return { ok: false, code: "malformed_deployment_configuration" };
  }
  if (
    !TENANT_RESOLUTION_DEPLOYMENT_MODES.includes(
      configuration.deploymentMode as TenantResolutionDeploymentMode,
    )
  ) {
    return { ok: false, code: "unknown_deployment_mode" };
  }

  const hasManagedReader = Boolean(configuration.platformControlPlaneReader);
  const hasStaticConfiguration =
    configuration.staticSingleTenantConfigurations !== undefined &&
    configuration.staticSingleTenantConfigurations !== null;
  if (hasManagedReader && hasStaticConfiguration) {
    return { ok: false, code: "ambiguous_deployment_configuration" };
  }

  if (configuration.deploymentMode === "platform_control_plane_v1") {
    if (!configuration.platformControlPlaneReader) {
      return { ok: false, code: "missing_platform_control_plane_reader" };
    }
    return {
      ok: true,
      adapter: new PlatformControlPlaneV1Adapter(
        configuration.platformControlPlaneReader,
      ),
    };
  }

  const staticAdapter = createStaticSingleTenantV1Adapter(
    configuration.staticSingleTenantConfigurations,
  );
  if (!staticAdapter.ok) return staticAdapter;
  return { ok: true, adapter: staticAdapter.adapter };
}
