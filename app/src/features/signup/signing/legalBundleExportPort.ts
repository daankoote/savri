import type { LegalBundleDocument } from "./legalBundleDocument";

export type LegalBundleExportPort = {
  preview: (document: LegalBundleDocument) => boolean;
  download: (document: LegalBundleDocument) => boolean;
};
