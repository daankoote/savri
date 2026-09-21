import {
  type PresentationBrandConfigV1,
  validatePresentationBrandConfigV1,
} from "./presentation_brand_config.ts";

const candidate = {
  schemaVersion: "presentation-brand-config-v1",
  configVersion: "enval-presentation-v1",
  displayName: "ENVAL",
  shortMark: "E",
  productLabel: "Klantportaal",
  tagline: "ERE inboekservice",
  assets: {
    logo: "/assets/img/logo.svg",
    logoInverse: "/assets/img/logo-white.svg",
    favicon: "/assets/img/favicon.svg",
    socialImage: "/assets/img/og-enval.jpg",
    altText: "ENVAL",
  },
  exportBasename: "enval-aanmelddocumenten",
  identity: {
    websiteUrl: "https://www.enval.nl",
    contactRoute: "/contact",
    mailDisplayName: "ENVAL",
    mailAddress: "noreply@enval.local",
    legalName: "ENVAL B.V.",
  },
} as const;

const validated = validatePresentationBrandConfigV1(candidate);
if (!validated.ok) {
  throw new Error(`invalid_enval_presentation_defaults:${validated.code}`);
}

export const ENVAL_PRESENTATION_BRAND_CONFIG_V1: PresentationBrandConfigV1 =
  validated.value;
