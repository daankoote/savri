import {
  createTenantConfigurationServerSelectionAuthorityV1,
  type TenantConfigurationClockPort,
  type TenantConfigurationResult,
  type TenantConfigurationServerSelectionAuthorityV1,
  type TenantConfigurationSourcePort,
} from "./app_tenant_configuration.ts";
import type { AppTenantExecutionContext } from "./app_tenant_resolution_shadow.ts";

export type { TenantConfigurationClockPort } from "./app_tenant_configuration.ts";

export type StaticSingleTenantConfigurationV1Source = Readonly<{
  manifests: readonly unknown[];
  componentRevisions: readonly unknown[];
}>;

const SERVER_CLOCK: TenantConfigurationClockPort = Object.freeze({
  now: () => new Date(),
});

function freezeSourceValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeSourceValue));
  }
  if (
    value && typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        freezeSourceValue(child),
      ]),
    ));
  }
  return value;
}

export class StaticSingleTenantConfigurationV1Adapter
  implements TenantConfigurationSourcePort {
  readonly #source: StaticSingleTenantConfigurationV1Source;
  readonly #selectionAuthority: TenantConfigurationServerSelectionAuthorityV1;

  constructor(
    source: StaticSingleTenantConfigurationV1Source,
    clock: TenantConfigurationClockPort = SERVER_CLOCK,
  ) {
    this.#source = Object.freeze({
      manifests: freezeSourceValue(source.manifests) as readonly unknown[],
      componentRevisions: freezeSourceValue(
        source.componentRevisions,
      ) as readonly unknown[],
    });
    this.#selectionAuthority =
      createTenantConfigurationServerSelectionAuthorityV1(clock);
  }

  async resolveForExecutionContext(
    context: AppTenantExecutionContext,
  ): Promise<TenantConfigurationResult> {
    if (context?.resolutionMode !== "static_single_tenant_v1") {
      return { ok: false, code: "invalid_execution_context" };
    }
    return await this.#selectionAuthority.resolveForExecutionContext({
      context,
      manifests: this.#source.manifests,
      componentRevisions: this.#source.componentRevisions,
    });
  }
}
