export const LEGAL_DOCUMENT_TYPES = [
  "privacy_notice",
  "service_terms",
  "fee_terms",
  "mandate",
] as const;

export type LegalDocumentType = typeof LEGAL_DOCUMENT_TYPES[number];
export type LegalDocumentStatus =
  | "CURRENT"
  | "VALIDATION_CANDIDATE"
  | "DRAFT"
  | "UNKNOWN";
export type LegalDocumentHashStatus = "verified" | "unverified";
export type LegalActionType =
  | "privacy_notice_read"
  | "service_terms_accepted"
  | "fee_terms_accepted"
  | "mandate_signed";

export type LegalDocumentMetadata = {
  documentType: LegalDocumentType;
  version: string;
  language: "nl";
  status: LegalDocumentStatus;
  effectiveFrom: string | null;
  title: string;
  canonicalContentReference: string;
  canonicalRenderInput: {
    paragraphs: readonly string[];
  };
  hashStatus: LegalDocumentHashStatus;
};

export type LegalActionIntent = {
  actionType: LegalActionType;
  documentType: LegalDocumentType;
  version: string;
  language: LegalDocumentMetadata["language"];
  hashStatus: LegalDocumentHashStatus;
  confirmed: boolean;
};

export type LegalActionState = {
  privacyNoticeRead: boolean;
  serviceTermsAccepted: boolean;
  feeTermsAccepted: boolean;
  mandateSigned: boolean;
};

export const EMPTY_LEGAL_ACTION_STATE: LegalActionState = {
  privacyNoticeRead: false,
  serviceTermsAccepted: false,
  feeTermsAccepted: false,
  mandateSigned: false,
};

const LEGAL_DOCUMENTS = Object.fromEntries(
  SIGNING_LEGAL_RUNTIME_DOCUMENTS.map((document) => [
    document.documentType,
    {
      documentType: document.documentType,
      version: document.version,
      language: document.language,
      status: document.status,
      effectiveFrom: document.effectiveFrom,
      title: document.title,
      canonicalContentReference: "runtime:signing-legal-candidate-v1",
      canonicalRenderInput: {
        paragraphs: document.canonicalContent.split(/\n\s*\n/).slice(1),
      },
      hashStatus: "unverified" as const,
    },
  ]),
) as unknown as Readonly<Record<LegalDocumentType, LegalDocumentMetadata>>;

export function getLegalDocument(
  documentType: LegalDocumentType,
): LegalDocumentMetadata {
  return LEGAL_DOCUMENTS[documentType];
}

export function listLegalDocuments(): readonly LegalDocumentMetadata[] {
  return LEGAL_DOCUMENT_TYPES.map(getLegalDocument);
}

export type ReceiptBoundLegalDocumentInput = {
  document_type: string;
  version: string;
  language: string;
  title: string;
  canonical_content: string;
  content_sha256: string;
  effective_from: string | null;
};

export function createReceiptBoundLegalDocuments(
  receiptReference: string,
  input: readonly ReceiptBoundLegalDocumentInput[],
): readonly LegalDocumentMetadata[] | null {
  if (!/^SPR-[0-9a-f-]{36}$/.test(receiptReference) || input.length !== 4) {
    return null;
  }
  const byType = new Map(input.map((document) => [
    document.document_type,
    document,
  ]));
  if (byType.size !== 4) return null;
  const documents: LegalDocumentMetadata[] = [];
  for (const documentType of LEGAL_DOCUMENT_TYPES) {
    const document = byType.get(documentType);
    if (
      !document || !document.version || document.language !== "nl" ||
      !document.title || !document.canonical_content ||
      !/^[0-9a-f]{64}$/.test(document.content_sha256) ||
      !document.effective_from ||
      !Number.isFinite(Date.parse(document.effective_from))
    ) return null;
    documents.push({
      documentType,
      version: document.version,
      language: "nl",
      status: "CURRENT",
      effectiveFrom: document.effective_from,
      title: document.title,
      canonicalContentReference: `presentation-receipt:${receiptReference}`,
      canonicalRenderInput: {
        paragraphs: document.canonical_content.split(/\n\s*\n/),
      },
      hashStatus: "verified",
    });
  }
  return documents;
}

export function legalDocumentIsSigningReady(
  document: LegalDocumentMetadata,
): boolean {
  return document.status === "CURRENT" &&
    document.hashStatus === "verified" &&
    Boolean(document.effectiveFrom);
}

export function legalActionIsComplete(
  documentType: LegalDocumentType,
  actions: LegalActionState,
): boolean {
  if (documentType === "privacy_notice") return actions.privacyNoticeRead;
  if (documentType === "service_terms") return actions.serviceTermsAccepted;
  if (documentType === "fee_terms") return actions.feeTermsAccepted;
  return actions.mandateSigned;
}

export function legalBundleActionState(
  confirmed: boolean,
  previous: LegalActionState,
): LegalActionState {
  return {
    ...previous,
    privacyNoticeRead: confirmed,
    serviceTermsAccepted: confirmed,
    feeTermsAccepted: confirmed,
  };
}

export function projectLegalActionIntents(
  documents: readonly LegalDocumentMetadata[],
  actions: LegalActionState,
): LegalActionIntent[] {
  const actionTypes: Record<LegalDocumentType, LegalActionType> = {
    privacy_notice: "privacy_notice_read",
    service_terms: "service_terms_accepted",
    fee_terms: "fee_terms_accepted",
    mandate: "mandate_signed",
  };
  return documents.map((document) => ({
    actionType: actionTypes[document.documentType],
    documentType: document.documentType,
    version: document.version,
    language: document.language,
    hashStatus: document.hashStatus,
    confirmed: legalActionIsComplete(document.documentType, actions),
  }));
}
import { SIGNING_LEGAL_RUNTIME_DOCUMENTS } from "../../../../../supabase/functions/_shared/signing_legal_runtime.ts";
