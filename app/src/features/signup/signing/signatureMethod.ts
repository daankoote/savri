import type { AccountType } from "../signupTypes";
import type { SigningEvidenceEnvelope } from "./signingEvidence";

export const SIGNATURE_METHOD_IDS = [
  "typed_name_otp_v1",
  "drawn_signature_v1",
  "external_advanced_signature_v1",
  "qualified_signature_v1",
] as const;

export type SignatureMethodId = typeof SIGNATURE_METHOD_IDS[number];

export type SignatureChallengeType = "otp";

export type SignerField = "fullName" | "role" | "intentAccepted";

export type SignerInput = {
  accountType: AccountType;
  fullName: string;
  role: string;
  intentAccepted: boolean;
};

export type SignerInputValidationReason =
  | "signer_full_name_missing"
  | "signer_role_missing"
  | "signing_intent_missing";

export type SignerInputValidation = {
  valid: boolean;
  reasons: SignerInputValidationReason[];
};

export type MethodSigningIntent = {
  methodId: SignatureMethodId;
  methodVersion: string;
  requiredChallengeType: SignatureChallengeType;
  signerInput: SignerInput;
};

export type SignatureMethodPort = {
  methodId: SignatureMethodId;
  methodVersion: string;
  displayName: string;
  requiredChallengeType: SignatureChallengeType;
  requiredSignerFields(accountType: AccountType): readonly SignerField[];
  validateSignerInput(input: SignerInput): SignerInputValidation;
  createSigningIntent(input: SignerInput): MethodSigningIntent;
  validateEvidenceEnvelope(evidence: SigningEvidenceEnvelope): boolean;
};
