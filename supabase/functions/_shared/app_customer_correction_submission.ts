import { payloadHash } from "./app_foundation.ts";
import { safeString, validUuid } from "./signup_signing.ts";

export const CUSTOMER_CORRECTION_ACTIONS = [
  "VALUE_CORRECTION",
  "MISSING_VALUE",
  "DOCUMENT_REPLACEMENT",
  "VALUE_PLUS_DOCUMENT_REPLACEMENT",
] as const;

export type CustomerCorrectionAction =
  (typeof CUSTOMER_CORRECTION_ACTIONS)[number];

export const CUSTOMER_CORRECTION_RUNTIME_ACTIONS = [
  "VALUE_CORRECTION",
  "MISSING_VALUE",
] as const;

export const CUSTOMER_CORRECTION_LEGAL_BUNDLE = Object.freeze({
  bundleVersion: "customer-correction-confirmation-nl-v1",
  title: "Bevestiging correctie dossiergegevens",
  statement:
    "Ik bevestig dat de door mij ingediende correcties juist en volledig zijn en onderdeel worden van mijn ENVAL-dossier.",
});

export type CorrectionResponse = {
  itemRef: string;
  correctedValue: string;
};

export type CorrectionChallengeRequest = {
  caseRef: string;
  responses: CorrectionResponse[];
};

export type CorrectionFinalizeRequest = {
  caseRef: string;
  challengeReference: string;
  otp: string;
  typedFullName: string;
};

const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const ITEM_REFERENCE_RE = /^CCI-[A-F0-9]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function exactCaseRef(value: unknown): string {
  return typeof value === "string" && value === value.trim() &&
      CASE_REFERENCE_RE.test(value)
    ? value
    : "";
}

export function parseCorrectionChallengeRequest(
  value: unknown,
): CorrectionChallengeRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, ["caseRef", "responses"])) {
    return null;
  }
  const caseRef = exactCaseRef(value.caseRef);
  if (
    !caseRef || !Array.isArray(value.responses) ||
    value.responses.length < 1 || value.responses.length > 100
  ) return null;
  const responses: CorrectionResponse[] = [];
  const itemRefs = new Set<string>();
  for (const response of value.responses) {
    if (
      !isRecord(response) ||
      !hasExactKeys(response, ["itemRef", "correctedValue"]) ||
      typeof response.itemRef !== "string" ||
      !ITEM_REFERENCE_RE.test(response.itemRef)
    ) {
      return null;
    }
    const itemRef = response.itemRef;
    const correctedValue = safeString(response.correctedValue, 2000);
    if (!correctedValue || itemRefs.has(itemRef)) return null;
    itemRefs.add(itemRef);
    responses.push({ itemRef, correctedValue });
  }
  return { caseRef, responses };
}

export function parseCorrectionFinalizeRequest(
  value: unknown,
): CorrectionFinalizeRequest | null {
  if (
    !isRecord(value) || !hasExactKeys(value, [
      "caseRef",
      "challengeReference",
      "otp",
      "typedFullName",
    ])
  ) return null;
  const caseRef = exactCaseRef(value.caseRef);
  const challengeReference = typeof value.challengeReference === "string"
    ? value.challengeReference.trim().toLowerCase()
    : "";
  const otp = typeof value.otp === "string" ? value.otp.trim() : "";
  const typedFullName = safeString(value.typedFullName, 200);
  if (
    !caseRef || !validUuid(challengeReference) || !/^\d{6}$/.test(otp) ||
    !typedFullName
  ) return null;
  return { caseRef, challengeReference, otp, typedFullName };
}

export function correctionLegalBundleProjection() {
  return { ...CUSTOMER_CORRECTION_LEGAL_BUNDLE };
}

export async function correctionLegalBundleHash(): Promise<string> {
  return await payloadHash(CUSTOMER_CORRECTION_LEGAL_BUNDLE);
}

export async function correctionResponsePayloadHash(
  request: CorrectionChallengeRequest,
): Promise<string> {
  return await payloadHash({
    case_ref: request.caseRef,
    responses: request.responses,
    signing_method: "typed_name_otp_v1",
    legal_bundle_version: CUSTOMER_CORRECTION_LEGAL_BUNDLE.bundleVersion,
  });
}

export function isRuntimeCorrectionAction(
  value: unknown,
): value is "VALUE_CORRECTION" | "MISSING_VALUE" {
  return CUSTOMER_CORRECTION_RUNTIME_ACTIONS.includes(
    value as "VALUE_CORRECTION" | "MISSING_VALUE",
  );
}
