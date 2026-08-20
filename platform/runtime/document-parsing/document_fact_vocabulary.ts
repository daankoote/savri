/**
 * Provider-neutral fact vocabulary shared by document observations and the
 * customer/workforce resolution layers. A parser may observe these facts; it
 * never decides whether an observation is canonical or accepted.
 */
export type DocumentFactKey =
  | "partyName"
  | "organizationName"
  | "registeredAddress"
  | "legalForm"
  | "tradeName"
  | "directorOrBoardMember"
  | "directorTitle"
  | "representationAuthorityText"
  | "partyRole"
  | "structuredAddress"
  | "electricityEan"
  | "gasEan"
  | "energySupplier"
  | "contractStart"
  | "contractEnd"
  | "kvkNumber"
  | "installerOrSupplier"
  | "chargerBrand"
  | "chargerModel"
  | "midNumber"
  | "serialNumber"
  | "invoiceDate"
  | "explicitInstallationDate";
