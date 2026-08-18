import type { DocumentFactKey } from "../../../app/src/features/signup/documentFactRegistry.ts";
import { compareDocumentFactValues } from "../../../app/src/features/signup/documentFactDecisionPolicy.ts";
import { compareBoundedPartyNameValues } from "../../../app/src/features/signup/signupPartyNameCrossCheck.ts";
import { compareFormattedDutchAddresses } from "../../../app/src/features/signup/structuredAddress.ts";

export const SIGNUP_REVIEW_REASONS_V1 = Object.freeze(
  [
    "GENERIC_REVIEW_REQUIRED",
    "USER_OVERRIDE",
    "USER_SUPPLIED_WITHOUT_DOCUMENT",
    "DOCUMENT_CONFLICT_RESOLVED",
    "PROBABLE_IDENTITY_MATCH",
    "PROBABLE_ADDRESS_MATCH",
  ] as const,
);

export type SignupReviewReasonV1 = (typeof SIGNUP_REVIEW_REASONS_V1)[number];

export const SIGNUP_PROVENANCE_AUTHORITIES_V1 = Object.freeze([
  "SERVER_VERIFIED",
  "CUSTOMER_SIGNED_RESOLUTION",
] as const);

export type SignupProvenanceAuthorityV1 =
  (typeof SIGNUP_PROVENANCE_AUTHORITIES_V1)[number];

export type SignupResolutionActionV1 =
  | "confirmed"
  | "corrected"
  | "supplied"
  | "unresolved";

export type SignupResolutionSourcePrimitiveV1 = Readonly<{
  identity: string;
  observedValue: string;
}>;

export type SignupResolutionSourceRelationV1 =
  | "none"
  | "single"
  | "equal"
  | "probable"
  | "conflict";

export type SignupResolutionDerivationV1 = Readonly<{
  reviewReason: Exclude<SignupReviewReasonV1, "GENERIC_REVIEW_REQUIRED"> | null;
  sourceRelation: SignupResolutionSourceRelationV1;
}>;

function uniqueSources(
  sources: readonly SignupResolutionSourcePrimitiveV1[],
): SignupResolutionSourcePrimitiveV1[] {
  return [
    ...new Map(sources.map((source) => [source.identity, source])).values(),
  ];
}

export function deriveSignupSourceRelationV1(input: {
  factKey: DocumentFactKey | null;
  partyKind: "natural_person" | "organization";
  sources: readonly SignupResolutionSourcePrimitiveV1[];
}): SignupResolutionSourceRelationV1 {
  const sources = uniqueSources(input.sources);
  if (sources.length === 0) return "none";
  if (sources.length === 1) return "single";
  let probable = false;
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      const leftValue = sources[left].observedValue;
      const rightValue = sources[right].observedValue;
      if (input.factKey === "partyName") {
        const match = compareBoundedPartyNameValues(
          leftValue,
          rightValue,
          input.partyKind,
        );
        if (match === "mismatch") return "conflict";
        if (match === "probable") probable = true;
        continue;
      }
      if (input.factKey === "structuredAddress") {
        const match = compareFormattedDutchAddresses(leftValue, rightValue);
        if (match === "mismatch") return "conflict";
        if (match === "probable") probable = true;
        if (match !== "unavailable") continue;
      }
      if (
        input.factKey &&
        compareDocumentFactValues(
            input.factKey,
            leftValue,
            rightValue,
            input.partyKind,
          ) === "different"
      ) return "conflict";
      if (!input.factKey && leftValue !== rightValue) return "conflict";
    }
  }
  return probable ? "probable" : "equal";
}

export function deriveSignupResolutionProvenanceV1(input: {
  factKey: DocumentFactKey | null;
  partyKind: "natural_person" | "organization";
  resolutionState: "pending" | "confirmed" | "review_required" | "blocked";
  action: SignupResolutionActionV1;
  sources: readonly SignupResolutionSourcePrimitiveV1[];
}): SignupResolutionDerivationV1 | null {
  const sourceRelation = deriveSignupSourceRelationV1(input);

  if (
    input.resolutionState === "pending" || input.resolutionState === "blocked"
  ) {
    return input.action === "unresolved"
      ? { reviewReason: null, sourceRelation }
      : null;
  }
  if (input.resolutionState === "confirmed") {
    return input.action === "confirmed" &&
        sourceRelation !== "probable" && sourceRelation !== "conflict"
      ? { reviewReason: null, sourceRelation }
      : null;
  }
  if (input.action === "supplied" && sourceRelation === "none") {
    return { reviewReason: "USER_SUPPLIED_WITHOUT_DOCUMENT", sourceRelation };
  }
  if (input.action === "corrected") {
    if (sourceRelation === "none") {
      return { reviewReason: "USER_SUPPLIED_WITHOUT_DOCUMENT", sourceRelation };
    }
    if (sourceRelation === "conflict") {
      return { reviewReason: "DOCUMENT_CONFLICT_RESOLVED", sourceRelation };
    }
    if (sourceRelation === "probable") {
      if (input.factKey === "partyName") {
        return { reviewReason: "PROBABLE_IDENTITY_MATCH", sourceRelation };
      }
      if (input.factKey === "structuredAddress") {
        return { reviewReason: "PROBABLE_ADDRESS_MATCH", sourceRelation };
      }
      return null;
    }
    return { reviewReason: "USER_OVERRIDE", sourceRelation };
  }
  if (input.action === "confirmed" && sourceRelation === "probable") {
    if (input.factKey === "partyName") {
      return { reviewReason: "PROBABLE_IDENTITY_MATCH", sourceRelation };
    }
    if (input.factKey === "structuredAddress") {
      return { reviewReason: "PROBABLE_ADDRESS_MATCH", sourceRelation };
    }
  }
  return null;
}
