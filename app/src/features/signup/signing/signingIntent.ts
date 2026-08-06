import type { AccountType } from "../signupTypes";
import type { UnifiedFactPresentation } from "../presentation/factPresentationModel";
import {
  type CanonicalSigningFactModel,
  createCanonicalSigningFactModel,
} from "./canonicalSigningFacts";
import {
  type LegalActionIntent,
  legalActionIsComplete,
  type LegalActionState,
  legalDocumentIsSigningReady,
  type LegalDocumentMetadata,
  projectLegalActionIntents,
} from "./legalDocumentRegistry";
import {
  createMandateDocumentModel,
  type MandateDocumentModel,
  validateMandateCalendarYears,
} from "./mandateDocumentModel";
import type { SigningEvidenceEnvelope } from "./signingEvidence";
import type {
  MethodSigningIntent,
  SignatureMethodPort,
  SignerInput,
} from "./signatureMethod";

export type SigningReadinessReason =
  | "pending_required_fact"
  | "blocked_fact"
  | "signer_full_name_missing"
  | "signer_role_missing"
  | "summary_confirmation_missing"
  | "signing_intent_missing"
  | "mandate_year_missing"
  | "legal_action_missing"
  | "legal_version_not_current"
  | "signature_method_missing"
  | "signature_challenge_missing"
  | "signature_evidence_invalid";

export type CanonicalSigningSnapshot = {
  schemaVersion: "signup-signing-snapshot-v1";
  accountType: AccountType;
  canonicalFacts: CanonicalSigningFactModel;
  legalDocuments: ReadonlyArray<{
    documentType: LegalDocumentMetadata["documentType"];
    version: string;
    language: string;
    status: LegalDocumentMetadata["status"];
  }>;
  legalActionIntents: readonly LegalActionIntent[];
  mandate: MandateDocumentModel;
  methodIntent: MethodSigningIntent | null;
};

export type SigningIntent = {
  intentVersion: "signup-signing-intent-v1";
  accountType: AccountType;
  canonicalFacts: CanonicalSigningFactModel;
  signerInput: SignerInput;
  summaryConfirmed: boolean;
  legalActionIntents: readonly LegalActionIntent[];
  selectedSignatureMethod: string | null;
  legalDocumentVersions: Record<string, string>;
  mandate: MandateDocumentModel | null;
  mandateYearScope: number[];
  unresolvedReviewMarkers: string[];
  snapshot: CanonicalSigningSnapshot | null;
  readiness: {
    ready: boolean;
    reasons: SigningReadinessReason[];
  };
};

export function createSigningIntent(input: {
  accountType: AccountType;
  presentation: UnifiedFactPresentation;
  signerInput: SignerInput;
  summaryConfirmed: boolean;
  selectedMethod: SignatureMethodPort | null;
  legalDocuments: readonly LegalDocumentMetadata[];
  legalActions: LegalActionState;
  mandateYear: number | null;
  evidence: SigningEvidenceEnvelope | null;
}): SigningIntent {
  const reasons = new Set<SigningReadinessReason>();
  const canonicalFacts = createCanonicalSigningFactModel(input.presentation);
  if (!input.summaryConfirmed) reasons.add("summary_confirmation_missing");
  canonicalFacts.facts.forEach((fact) => {
    if (!fact.required) return;
    if (fact.resolutionState === "pending") {
      reasons.add("pending_required_fact");
    }
    if (fact.resolutionState === "blocked") reasons.add("blocked_fact");
  });

  if (!input.selectedMethod) reasons.add("signature_method_missing");
  const signerValidation = input.selectedMethod?.validateSignerInput(
    input.signerInput,
  );
  signerValidation?.reasons.forEach((reason) => reasons.add(reason));

  const mandateYears = input.mandateYear ? [input.mandateYear] : [];
  if (!validateMandateCalendarYears(mandateYears)) {
    reasons.add("mandate_year_missing");
  }
  input.legalDocuments.forEach((document) => {
    if (!legalDocumentIsSigningReady(document)) {
      reasons.add("legal_version_not_current");
    }
    if (!legalActionIsComplete(document.documentType, input.legalActions)) {
      reasons.add("legal_action_missing");
    }
  });

  let mandate: MandateDocumentModel | null = null;
  let methodIntent: MethodSigningIntent | null = null;
  if (input.selectedMethod) {
    mandate = createMandateDocumentModel({
      accountType: input.accountType,
      canonicalFacts,
      signerFullName: input.signerInput.fullName,
      signerRole: input.signerInput.role,
      calendarYears: mandateYears,
      signatureMethod: input.selectedMethod.methodId,
    });
    methodIntent = input.selectedMethod.createSigningIntent(input.signerInput);
    if (!input.evidence) {
      reasons.add("signature_challenge_missing");
    } else if (!input.selectedMethod.validateEvidenceEnvelope(input.evidence)) {
      reasons.add("signature_evidence_invalid");
    }
  }

  const legalDocumentVersions = Object.fromEntries(
    input.legalDocuments.map((document) => [
      document.documentType,
      document.version,
    ]),
  );
  const legalActionIntents = projectLegalActionIntents(
    input.legalDocuments,
    input.legalActions,
  );
  const unresolvedReviewMarkers = canonicalFacts.facts
    .filter((fact) => fact.resolutionState === "review_required")
    .map((fact) => fact.factId);
  const snapshot = mandate
    ? {
      schemaVersion: "signup-signing-snapshot-v1" as const,
      accountType: input.accountType,
      canonicalFacts,
      legalDocuments: input.legalDocuments.map((document) => ({
        documentType: document.documentType,
        version: document.version,
        language: document.language,
        status: document.status,
      })),
      legalActionIntents,
      mandate,
      methodIntent,
    }
    : null;

  return {
    intentVersion: "signup-signing-intent-v1",
    accountType: input.accountType,
    canonicalFacts,
    signerInput: input.signerInput,
    summaryConfirmed: input.summaryConfirmed,
    legalActionIntents,
    selectedSignatureMethod: input.selectedMethod?.methodId || null,
    legalDocumentVersions,
    mandate,
    mandateYearScope: mandateYears,
    unresolvedReviewMarkers,
    snapshot,
    readiness: {
      ready: reasons.size === 0,
      reasons: [...reasons],
    },
  };
}
