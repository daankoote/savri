import { typedNameOtpV1Method } from "./methods/typedNameOtpV1";
import type { SignatureMethodId } from "./signatureMethod";
import { createSignatureMethodRegistry } from "./signatureMethodRegistry";

export const ACTIVE_SIGNATURE_METHOD_ID: SignatureMethodId =
  "typed_name_otp_v1";

export const signupSignatureMethodRegistry = createSignatureMethodRegistry();
signupSignatureMethodRegistry.register(typedNameOtpV1Method);

export function getActiveSignupSignatureMethod() {
  return signupSignatureMethodRegistry.require(ACTIVE_SIGNATURE_METHOD_ID);
}
