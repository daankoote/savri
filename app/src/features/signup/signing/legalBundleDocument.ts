import type {
  LegalDocumentMetadata,
  LegalDocumentType,
} from "./legalDocumentRegistry";
import type { MandateDocumentModel } from "./mandateDocumentModel";

export type LegalBundleSection = {
  documentType: LegalDocumentType;
  title: string;
  version: string;
  language: LegalDocumentMetadata["language"];
  hashStatus: LegalDocumentMetadata["hashStatus"];
  paragraphs: readonly string[];
};

export type LegalBundleDocument = {
  schemaVersion: "legal-bundle-document-v1";
  title: "Documenten aanmelding ENVAL";
  sections: readonly LegalBundleSection[];
};

function values(items: readonly string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

function mandateParagraphs(model: MandateDocumentModel): readonly string[] {
  const organization = model.accountType !== "particulier";
  const name = organization
    ? model.mandatingParty.organizationName
    : model.mandatingParty.fullName;
  const address = organization
    ? model.mandatingParty.registeredAddress
    : values(model.mandatingParty.canonicalAddresses);
  return [
    `Naam: ${name || "—"}`,
    `Adres: ${address || "—"}`,
    `EAN elektriciteit: ${values(model.electricityEans)}`,
    `Kalenderjaar: ${values(model.validity.calendarYears.map(String))}`,
    ...model.permissions.map((permission) => permission.text),
  ];
}

export function createLegalBundleDocument(input: {
  documents: readonly LegalDocumentMetadata[];
  mandate: MandateDocumentModel;
}): LegalBundleDocument {
  return {
    schemaVersion: "legal-bundle-document-v1",
    title: "Documenten aanmelding ENVAL",
    sections: input.documents.map((document) => ({
      documentType: document.documentType,
      title: document.title,
      version: document.version,
      language: document.language,
      hashStatus: document.hashStatus,
      paragraphs: document.documentType === "mandate"
        ? mandateParagraphs(input.mandate)
        : document.canonicalRenderInput.paragraphs,
    })),
  };
}
