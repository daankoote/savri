import type {
  DocumentFactKey,
  DocumentFactObservation,
  DocumentSourceType,
} from "./documentFactRegistry";
import type {
  DocumentFactCorrectionType,
  DocumentFactDecisionStatus,
} from "./documentFactDecisionPolicy";

export type DocumentFactConfirmationStatus = "pending" | "confirmed";

export type DocumentFactConfirmation = {
  factKey: DocumentFactKey;
  canonicalValue: string;
  sourceDocuments: ReadonlyArray<{
    documentId: string;
    documentType: DocumentSourceType;
  }>;
  confirmationStatus: DocumentFactConfirmationStatus;
  confirmedAt: string | null;
  correctedManually: boolean;
  decisionStatus: DocumentFactDecisionStatus;
  normalizationApplied: boolean;
};

export type DocumentFactCorrection = {
  factKey: DocumentFactKey;
  canonicalValue: string;
  sourceDocumentId: string;
  sourceDocumentType: DocumentSourceType;
  observedFact: DocumentFactObservation | null;
  correctionType: DocumentFactCorrectionType;
  confirmedAt: string;
  correctedManually: true;
};

export function confirmationDependsOnDocument(
  confirmation: Pick<DocumentFactConfirmation, "sourceDocuments">,
  documentId: string,
): boolean {
  return confirmation.sourceDocuments.some((source) =>
    source.documentId === documentId
  );
}

export function invalidateDocumentConfirmations<
  T extends Pick<DocumentFactConfirmation, "sourceDocuments">,
>(
  confirmations: Record<string, T>,
  documentId: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(confirmations).filter(([, confirmation]) =>
      !confirmationDependsOnDocument(confirmation, documentId)
    ),
  );
}
