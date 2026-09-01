import {
  isValidResolvedDataPlaneLocation,
  isValidTenantReference,
  type ResolvedTenantContext,
} from "../tenant-resolution/tenant_resolution.ts";
import type { PresentationBrandConfigV1 } from "./presentation_brand_config.ts";

export type PresentationBrandSourceFailureCode =
  | "invalid_presentation_source_context"
  | "tenant_mismatch"
  | "environment_mismatch"
  | "presentation_config_missing"
  | "presentation_config_ambiguous"
  | "presentation_config_invalid";

export type PresentationBrandSourceResult =
  | Readonly<{ ok: true; value: PresentationBrandConfigV1 }>
  | Readonly<{ ok: false; code: PresentationBrandSourceFailureCode }>;

export interface PresentationBrandSourcePort {
  resolvePresentationBrand(
    context: ResolvedPresentationSourceContext,
  ): Promise<PresentationBrandSourceResult>;
}

const TRUSTED_CONTEXTS = new WeakSet<object>();
const CONTEXT_CONSTRUCTION_TOKEN = Symbol("resolved_presentation_source");

export class ResolvedPresentationSourceContext {
  readonly tenantId: string;
  readonly environment: string;

  constructor(
    tenantId: string,
    environment: string,
    token: typeof CONTEXT_CONSTRUCTION_TOKEN,
  ) {
    if (token !== CONTEXT_CONSTRUCTION_TOKEN) {
      throw new TypeError("presentation_source_context_factory_required");
    }
    this.tenantId = tenantId;
    this.environment = environment;
    TRUSTED_CONTEXTS.add(this);
    Object.freeze(this);
  }
}

export type PresentationSourceContextResult =
  | Readonly<{ ok: true; value: ResolvedPresentationSourceContext }>
  | Readonly<{
    ok: false;
    code: "invalid_presentation_source_context";
  }>;

export type ResolvedTenantPresentationBinding = Readonly<{
  tenantId: string;
  environment: string;
}>;

function resolvedPresentationSourceContext(
  tenantId: unknown,
  environment: unknown,
): PresentationSourceContextResult {
  if (
    !isValidTenantReference(tenantId) || typeof environment !== "string" ||
    !/^[a-z][a-z0-9_-]{1,63}$/.test(environment)
  ) {
    return { ok: false, code: "invalid_presentation_source_context" };
  }
  return {
    ok: true,
    value: new ResolvedPresentationSourceContext(
      tenantId,
      environment,
      CONTEXT_CONSTRUCTION_TOKEN,
    ),
  };
}

export function createPresentationSourceContextFromTenantBinding(
  binding: ResolvedTenantPresentationBinding,
): PresentationSourceContextResult {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    return { ok: false, code: "invalid_presentation_source_context" };
  }
  return resolvedPresentationSourceContext(
    binding.tenantId,
    binding.environment,
  );
}

export function createResolvedPresentationSourceContext(
  resolvedTenant: ResolvedTenantContext,
): PresentationSourceContextResult {
  if (
    !resolvedTenant || typeof resolvedTenant !== "object" ||
    !isValidTenantReference(resolvedTenant.tenantId) ||
    !isValidResolvedDataPlaneLocation(resolvedTenant.dataPlane) ||
    resolvedTenant.dataPlane.environment.length === 0
  ) {
    return { ok: false, code: "invalid_presentation_source_context" };
  }
  return resolvedPresentationSourceContext(
    resolvedTenant.tenantId,
    resolvedTenant.dataPlane.environment,
  );
}

export function isResolvedPresentationSourceContext(
  value: unknown,
): value is ResolvedPresentationSourceContext {
  return Boolean(value) && typeof value === "object" &&
    TRUSTED_CONTEXTS.has(value as object);
}
