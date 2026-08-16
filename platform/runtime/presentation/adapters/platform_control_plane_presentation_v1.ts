import {
  isResolvedPresentationSourceContext,
  type PresentationBrandSourcePort,
  type PresentationBrandSourceResult,
  type ResolvedPresentationSourceContext,
} from "../presentation_brand_source.ts";
import { validatePresentationBrandConfigV1 } from "../presentation_brand_config.ts";

export type PlatformPresentationConfigRecord = Readonly<{
  tenantId: string;
  environment: string;
  versionSequence: number;
  schemaVersion: string;
  configVersion: string;
  displayName: string;
  shortMark: string;
  productLabel: string;
  tagline: string | null;
  logoReference: string;
  logoInverseReference: string | null;
  faviconReference: string | null;
  socialImageReference: string | null;
  assetAltText: string;
  exportBasename: string | null;
}>;

export interface PlatformPresentationConfigReader {
  findCurrentPresentationConfigs(
    tenantId: string,
    environment: string,
  ): Promise<readonly PlatformPresentationConfigRecord[]>;
}

const RECORD_KEYS = Object.freeze([
  "assetAltText",
  "configVersion",
  "displayName",
  "environment",
  "exportBasename",
  "faviconReference",
  "logoInverseReference",
  "logoReference",
  "productLabel",
  "schemaVersion",
  "shortMark",
  "socialImageReference",
  "tagline",
  "tenantId",
  "versionSequence",
]);

function exactRecordShape(
  value: unknown,
): value is PlatformPresentationConfigRecord {
  return Boolean(value) && typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).sort().join("|") ===
      RECORD_KEYS.join("|");
}

export class PlatformControlPlanePresentationV1Source
  implements PresentationBrandSourcePort {
  readonly #reader: PlatformPresentationConfigReader;

  constructor(reader: PlatformPresentationConfigReader) {
    this.#reader = reader;
  }

  async resolvePresentationBrand(
    context: ResolvedPresentationSourceContext,
  ): Promise<PresentationBrandSourceResult> {
    if (!isResolvedPresentationSourceContext(context)) {
      return { ok: false, code: "invalid_presentation_source_context" };
    }

    const records = await this.#reader.findCurrentPresentationConfigs(
      context.tenantId,
      context.environment,
    );
    if (records.length === 0) {
      return { ok: false, code: "presentation_config_missing" };
    }
    if (records.length !== 1) {
      return { ok: false, code: "presentation_config_ambiguous" };
    }

    const record = records[0];
    if (!exactRecordShape(record)) {
      return { ok: false, code: "presentation_config_invalid" };
    }
    if (record.tenantId !== context.tenantId) {
      return { ok: false, code: "tenant_mismatch" };
    }
    if (record.environment !== context.environment) {
      return { ok: false, code: "environment_mismatch" };
    }
    if (
      !Number.isSafeInteger(record.versionSequence) ||
      record.versionSequence < 1
    ) {
      return { ok: false, code: "presentation_config_invalid" };
    }

    const validated = validatePresentationBrandConfigV1({
      schemaVersion: record.schemaVersion,
      configVersion: record.configVersion,
      displayName: record.displayName,
      shortMark: record.shortMark,
      productLabel: record.productLabel,
      ...(record.tagline === null ? {} : { tagline: record.tagline }),
      assets: {
        logo: record.logoReference,
        ...(record.logoInverseReference === null
          ? {}
          : { logoInverse: record.logoInverseReference }),
        ...(record.faviconReference === null
          ? {}
          : { favicon: record.faviconReference }),
        ...(record.socialImageReference === null
          ? {}
          : { socialImage: record.socialImageReference }),
        altText: record.assetAltText,
      },
      ...(record.exportBasename === null
        ? {}
        : { exportBasename: record.exportBasename }),
    });
    return validated.ok
      ? { ok: true, value: validated.value }
      : { ok: false, code: "presentation_config_invalid" };
  }
}
