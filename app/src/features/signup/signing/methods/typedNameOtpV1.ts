import type {
  SignatureMethodPort,
  SignerField,
  SignerInput,
  SignerInputValidationReason,
} from "../signatureMethod";
import { validateSigningEvidenceEnvelope } from "../signingEvidence";

const METHOD_ID = "typed_name_otp_v1" as const;
const METHOD_VERSION = "1";

export function normalizeTypedNameOtpFullName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isTypedNameOtpFullNameValid(value: string): boolean {
  return normalizeTypedNameOtpFullName(value).split(" ").filter(Boolean)
    .length >= 2;
}

export function typedNameOtpSignerNamesMatch(
  typedName: string,
  expectedName: string,
): boolean {
  const typed = normalizeTypedNameOtpFullName(typedName);
  const expected = normalizeTypedNameOtpFullName(expectedName);
  return !!typed && typed === expected;
}

function requiredSignerFields(
  accountType: SignerInput["accountType"],
): readonly SignerField[] {
  return accountType === "particulier"
    ? ["fullName", "intentAccepted"]
    : ["fullName", "role", "intentAccepted"];
}

export const typedNameOtpV1Method: SignatureMethodPort = {
  methodId: METHOD_ID,
  methodVersion: METHOD_VERSION,
  displayName: "Naam invoeren en eenmalige code",
  requiredChallengeType: "otp",
  requiredSignerFields,
  validateSignerInput(input) {
    const reasons: SignerInputValidationReason[] = [];
    if (!isTypedNameOtpFullNameValid(input.fullName)) {
      reasons.push("signer_full_name_missing" as const);
    }
    if (
      input.accountType !== "particulier" &&
      !normalizeTypedNameOtpFullName(input.role)
    ) {
      reasons.push("signer_role_missing" as const);
    }
    if (!input.intentAccepted) reasons.push("signing_intent_missing" as const);
    return { valid: reasons.length === 0, reasons };
  },
  createSigningIntent(input) {
    return {
      methodId: METHOD_ID,
      methodVersion: METHOD_VERSION,
      requiredChallengeType: "otp",
      signerInput: {
        ...input,
        fullName: normalizeTypedNameOtpFullName(input.fullName),
        role: normalizeTypedNameOtpFullName(input.role),
      },
    };
  },
  validateEvidenceEnvelope(evidence) {
    return validateSigningEvidenceEnvelope(evidence, {
      methodId: METHOD_ID,
      methodVersion: METHOD_VERSION,
    });
  },
};
