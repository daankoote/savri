import type {
  DocumentFactKey,
  DocumentFactObservation,
  DocumentSemanticRole,
} from "./documentFactRegistry";
import { compareBoundedPartyNameValues } from "./signupPartyNameCrossCheck";
import { compareFormattedDutchAddresses } from "./structuredAddress";

export type DocumentFactDecisionStatus =
  | "clean_match"
  | "normalized_match"
  | "review_required"
  | "blocked"
  | "missing"
  | "ambiguous"
  | "not_applicable";

export type DocumentFactCorrectionType =
  | "parser_correction"
  | "customer_declared_difference";

export type DocumentFactDecisionInput = {
  factKey: DocumentFactKey;
  declaredValue: string | null;
  observations: ReadonlyArray<DocumentFactObservation>;
  correctedValue: string | null;
  confirmedValue: string | null;
  partyKind?: "natural_person" | "organization";
};

export type DocumentFactDecision = {
  status: DocumentFactDecisionStatus;
  canonicalValue: string;
  normalizationApplied: boolean;
  blocksProgress: boolean;
  needsCustomerIntent: boolean;
  reason:
    | "exact_support"
    | "bounded_normalization"
    | "manual_correction"
    | "declared_difference"
    | "different_semantic_roles"
    | "relevant_role_missing"
    | "hard_value_conflict"
    | "no_value"
    | "multiple_candidates"
    | "source_not_applicable";
};

type ValueMatch = "exact" | "normalized" | "different";

const HARD_CONFLICT_FACTS: ReadonlySet<DocumentFactKey> = new Set([
  "electricityEan",
  "midNumber",
  "serialNumber",
]);

const clean = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim();

function punctuationAndCaseSignature(value: string): string {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function boundedAddressMatch(left: string, right: string): ValueMatch {
  if (clean(left) === clean(right)) return "exact";
  const addressMatch = compareFormattedDutchAddresses(left, right);
  if (addressMatch === "match" || addressMatch === "probable") {
    return "normalized";
  }
  if (addressMatch === "mismatch") return "different";
  const signature = (value: string) =>
    punctuationAndCaseSignature(value)
      .replace(/\b(\d+)\s+([a-z0-9])\b/g, "$1 $2");
  return signature(left) === signature(right) ? "normalized" : "different";
}

export function compareDocumentFactValues(
  factKey: DocumentFactKey,
  left: string,
  right: string,
  partyKind: "natural_person" | "organization" = "natural_person",
): ValueMatch {
  if (clean(left) === clean(right)) return "exact";
  if (factKey === "partyName") {
    const match = compareBoundedPartyNameValues(left, right, partyKind);
    return match === "exact"
      ? "exact"
      : match === "probable"
      ? "normalized"
      : "different";
  }
  if (factKey === "structuredAddress") return boundedAddressMatch(left, right);
  if (HARD_CONFLICT_FACTS.has(factKey)) {
    const compactIdentifier = (value: string) =>
      punctuationAndCaseSignature(value).replace(/[^a-z0-9]/g, "");
    return compactIdentifier(left) === compactIdentifier(right)
      ? "normalized"
      : "different";
  }
  return punctuationAndCaseSignature(left) ===
      punctuationAndCaseSignature(right)
    ? "normalized"
    : "different";
}

export function semanticRolesComparable(
  left: DocumentSemanticRole,
  right: DocumentSemanticRole,
): boolean {
  if (left === right) return left !== "not_applicable";
  const addressRoles: ReadonlySet<DocumentSemanticRole> = new Set([
    "delivery_address",
    "installation_or_delivery_address",
    "installation_address",
  ]);
  return addressRoles.has(left) && addressRoles.has(right);
}

function foundObservations(
  observations: ReadonlyArray<DocumentFactObservation>,
): DocumentFactObservation[] {
  return observations.filter((observation) =>
    observation.extractionStatus === "found" && observation.displayable &&
    Boolean(clean(observation.value))
  );
}

function hasHardComparableConflict(
  factKey: DocumentFactKey,
  observations: ReadonlyArray<DocumentFactObservation>,
  declaredValue: string,
  partyKind: "natural_person" | "organization",
): boolean {
  const candidates = [...observations];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (
        semanticRolesComparable(left.semanticRole, right.semanticRole) &&
        compareDocumentFactValues(
            factKey,
            clean(left.value),
            clean(right.value),
            partyKind,
          ) === "different"
      ) return true;
    }
  }
  if (!declaredValue) return false;
  return candidates.some((candidate) =>
    compareDocumentFactValues(
      factKey,
      declaredValue,
      clean(candidate.value),
      partyKind,
    ) === "different"
  );
}

function requiresRoleReview(
  factKey: DocumentFactKey,
  observations: ReadonlyArray<DocumentFactObservation>,
): boolean {
  const roles = new Set(
    observations.map((observation) => observation.semanticRole),
  );
  if (factKey === "partyName") {
    return roles.has("contract_holder") && roles.has("buyer_or_customer");
  }
  if (factKey === "structuredAddress") {
    return roles.has("invoice_address") ||
      !roles.has("installation_or_delivery_address");
  }
  return false;
}

export function decideDocumentFact(
  input: DocumentFactDecisionInput,
): DocumentFactDecision {
  const declaredValue = clean(input.declaredValue);
  const correctedValue = clean(input.correctedValue);
  const confirmedValue = clean(input.confirmedValue);
  const found = foundObservations(input.observations);
  const applicable = input.observations.filter((observation) =>
    observation.extractionStatus !== "not_applicable"
  );

  if (input.observations.length > 0 && applicable.length === 0) {
    return {
      status: "not_applicable",
      canonicalValue: "",
      normalizationApplied: false,
      blocksProgress: false,
      needsCustomerIntent: false,
      reason: "source_not_applicable",
    };
  }
  if (correctedValue) {
    return {
      status: "review_required",
      canonicalValue: correctedValue,
      normalizationApplied: false,
      blocksProgress: false,
      needsCustomerIntent: false,
      reason: "manual_correction",
    };
  }
  if (
    applicable.some((observation) =>
      observation.extractionStatus === "ambiguous"
    )
  ) {
    return {
      status: "ambiguous",
      canonicalValue: "",
      normalizationApplied: false,
      blocksProgress: true,
      needsCustomerIntent: true,
      reason: "multiple_candidates",
    };
  }
  if (
    applicable.some((observation) =>
      observation.extractionStatus === "rejected"
    )
  ) {
    return {
      status: "blocked",
      canonicalValue: "",
      normalizationApplied: false,
      blocksProgress: true,
      needsCustomerIntent: false,
      reason: "hard_value_conflict",
    };
  }

  const hardConflict = hasHardComparableConflict(
    input.factKey,
    found,
    declaredValue,
    input.partyKind || "natural_person",
  );
  const comparablePartyConflict = input.factKey === "partyName" &&
    found.some((left, index) =>
      found.slice(index + 1).some((right) =>
        semanticRolesComparable(left.semanticRole, right.semanticRole) &&
        compareDocumentFactValues(
            input.factKey,
            clean(left.value),
            clean(right.value),
            input.partyKind || "natural_person",
          ) === "different"
      )
    );
  const explicitLocationConflict = input.factKey === "structuredAddress" &&
    hardConflict &&
    found.some((observation) =>
      observation.semanticRole === "installation_or_delivery_address" ||
      observation.semanticRole === "installation_address"
    );
  if (
    (HARD_CONFLICT_FACTS.has(input.factKey) && hardConflict) ||
    comparablePartyConflict || explicitLocationConflict
  ) {
    return {
      status: "blocked",
      canonicalValue: "",
      normalizationApplied: false,
      blocksProgress: true,
      needsCustomerIntent: false,
      reason: "hard_value_conflict",
    };
  }

  if (found.length === 0 && !declaredValue) {
    return {
      status: "missing",
      canonicalValue: "",
      normalizationApplied: false,
      blocksProgress: true,
      needsCustomerIntent: true,
      reason: "no_value",
    };
  }

  if (requiresRoleReview(input.factKey, found)) {
    return {
      status: "review_required",
      canonicalValue: confirmedValue,
      normalizationApplied: false,
      blocksProgress: !confirmedValue,
      needsCustomerIntent: !confirmedValue,
      reason: "different_semantic_roles",
    };
  }

  const sourceValue = clean(found[0]?.value);
  if (!sourceValue && declaredValue) {
    return {
      status: "review_required",
      canonicalValue: confirmedValue,
      normalizationApplied: false,
      blocksProgress: !confirmedValue,
      needsCustomerIntent: !confirmedValue,
      reason: "relevant_role_missing",
    };
  }
  const match = declaredValue && sourceValue
    ? compareDocumentFactValues(
      input.factKey,
      declaredValue,
      sourceValue,
      input.partyKind || "natural_person",
    )
    : "exact";
  if (match === "different") {
    return {
      status: "review_required",
      canonicalValue: confirmedValue,
      normalizationApplied: false,
      blocksProgress: !confirmedValue,
      needsCustomerIntent: !confirmedValue,
      reason: "declared_difference",
    };
  }
  const status = match === "normalized"
    ? "normalized_match" as const
    : "clean_match" as const;
  return {
    status,
    canonicalValue: confirmedValue,
    normalizationApplied: status === "normalized_match",
    blocksProgress: !confirmedValue,
    needsCustomerIntent: !confirmedValue,
    reason: status === "normalized_match"
      ? "bounded_normalization"
      : "exact_support",
  };
}
