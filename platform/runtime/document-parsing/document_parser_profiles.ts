import type { DocumentFactKey } from "./document_fact_vocabulary.ts";
import type { DocumentParserProfileKey } from "./document_parser_contract.ts";

export type DocumentParserProfile = Readonly<{
  key: DocumentParserProfileKey;
  version: string;
  expectedFactKeys: ReadonlyArray<DocumentFactKey>;
  requiredObservationKeys: ReadonlyArray<DocumentFactKey>;
  normalizationPolicy: "provider_normalized_v1";
  unexpectedObservationPolicy: "retain_semantically_reliable_v1";
}>;

const profile = (
  value: DocumentParserProfile,
): DocumentParserProfile =>
  Object.freeze({
    ...value,
    expectedFactKeys: Object.freeze([...value.expectedFactKeys]),
    requiredObservationKeys: Object.freeze([...value.requiredObservationKeys]),
  });

export const DOCUMENT_PARSER_PROFILE_REGISTRY: Readonly<
  Record<DocumentParserProfileKey, DocumentParserProfile>
> = Object.freeze({
  energy_document_v1: profile({
    key: "energy_document_v1",
    version: "2",
    expectedFactKeys: [
      "energySupplier",
      "electricityEan",
      "gasEan",
      "partyName",
      "structuredAddress",
      "contractStart",
      "contractEnd",
      "invoiceDate",
    ],
    requiredObservationKeys: [
      "energySupplier",
      "electricityEan",
      "partyName",
      "structuredAddress",
    ],
    normalizationPolicy: "provider_normalized_v1",
    unexpectedObservationPolicy: "retain_semantically_reliable_v1",
  }),
  installation_invoice_v1: profile({
    key: "installation_invoice_v1",
    version: "2",
    expectedFactKeys: [
      "partyName",
      "structuredAddress",
      "installerOrSupplier",
      "chargerBrand",
      "chargerModel",
      "midNumber",
      "serialNumber",
      "invoiceDate",
      "explicitInstallationDate",
    ],
    requiredObservationKeys: [
      "chargerBrand",
      "chargerModel",
      "midNumber",
      "serialNumber",
    ],
    normalizationPolicy: "provider_normalized_v1",
    unexpectedObservationPolicy: "retain_semantically_reliable_v1",
  }),
  kvk_extract_v1: profile({
    key: "kvk_extract_v1",
    version: "2",
    expectedFactKeys: [
      "organizationName",
      "registeredAddress",
      "legalForm",
      "tradeName",
      "directorOrBoardMember",
      "directorTitle",
      "representationAuthorityText",
      "kvkNumber",
    ],
    requiredObservationKeys: ["organizationName", "kvkNumber"],
    normalizationPolicy: "provider_normalized_v1",
    unexpectedObservationPolicy: "retain_semantically_reliable_v1",
  }),
  generic_charger_evidence_v1: profile({
    key: "generic_charger_evidence_v1",
    version: "2",
    expectedFactKeys: [
      "chargerBrand",
      "chargerModel",
      "midNumber",
      "serialNumber",
    ],
    requiredObservationKeys: [],
    normalizationPolicy: "provider_normalized_v1",
    unexpectedObservationPolicy: "retain_semantically_reliable_v1",
  }),
});

export function getDocumentParserProfile(
  key: DocumentParserProfileKey,
): DocumentParserProfile {
  const selected = DOCUMENT_PARSER_PROFILE_REGISTRY[key];
  if (!selected) throw new Error("unknown_document_parser_profile");
  return selected;
}
