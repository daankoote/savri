import {
  PlatformControlPlanePresentationV1Source,
  type PlatformPresentationConfigReader,
} from "./adapters/platform_control_plane_presentation_v1.ts";
import {
  createStaticPresentationConfigV1Source,
  type ServerOwnedStaticPresentationConfiguration,
  type StaticPresentationSourceCreationFailureCode,
} from "./adapters/static_presentation_config_v1.ts";
import type { PresentationBrandSourcePort } from "./presentation_brand_source.ts";

export const PRESENTATION_SOURCE_DEPLOYMENT_MODES = Object.freeze(
  [
    "platform_control_plane_presentation_v1",
    "static_presentation_config_v1",
  ] as const,
);

export type PresentationSourceDeploymentMode =
  typeof PRESENTATION_SOURCE_DEPLOYMENT_MODES[number];

export type ServerOwnedPresentationSourceComposition = Readonly<{
  deploymentMode: string;
  platformControlPlaneReader?: PlatformPresentationConfigReader | null;
  staticPresentationConfigurations?:
    | readonly ServerOwnedStaticPresentationConfiguration[]
    | null;
}>;

export type PresentationSourceCompositionFailureCode =
  | "unknown_presentation_source_mode"
  | "malformed_presentation_source_configuration"
  | "missing_platform_presentation_reader"
  | "ambiguous_presentation_source_configuration"
  | StaticPresentationSourceCreationFailureCode;

export type PresentationSourceCompositionResult =
  | Readonly<{ ok: true; source: PresentationBrandSourcePort }>
  | Readonly<{
    ok: false;
    code: PresentationSourceCompositionFailureCode;
  }>;

export function composePresentationBrandSource(
  configuration: ServerOwnedPresentationSourceComposition,
): PresentationSourceCompositionResult {
  const allowedKeys = new Set([
    "deploymentMode",
    "platformControlPlaneReader",
    "staticPresentationConfigurations",
  ]);
  if (
    !configuration || typeof configuration !== "object" ||
    Object.keys(configuration).some((key) => !allowedKeys.has(key))
  ) {
    return { ok: false, code: "malformed_presentation_source_configuration" };
  }
  if (
    !PRESENTATION_SOURCE_DEPLOYMENT_MODES.includes(
      configuration.deploymentMode as PresentationSourceDeploymentMode,
    )
  ) {
    return { ok: false, code: "unknown_presentation_source_mode" };
  }

  const hasManagedReader = Boolean(configuration.platformControlPlaneReader);
  const hasStaticConfiguration =
    configuration.staticPresentationConfigurations !== undefined &&
    configuration.staticPresentationConfigurations !== null;
  if (hasManagedReader && hasStaticConfiguration) {
    return {
      ok: false,
      code: "ambiguous_presentation_source_configuration",
    };
  }

  if (
    configuration.deploymentMode ===
      "platform_control_plane_presentation_v1"
  ) {
    if (!configuration.platformControlPlaneReader) {
      return { ok: false, code: "missing_platform_presentation_reader" };
    }
    return {
      ok: true,
      source: new PlatformControlPlanePresentationV1Source(
        configuration.platformControlPlaneReader,
      ),
    };
  }

  const staticSource = createStaticPresentationConfigV1Source(
    configuration.staticPresentationConfigurations,
  );
  if (!staticSource.ok) return staticSource;
  return { ok: true, source: staticSource.source };
}
