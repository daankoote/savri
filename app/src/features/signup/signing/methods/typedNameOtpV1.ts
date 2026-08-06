import type {
  SignatureMethodPort,
  SignerField,
  SignerInput,
  SignerInputValidationReason,
} from "../signatureMethod";
import { validateSigningEvidenceEnvelope } from "../signingEvidence";

const METHOD_ID = "typed_name_otp_v1" as const;
const METHOD_VERSION = "1";

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
    if (clean(input.fullName).split(" ").filter(Boolean).length < 2) {
      reasons.push("signer_full_name_missing" as const);
    }
    if (input.accountType !== "particulier" && !clean(input.role)) {
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
        fullName: clean(input.fullName),
        role: clean(input.role),
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
