export const LEGAL_DOCUMENT_TYPES = [
  "privacy_notice",
  "service_terms",
  "fee_terms",
  "mandate",
] as const;

export type LegalDocumentType = typeof LEGAL_DOCUMENT_TYPES[number];
export type LegalDocumentStatus = "CURRENT" | "DRAFT" | "UNKNOWN";
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

const LEGAL_DOCUMENTS: Readonly<
  Record<
    LegalDocumentType,
    LegalDocumentMetadata
  >
> = {
  privacy_notice: {
    documentType: "privacy_notice",
    version: "privacy-notice-unapproved-v1",
    language: "nl",
    status: "UNKNOWN",
    effectiveFrom: null,
    title: "Privacyverklaring",
    canonicalContentReference: "/privacy",
    canonicalRenderInput: {
      paragraphs: [
        "ENVAL verwerkt persoonsgegevens, zakelijke/VVE-gegevens en geüploade documenten.",
        "Verwerking gebeurt voor het beoordelen, opbouwen en beheren van het ERE-dossier.",
        "Documenten kunnen adres-, energie-, laadpaal-, MID- en KVK-bewijs bevatten.",
        "Gegevens worden geminimaliseerd of bewaard volgens toepasselijke bewaartermijnen.",
        "Definitieve juridische tekst volgt vóór productie.",
      ],
    },
    hashStatus: "unverified",
  },
  service_terms: {
    documentType: "service_terms",
    version: "service-terms-draft-v1",
    language: "nl",
    status: "DRAFT",
    effectiveFrom: null,
    title: "Algemene voorwaarden",
    canonicalContentReference: "/voorwaarden",
    canonicalRenderInput: {
      paragraphs: [
        "ENVAL start een dossier op basis van de informatie die u aanlevert.",
        "U moet correcte en complete informatie aanleveren.",
        "ENVAL mag aanvullende informatie vragen.",
        "ENVAL geeft geen garantie op acceptatie, opbrengst, uitbetaling, timing, certificering of documentgoedkeuring.",
        "ENVAL mag stoppen of pauzeren als informatie onvolledig of niet bruikbaar is.",
        "Definitieve juridische tekst volgt vóór productie.",
      ],
    },
    hashStatus: "unverified",
  },
  fee_terms: {
    documentType: "fee_terms",
    version: "fee-terms-draft-v1",
    language: "nl",
    status: "DRAFT",
    effectiveFrom: null,
    title: "Vergoedingsvoorwaarden",
    canonicalContentReference: "docs/app/legal/fee-model-and-service-terms.md",
    canonicalRenderInput: {
      paragraphs: [
        "De beoogde ENVAL succesfee is 10% wanneer resultaat of waarde wordt gerealiseerd.",
        "Geen gerealiseerd resultaat of waarde betekent onder het beoogde model geen succesfee, onder voorbehoud van finale voorwaarden.",
        "De exacte succestrigger, grondslag, btw, kosten, correcties, terugdraaiingen en clawback vragen nog finale juridische en commerciële review.",
        "Definitieve juridische tekst volgt vóór productie.",
      ],
    },
    hashStatus: "unverified",
  },
  mandate: {
    documentType: "mandate",
    version: "mandate-render-draft-v1",
    language: "nl",
    status: "DRAFT",
    effectiveFrom: null,
    title: "Machtiging",
    canonicalContentReference: "generated:mandate-document-model-v1",
    canonicalRenderInput: { paragraphs: [] },
    hashStatus: "unverified",
  },
};

export function getLegalDocument(
  documentType: LegalDocumentType,
): LegalDocumentMetadata {
  return LEGAL_DOCUMENTS[documentType];
}

export function listLegalDocuments(): readonly LegalDocumentMetadata[] {
  return LEGAL_DOCUMENT_TYPES.map(getLegalDocument);
}

export function legalDocumentIsSigningReady(
  document: LegalDocumentMetadata,
): boolean {
  return document.status === "CURRENT" &&
    document.hashStatus === "verified" && Boolean(document.effectiveFrom);
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
