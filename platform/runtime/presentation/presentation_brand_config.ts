export const PRESENTATION_BRAND_CONFIG_SCHEMA_VERSION =
  "presentation-brand-config-v1" as const;

export type PresentationBrandAssetsV1 = Readonly<{
  logo: string;
  logoInverse?: string;
  favicon?: string;
  socialImage?: string;
  altText: string;
}>;

export type PresentationBrandIdentityV1 = Readonly<{
  websiteUrl: string;
  contactRoute: string;
  mailDisplayName: string;
  mailAddress: string;
  legalName: string;
}>;

export type PresentationBrandConfigV1 = Readonly<{
  schemaVersion: typeof PRESENTATION_BRAND_CONFIG_SCHEMA_VERSION;
  configVersion: string;
  displayName: string;
  shortMark: string;
  productLabel: string;
  tagline?: string;
  assets: PresentationBrandAssetsV1;
  exportBasename?: string;
  identity: PresentationBrandIdentityV1;
}>;

export type PublicPresentationBrandV1 = Readonly<{
  schemaVersion: typeof PRESENTATION_BRAND_CONFIG_SCHEMA_VERSION;
  configVersion: string;
  displayName: string;
  shortMark: string;
  productLabel: string;
  tagline?: string;
  assets: PresentationBrandAssetsV1;
  exportBasename?: string;
  identity: PresentationBrandIdentityV1;
}>;

export type PresentationBrandConfigFailureCode =
  | "invalid_config_shape"
  | "unknown_config_field"
  | "unsupported_schema_version"
  | "invalid_config_version"
  | "invalid_display_name"
  | "invalid_short_mark"
  | "invalid_product_label"
  | "invalid_tagline"
  | "invalid_asset_shape"
  | "unknown_asset_field"
  | "invalid_logo_reference"
  | "invalid_logo_inverse_reference"
  | "invalid_favicon_reference"
  | "invalid_social_image_reference"
  | "invalid_asset_alt_text"
  | "invalid_export_basename"
  | "invalid_identity_shape"
  | "unknown_identity_field"
  | "invalid_website_url"
  | "invalid_contact_route"
  | "invalid_mail_display_name"
  | "invalid_mail_address"
  | "invalid_legal_name";

export type PresentationBrandConfigResult =
  | Readonly<{ ok: true; value: PresentationBrandConfigV1 }>
  | Readonly<{ ok: false; code: PresentationBrandConfigFailureCode }>;

const CONFIG_KEYS = Object.freeze([
  "assets",
  "configVersion",
  "displayName",
  "exportBasename",
  "identity",
  "productLabel",
  "schemaVersion",
  "shortMark",
  "tagline",
]);
const REQUIRED_CONFIG_KEYS = Object.freeze([
  "assets",
  "configVersion",
  "displayName",
  "identity",
  "productLabel",
  "schemaVersion",
  "shortMark",
]);
const ASSET_KEYS = Object.freeze([
  "altText",
  "favicon",
  "logo",
  "logoInverse",
  "socialImage",
]);
const REQUIRED_ASSET_KEYS = Object.freeze(["altText", "logo"]);
const IDENTITY_KEYS = Object.freeze([
  "contactRoute",
  "legalName",
  "mailAddress",
  "mailDisplayName",
  "websiteUrl",
]);
const CONFIG_VERSION_PATTERN = /^[a-z][a-z0-9._-]{2,63}$/;
const EXPORT_BASENAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ASSET_REFERENCE_PATTERN =
  /^\/assets\/[a-z0-9][a-z0-9/_-]{0,200}\.(?:svg|png|jpe?g|webp|ico)$/;
const UNSAFE_TEXT_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff<>]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" &&
    !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasRequiredKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  return required.every((key) => hasOwn(value, key));
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function normalizedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || UNSAFE_TEXT_PATTERN.test(value)) return null;
  const normalized = value.normalize("NFC").trim();
  const length = [...normalized].length;
  return length > 0 && length <= maxLength ? normalized : null;
}

function optionalText(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null | undefined {
  return hasOwn(value, key) ? normalizedText(value[key], maxLength) : undefined;
}

function safeAssetReference(value: unknown): string | null {
  const normalized = normalizedText(value, 240);
  if (
    !normalized || normalized !== value || normalized.includes("//") ||
    normalized.includes("..") || normalized.includes("\\") ||
    normalized.includes("%") || normalized.includes("?") ||
    normalized.includes("#") ||
    !SAFE_ASSET_REFERENCE_PATTERN.test(normalized)
  ) return null;
  return normalized;
}

function optionalAssetReference(
  assets: Record<string, unknown>,
  key: string,
): string | null | undefined {
  return hasOwn(assets, key) ? safeAssetReference(assets[key]) : undefined;
}

function safeWebsiteUrl(value: unknown): string | null {
  const normalized = normalizedText(value, 240);
  if (!normalized || normalized !== value) return null;
  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash || !parsed.hostname ||
      parsed.origin === "null"
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeContactRoute(value: unknown): string | null {
  const normalized = normalizedText(value, 120);
  if (
    !normalized || normalized !== value || !normalized.startsWith("/") ||
    normalized.startsWith("//") || normalized.includes("..") ||
    normalized.includes("?") || normalized.includes("#") ||
    !/^\/[a-z0-9/_-]*$/u.test(normalized)
  ) return null;
  return normalized;
}

function safeMailAddress(value: unknown): string | null {
  const normalized = normalizedText(value, 254);
  const [localPart, domain, extraPart] = normalized?.split("@") ?? [];
  if (
    !normalized || normalized !== value ||
    !localPart || !domain || extraPart !== undefined ||
    [...localPart].length > 64 ||
    normalized.startsWith(".") || normalized.includes("..") ||
    !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/u
      .test(normalized)
  ) return null;
  if (localPart.endsWith(".")) return null;
  return normalized;
}

function freezeAssets(input: {
  logo: string;
  logoInverse?: string;
  favicon?: string;
  socialImage?: string;
  altText: string;
}): PresentationBrandAssetsV1 {
  return Object.freeze({
    logo: input.logo,
    ...(input.logoInverse === undefined
      ? {}
      : { logoInverse: input.logoInverse }),
    ...(input.favicon === undefined ? {} : { favicon: input.favicon }),
    ...(input.socialImage === undefined
      ? {}
      : { socialImage: input.socialImage }),
    altText: input.altText,
  });
}

function freezeIdentity(
  input: PresentationBrandIdentityV1,
): PresentationBrandIdentityV1 {
  return Object.freeze({
    websiteUrl: input.websiteUrl,
    contactRoute: input.contactRoute,
    mailDisplayName: input.mailDisplayName,
    mailAddress: input.mailAddress,
    legalName: input.legalName,
  });
}

function freezeConfig(input: {
  configVersion: string;
  displayName: string;
  shortMark: string;
  productLabel: string;
  tagline?: string;
  assets: PresentationBrandAssetsV1;
  exportBasename?: string;
  identity: PresentationBrandIdentityV1;
}): PresentationBrandConfigV1 {
  return Object.freeze({
    schemaVersion: PRESENTATION_BRAND_CONFIG_SCHEMA_VERSION,
    configVersion: input.configVersion,
    displayName: input.displayName,
    shortMark: input.shortMark,
    productLabel: input.productLabel,
    ...(input.tagline === undefined ? {} : { tagline: input.tagline }),
    assets: input.assets,
    ...(input.exportBasename === undefined
      ? {}
      : { exportBasename: input.exportBasename }),
    identity: freezeIdentity(input.identity),
  });
}

export function validatePresentationBrandConfigV1(
  input: unknown,
): PresentationBrandConfigResult {
  if (!isRecord(input) || !hasRequiredKeys(input, REQUIRED_CONFIG_KEYS)) {
    return { ok: false, code: "invalid_config_shape" };
  }
  if (!hasOnlyKeys(input, CONFIG_KEYS)) {
    return { ok: false, code: "unknown_config_field" };
  }
  if (input.schemaVersion !== PRESENTATION_BRAND_CONFIG_SCHEMA_VERSION) {
    return { ok: false, code: "unsupported_schema_version" };
  }

  const configVersion = normalizedText(input.configVersion, 64);
  if (!configVersion || !CONFIG_VERSION_PATTERN.test(configVersion)) {
    return { ok: false, code: "invalid_config_version" };
  }
  const displayName = normalizedText(input.displayName, 80);
  if (!displayName) return { ok: false, code: "invalid_display_name" };
  const shortMark = normalizedText(input.shortMark, 8);
  if (!shortMark) return { ok: false, code: "invalid_short_mark" };
  const productLabel = normalizedText(input.productLabel, 80);
  if (!productLabel) return { ok: false, code: "invalid_product_label" };
  const tagline = optionalText(input, "tagline", 160);
  if (tagline === null) return { ok: false, code: "invalid_tagline" };

  if (
    !isRecord(input.assets) ||
    !hasRequiredKeys(input.assets, REQUIRED_ASSET_KEYS)
  ) {
    return { ok: false, code: "invalid_asset_shape" };
  }
  if (!hasOnlyKeys(input.assets, ASSET_KEYS)) {
    return { ok: false, code: "unknown_asset_field" };
  }
  const logo = safeAssetReference(input.assets.logo);
  if (!logo) return { ok: false, code: "invalid_logo_reference" };
  const logoInverse = optionalAssetReference(input.assets, "logoInverse");
  if (logoInverse === null) {
    return { ok: false, code: "invalid_logo_inverse_reference" };
  }
  const favicon = optionalAssetReference(input.assets, "favicon");
  if (favicon === null) {
    return { ok: false, code: "invalid_favicon_reference" };
  }
  const socialImage = optionalAssetReference(input.assets, "socialImage");
  if (socialImage === null) {
    return { ok: false, code: "invalid_social_image_reference" };
  }
  const altText = normalizedText(input.assets.altText, 120);
  if (!altText) return { ok: false, code: "invalid_asset_alt_text" };

  const exportBasename = optionalText(input, "exportBasename", 80);
  if (
    exportBasename === null ||
    (exportBasename !== undefined &&
      !EXPORT_BASENAME_PATTERN.test(exportBasename))
  ) return { ok: false, code: "invalid_export_basename" };

  if (
    !isRecord(input.identity) ||
    !hasRequiredKeys(input.identity, IDENTITY_KEYS)
  ) return { ok: false, code: "invalid_identity_shape" };
  if (!hasOnlyKeys(input.identity, IDENTITY_KEYS)) {
    return { ok: false, code: "unknown_identity_field" };
  }
  const websiteUrl = safeWebsiteUrl(input.identity.websiteUrl);
  if (!websiteUrl) return { ok: false, code: "invalid_website_url" };
  const contactRoute = safeContactRoute(input.identity.contactRoute);
  if (!contactRoute) return { ok: false, code: "invalid_contact_route" };
  const mailDisplayName = normalizedText(input.identity.mailDisplayName, 120);
  if (!mailDisplayName) {
    return { ok: false, code: "invalid_mail_display_name" };
  }
  const mailAddress = safeMailAddress(input.identity.mailAddress);
  if (!mailAddress) return { ok: false, code: "invalid_mail_address" };
  const legalName = normalizedText(input.identity.legalName, 160);
  if (!legalName) return { ok: false, code: "invalid_legal_name" };

  return {
    ok: true,
    value: freezeConfig({
      configVersion,
      displayName,
      shortMark,
      productLabel,
      tagline,
      assets: freezeAssets({
        logo,
        logoInverse,
        favicon,
        socialImage,
        altText,
      }),
      exportBasename,
      identity: {
        websiteUrl,
        contactRoute,
        mailDisplayName,
        mailAddress,
        legalName,
      },
    }),
  };
}

export function projectPresentationBrand(
  config: PresentationBrandConfigV1,
): PublicPresentationBrandV1 {
  const validated = validatePresentationBrandConfigV1(config);
  if (!validated.ok) {
    throw new TypeError(
      `invalid_presentation_brand_projection:${validated.code}`,
    );
  }
  const value = validated.value;
  return freezeConfig({
    configVersion: value.configVersion,
    displayName: value.displayName,
    shortMark: value.shortMark,
    productLabel: value.productLabel,
    tagline: value.tagline,
    assets: freezeAssets({
      logo: value.assets.logo,
      logoInverse: value.assets.logoInverse,
      favicon: value.assets.favicon,
      socialImage: value.assets.socialImage,
      altText: value.assets.altText,
    }),
    exportBasename: value.exportBasename,
    identity: value.identity,
  });
}
