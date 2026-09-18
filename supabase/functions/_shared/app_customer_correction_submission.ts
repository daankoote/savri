import { payloadHash } from "./app_foundation.ts";
import {
  CUSTOMER_CORRECTION_RESOLUTION_TYPES,
  type CustomerCorrectionResolutionType,
} from "./app_customer_correction_resolution.ts";
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
  "DOCUMENT_REPLACEMENT",
  "VALUE_PLUS_DOCUMENT_REPLACEMENT",
] as const;

export const CUSTOMER_CORRECTION_LEGAL_BUNDLE = Object.freeze({
  bundleVersion: "customer-correction-confirmation-nl-v1",
  title: "Bevestiging correctie dossiergegevens",
  statement:
    "Ik bevestig dat de door mij ingediende correcties juist en volledig zijn en onderdeel worden van mijn ENVAL-dossier.",
});

export type CorrectionResponse =
  | Readonly<{ itemRef: string; correctedValue: string }>
  | Readonly<{ itemRef: string; replacementCandidateRef: string }>
  | Readonly<{
    itemRef: string;
    correctedValue: string;
    replacementCandidateRef: string;
  }>;

export type CorrectionChallengeRequest = {
  caseRef: string;
  responses: CorrectionResponse[];
  factResolutions: CorrectionFactResolution[];
  typedFullName: string;
};

export type CorrectionFactResolutionSource = Readonly<{
  candidateRef: string;
  relationship: "direct" | "supporting";
  selected: boolean;
}>;

export type CorrectionFactResolution = Readonly<{
  itemRefs: readonly string[];
  resolutionType: CustomerCorrectionResolutionType;
  sources: readonly CorrectionFactResolutionSource[];
  transcriptionCandidateRef?: string;
}>;

export type CorrectionFinalizeRequest = {
  caseRef: string;
  challengeReference: string;
  otp: string;
  typedFullName: string;
};

const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const ITEM_REFERENCE_RE = /^CCI-[A-F0-9]{32}$/;
const REPLACEMENT_CANDIDATE_REFERENCE_RE = /^CRC-[A-F0-9]{32}$/;

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
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "caseRef",
      "factResolutions",
      "responses",
      "typedFullName",
    ])
  ) {
    return null;
  }
  const caseRef = exactCaseRef(value.caseRef);
  const typedFullName = normalizeCorrectionSignerName(value.typedFullName);
  if (
    !caseRef || !typedFullName || typedFullName.length > 200 ||
    !Array.isArray(value.responses) ||
    value.responses.length < 1 || value.responses.length > 100 ||
    !Array.isArray(value.factResolutions) ||
    value.factResolutions.length > 100
  ) return null;
  const responses: CorrectionResponse[] = [];
  const itemRefs = new Set<string>();
  for (const response of value.responses) {
    const hasCorrectedValue = isRecord(response) &&
      "correctedValue" in response;
    const hasReplacementCandidate = isRecord(response) &&
      "replacementCandidateRef" in response;
    if (
      !isRecord(response) ||
      (!hasExactKeys(response, ["itemRef", "correctedValue"]) &&
        !hasExactKeys(response, ["itemRef", "replacementCandidateRef"]) &&
        !hasExactKeys(response, [
          "itemRef",
          "correctedValue",
          "replacementCandidateRef",
        ])) ||
      typeof response.itemRef !== "string" ||
      !ITEM_REFERENCE_RE.test(response.itemRef) ||
      (!hasCorrectedValue && !hasReplacementCandidate)
    ) {
      return null;
    }
    const itemRef = response.itemRef;
    const correctedValue = hasCorrectedValue
      ? safeString(response.correctedValue, 2000)
      : "";
    const replacementCandidateRef = hasReplacementCandidate &&
        typeof response.replacementCandidateRef === "string"
      ? response.replacementCandidateRef
      : "";
    if (
      (hasCorrectedValue && !correctedValue) ||
      (hasReplacementCandidate &&
        !REPLACEMENT_CANDIDATE_REFERENCE_RE.test(replacementCandidateRef)) ||
      itemRefs.has(itemRef)
    ) return null;
    itemRefs.add(itemRef);
    responses.push({
      itemRef,
      ...(hasCorrectedValue ? { correctedValue } : {}),
      ...(hasReplacementCandidate ? { replacementCandidateRef } : {}),
    } as CorrectionResponse);
  }
  const correctedItemRefs = new Set(
    responses.flatMap((response) =>
      "correctedValue" in response ? [response.itemRef] : []
    ),
  );
  const resolvedItemRefs = new Set<string>();
  const factResolutions: CorrectionFactResolution[] = [];
  for (const resolution of value.factResolutions) {
    if (
      !isRecord(resolution) ||
      !(hasExactKeys(resolution, ["itemRefs", "resolutionType", "sources"]) ||
        hasExactKeys(resolution, ["itemRefs", "resolutionType", "sources", "transcriptionCandidateRef"])) ||
      !Array.isArray(resolution.itemRefs) ||
      resolution.itemRefs.length < 1 || resolution.itemRefs.length > 100 ||
      typeof resolution.resolutionType !== "string" ||
      !CUSTOMER_CORRECTION_RESOLUTION_TYPES.includes(
        resolution.resolutionType as CustomerCorrectionResolutionType,
      ) ||
      !Array.isArray(resolution.sources) || resolution.sources.length > 100
    ) return null;
    const resolutionItemRefs: string[] = [];
    for (const itemRef of resolution.itemRefs) {
      if (
        typeof itemRef !== "string" || !ITEM_REFERENCE_RE.test(itemRef) ||
        !correctedItemRefs.has(itemRef) || resolvedItemRefs.has(itemRef)
      ) return null;
      resolvedItemRefs.add(itemRef);
      resolutionItemRefs.push(itemRef);
    }
    const sources: CorrectionFactResolutionSource[] = [];
    const candidateRefs = new Set<string>();
    let selectedCount = 0;
    for (const source of resolution.sources) {
      if (
        !isRecord(source) ||
        !hasExactKeys(source, ["candidateRef", "relationship", "selected"]) ||
        typeof source.candidateRef !== "string" ||
        !REPLACEMENT_CANDIDATE_REFERENCE_RE.test(source.candidateRef) ||
        (source.relationship !== "direct" &&
          source.relationship !== "supporting") ||
        typeof source.selected !== "boolean" ||
        candidateRefs.has(source.candidateRef)
      ) return null;
      candidateRefs.add(source.candidateRef);
      if (source.selected) selectedCount += 1;
      sources.push(Object.freeze({
        candidateRef: source.candidateRef,
        relationship: source.relationship,
        selected: source.selected,
      }));
    }
    const transcriptionCandidateRef = typeof resolution.transcriptionCandidateRef === "string"
      ? resolution.transcriptionCandidateRef
      : null;
    if (selectedCount !== 0 ||
      (resolution.resolutionType === "SOURCE_CONFIRMED" && transcriptionCandidateRef !== null) ||
      (resolution.resolutionType === "DOCUMENT_TRANSCRIPTION" &&
        (!transcriptionCandidateRef || !REPLACEMENT_CANDIDATE_REFERENCE_RE.test(transcriptionCandidateRef) || sources.length !== 0))) return null;
    factResolutions.push(Object.freeze({
      itemRefs: Object.freeze(resolutionItemRefs),
      resolutionType: resolution.resolutionType as CustomerCorrectionResolutionType,
      sources: Object.freeze(sources),
      ...(transcriptionCandidateRef ? { transcriptionCandidateRef } : {}),
    }));
  }
  if (
    resolvedItemRefs.size !== correctedItemRefs.size ||
    [...correctedItemRefs].some((itemRef) => !resolvedItemRefs.has(itemRef))
  ) return null;
  return { caseRef, responses, factResolutions, typedFullName };
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
  const typedFullName = normalizeCorrectionSignerName(value.typedFullName);
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
  expectedSignerAuthorityRef: string,
): Promise<string> {
  return await payloadHash({
    case_ref: request.caseRef,
    responses: request.responses,
    fact_resolutions: request.factResolutions,
    typed_full_name: request.typedFullName,
    expected_signer_authority_ref: expectedSignerAuthorityRef,
    signing_method: "typed_name_otp_v1",
    legal_bundle_version: CUSTOMER_CORRECTION_LEGAL_BUNDLE.bundleVersion,
  });
}

export function normalizeCorrectionSignerName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function correctionSignerNamesMatch(
  typedName: unknown,
  expectedName: unknown,
): boolean {
  const typed = normalizeCorrectionSignerName(typedName);
  const expected = normalizeCorrectionSignerName(expectedName);
  return !!typed && typed === expected;
}

export function isRuntimeCorrectionAction(
  value: unknown,
): value is CustomerCorrectionAction {
  return CUSTOMER_CORRECTION_RUNTIME_ACTIONS.includes(
    value as (typeof CUSTOMER_CORRECTION_RUNTIME_ACTIONS)[number],
  );
}
