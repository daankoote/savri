import {
  createPresentationSourceContextFromTenantBinding,
  type PresentationBrandSourceFailureCode,
} from "../../../platform/runtime/presentation/presentation_brand_source.ts";
import {
  projectPresentationBrand,
  type PublicPresentationBrandV1,
} from "../../../platform/runtime/presentation/presentation_brand_config.ts";
import {
  composePresentationBrandSource,
  type ServerOwnedPresentationSourceComposition,
} from "../../../platform/runtime/presentation/presentation_source_composition.ts";
import type { PlatformPresentationConfigReader } from "../../../platform/runtime/presentation/adapters/platform_control_plane_presentation_v1.ts";

export type AppPresentationTenantBinding = Readonly<{
  tenantId: string;
  environment: string;
}>;

export type ServerPresentationEnvironmentReader = Readonly<{
  get(name: string): string | undefined;
}>;

export const APP_PRESENTATION_BOOTSTRAP_MODE =
  "presentation_bootstrap_browser" as const;
export const APP_PRESENTATION_BOOTSTRAP_SCHEMA_VERSION =
  "presentation_bootstrap_browser_v1" as const;

export type AppPresentationBootstrapResponse = Readonly<{
  ok: true;
  mode: typeof APP_PRESENTATION_BOOTSTRAP_MODE;
  schema_version: typeof APP_PRESENTATION_BOOTSTRAP_SCHEMA_VERSION;
  presentation: PublicPresentationBrandV1;
}>;

export type AppPresentationBootstrapFailureCode =
  | "presentation_source_configuration_invalid"
  | "presentation_source_unavailable"
  | PresentationBrandSourceFailureCode;

export type AppPresentationBootstrapResult =
  | Readonly<{ ok: true; value: AppPresentationBootstrapResponse }>
  | Readonly<{ ok: false; code: AppPresentationBootstrapFailureCode }>;

function environmentValue(
  environment: ServerPresentationEnvironmentReader,
  name: string,
): string {
  return String(environment.get(name) ?? "").trim();
}

function parseStaticCustomConfig(
  environment: ServerPresentationEnvironmentReader,
): unknown | null {
  const raw = environmentValue(
    environment,
    "ENVAL_STATIC_PRESENTATION_CONFIG_V1",
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function buildServerOwnedPresentationSourceComposition(
  environment: ServerPresentationEnvironmentReader,
  tenantExecution: AppPresentationTenantBinding,
  managedReader: PlatformPresentationConfigReader | null = null,
): ServerOwnedPresentationSourceComposition | null {
  const deploymentMode = environmentValue(
    environment,
    "ENVAL_PRESENTATION_SOURCE_MODE",
  );
  if (deploymentMode === "platform_control_plane_presentation_v1") {
    return managedReader
      ? Object.freeze({
        deploymentMode,
        platformControlPlaneReader: managedReader,
      })
      : null;
  }
  if (deploymentMode !== "static_presentation_config_v1") return null;

  const presentationMode = environmentValue(
    environment,
    "ENVAL_STATIC_PRESENTATION_MODE",
  );
  if (presentationMode === "ENVAL_DEFAULTS") {
    return Object.freeze({
      deploymentMode,
      staticPresentationConfigurations: [Object.freeze({
        tenantId: tenantExecution.tenantId,
        environment: tenantExecution.environment,
        presentationMode,
      })],
    });
  }
  if (presentationMode !== "CUSTOM_V1") return null;
  const presentationConfig = parseStaticCustomConfig(environment);
  if (!presentationConfig) return null;
  return Object.freeze({
    deploymentMode,
    staticPresentationConfigurations: [Object.freeze({
      tenantId: tenantExecution.tenantId,
      environment: tenantExecution.environment,
      presentationMode,
      presentationConfig,
    })],
  });
}

export async function resolveAppPresentationBootstrap(
  tenantExecution: AppPresentationTenantBinding,
  sourceComposition: ServerOwnedPresentationSourceComposition,
): Promise<AppPresentationBootstrapResult> {
  try {
    const sourceContext = createPresentationSourceContextFromTenantBinding(
      tenantExecution,
    );
    if (!sourceContext.ok) {
      return { ok: false, code: sourceContext.code };
    }
    const source = composePresentationBrandSource(sourceComposition);
    if (!source.ok) {
      return {
        ok: false,
        code: "presentation_source_configuration_invalid",
      };
    }
    const resolved = await source.source.resolvePresentationBrand(
      sourceContext.value,
    );
    if (!resolved.ok) return resolved;
    return {
      ok: true,
      value: Object.freeze({
        ok: true,
        mode: APP_PRESENTATION_BOOTSTRAP_MODE,
        schema_version: APP_PRESENTATION_BOOTSTRAP_SCHEMA_VERSION,
        presentation: projectPresentationBrand(resolved.value),
      }),
    };
  } catch {
    return { ok: false, code: "presentation_source_unavailable" };
  }
}
