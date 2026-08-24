/**
 * Provider-neutral fact vocabulary shared by document observations and the
 * customer/workforce resolution layers. A parser may observe these facts; it
 * never decides whether an observation is canonical or accepted.
 */
export const DOCUMENT_FACT_KEYS = Object.freeze([
  "partyName",
  "organizationName",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "directorTitle",
  "representationAuthorityText",
  "partyRole",
  "structuredAddress",
  "electricityEan",
  "gasEan",
  "energySupplier",
  "contractStart",
  "contractEnd",
  "kvkNumber",
  "installerOrSupplier",
  "chargerBrand",
  "chargerModel",
  "midNumber",
  "serialNumber",
  "invoiceDate",
  "explicitInstallationDate",
] as const);

export type DocumentFactKey = (typeof DOCUMENT_FACT_KEYS)[number];

export function isDocumentFactKey(value: unknown): value is DocumentFactKey {
  return typeof value === "string" &&
    (DOCUMENT_FACT_KEYS as readonly string[]).includes(value);
}
