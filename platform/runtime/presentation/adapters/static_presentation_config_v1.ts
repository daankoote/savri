import { isValidTenantReference } from "../../tenant-resolution/tenant_resolution.ts";
import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../enval_presentation_defaults.ts";
import {
  isResolvedPresentationSourceContext,
  type PresentationBrandSourcePort,
  type PresentationBrandSourceResult,
  type ResolvedPresentationSourceContext,
} from "../presentation_brand_source.ts";
import {
  type PresentationBrandConfigV1,
  validatePresentationBrandConfigV1,
} from "../presentation_brand_config.ts";

export type ServerOwnedStaticPresentationConfiguration = Readonly<{
  tenantId: string;
  environment: string;
  presentationMode: "ENVAL_DEFAULTS" | "CUSTOM_V1";
  presentationConfig?: unknown;
}>;

export type StaticPresentationSourceCreationFailureCode =
  | "missing_static_presentation_config"
  | "ambiguous_static_presentation_config"
  | "malformed_static_presentation_config";

export type StaticPresentationSourceCreationResult =
  | Readonly<{ ok: true; source: StaticPresentationConfigV1Source }>
  | Readonly<{
    ok: false;
    code: StaticPresentationSourceCreationFailureCode;
  }>;

const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const STATIC_SOURCE_CONSTRUCTION_TOKEN = Symbol(
  "static_presentation_config_v1",
);

function validateConfiguration(
  value: unknown,
):
  | Readonly<{
    tenantId: string;
    environment: string;
    presentationConfig: PresentationBrandConfigV1;
  }>
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isValidTenantReference(candidate.tenantId) ||
    typeof candidate.environment !== "string" ||
    !ENVIRONMENT_PATTERN.test(candidate.environment)
  ) return null;

  if (candidate.presentationMode === "ENVAL_DEFAULTS") {
    if (
      Object.keys(candidate).sort().join("|") !==
        "environment|presentationMode|tenantId"
    ) return null;
    return {
      tenantId: candidate.tenantId,
      environment: candidate.environment,
      presentationConfig: ENVAL_PRESENTATION_BRAND_CONFIG_V1,
    };
  }
  if (
    candidate.presentationMode !== "CUSTOM_V1" ||
    Object.keys(candidate).sort().join("|") !==
      "environment|presentationConfig|presentationMode|tenantId"
  ) return null;
  const validated = validatePresentationBrandConfigV1(
    candidate.presentationConfig,
  );
  return validated.ok
    ? {
      tenantId: candidate.tenantId,
      environment: candidate.environment,
      presentationConfig: validated.value,
    }
    : null;
}

export function createStaticPresentationConfigV1Source(
  configurations: readonly unknown[] | null | undefined,
): StaticPresentationSourceCreationResult {
  if (!Array.isArray(configurations) || configurations.length === 0) {
    return { ok: false, code: "missing_static_presentation_config" };
  }
  if (configurations.length !== 1) {
    return { ok: false, code: "ambiguous_static_presentation_config" };
  }
  const validated = validateConfiguration(configurations[0]);
  if (!validated) {
    return { ok: false, code: "malformed_static_presentation_config" };
  }
  return {
    ok: true,
    source: new StaticPresentationConfigV1Source(
      validated,
      STATIC_SOURCE_CONSTRUCTION_TOKEN,
    ),
  };
}

export class StaticPresentationConfigV1Source
  implements PresentationBrandSourcePort {
  readonly #tenantId: string;
  readonly #environment: string;
  readonly #presentationConfig: PresentationBrandConfigV1;

  constructor(
    configuration: Readonly<{
      tenantId: string;
      environment: string;
      presentationConfig: PresentationBrandConfigV1;
    }>,
    token: typeof STATIC_SOURCE_CONSTRUCTION_TOKEN,
  ) {
    if (token !== STATIC_SOURCE_CONSTRUCTION_TOKEN) {
      throw new TypeError("static_presentation_source_factory_required");
    }
    this.#tenantId = configuration.tenantId;
    this.#environment = configuration.environment;
    this.#presentationConfig = configuration.presentationConfig;
  }

  async resolvePresentationBrand(
    context: ResolvedPresentationSourceContext,
  ): Promise<PresentationBrandSourceResult> {
    if (!isResolvedPresentationSourceContext(context)) {
      return { ok: false, code: "invalid_presentation_source_context" };
    }
    if (context.tenantId !== this.#tenantId) {
      return { ok: false, code: "tenant_mismatch" };
    }
    if (context.environment !== this.#environment) {
      return { ok: false, code: "environment_mismatch" };
    }
    return { ok: true, value: this.#presentationConfig };
  }
}
