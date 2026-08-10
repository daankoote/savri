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

export type SigningStartReadinessReason =
  | Exclude<
    SigningReadinessReason,
    "legal_version_not_current" | "signature_challenge_missing"
  >
  | "required_upload_missing"
  | "intake_session_missing";

export type SigningStartReadiness = {
  ready: boolean;
  reasons: SigningStartReadinessReason[];
};

export function selectSigningStartReadiness(input: {
  intentReadiness: SigningIntent["readiness"];
  requiredUploadsConfirmed: boolean;
  intakeSessionAvailable: boolean;
}): SigningStartReadiness {
  const reasons: SigningStartReadinessReason[] = input.intentReadiness.reasons
    .filter((reason) =>
      reason !== "legal_version_not_current" &&
      reason !== "signature_challenge_missing"
    )
    .map((reason) => reason as SigningStartReadinessReason);
  if (!input.requiredUploadsConfirmed) {
    reasons.push("required_upload_missing");
  }
  if (!input.intakeSessionAvailable) reasons.push("intake_session_missing");
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function signingStartReadinessMessage(
  reason: SigningStartReadinessReason,
): string {
  if (reason === "summary_confirmation_missing") {
    return "Bevestig dat de samenvatting juist en volledig is.";
  }
  if (reason === "signer_full_name_missing") {
    return "Vul je volledige naam in.";
  }
  if (reason === "signer_role_missing") {
    return "Vul je functie of rol in.";
  }
  if (reason === "signing_intent_missing") {
    return "Bevestig de verklaring bij de ondertekening.";
  }
  if (reason === "mandate_year_missing") {
    return "Kies een kalenderjaar voor de machtiging.";
  }
  if (reason === "legal_action_missing") {
    return "Lees en bevestig de voorwaarden en privacyverklaring.";
  }
  if (reason === "required_upload_missing") {
    return "Wacht tot alle vereiste documenten veilig zijn ontvangen.";
  }
  if (reason === "intake_session_missing") {
    return "De veilige aanmeldsessie is niet beschikbaar.";
  }
  if (reason === "pending_required_fact" || reason === "blocked_fact") {
    return "Controleer eerst alle verplichte gegevens.";
  }
  return "Ondertekenen kan nog niet worden gestart.";
}

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
