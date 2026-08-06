import type { ObservedValue } from "../invoice-analysis/energyDocumentObservation";
import type { AccountType, SignupDraft } from "./signupTypes";

export type SignupPartyNameComparisonStatus =
  | "exact_full_match"
  | "initial_and_surname_match"
  | "mismatch"
  | "unavailable";

export type SignupPartyNameFocusTarget =
  | "applicant.firstName"
  | "applicant.lastName"
  | "legalEntity.name";

export type ExpectedDocumentPartyName =
  | {
    accountType: "particulier";
    kind: "natural_person";
    value: string;
    firstNames: string;
    lastName: string;
  }
  | {
    accountType: Exclude<AccountType, "particulier">;
    kind: "organization";
    value: string;
  };

export type SignupPartyNameComparison = {
  status: SignupPartyNameComparisonStatus;
  focusTarget: SignupPartyNameFocusTarget | null;
};

export type BoundedPartyNameMatch = "exact" | "probable" | "mismatch";

/**
 * Resolves only the party expected to be the document contract holder.
 * Representatives, administrators, signers and contact details intentionally
 * remain separate authority/signing truth and are never fallback inputs here.
 */
export function resolveExpectedDocumentPartyName(
  draft: SignupDraft,
): ExpectedDocumentPartyName | null {
  const { personalInfo } = draft;
  if (personalInfo.accountType === "particulier") {
    const firstNames = personalInfo.firstName.trim();
    const lastName = personalInfo.lastName.trim();
    if (!firstNames || !lastName) return null;
    return {
      accountType: "particulier",
      kind: "natural_person",
      value: `${firstNames} ${lastName}`,
      firstNames,
      lastName,
    };
  }

  const value = personalInfo.accountType === "vve"
    ? personalInfo.organizationName.trim()
    : personalInfo.companyName.trim();
  if (!value) return null;
  return {
    accountType: personalInfo.accountType,
    kind: "organization",
    value,
  };
}

function normalizeBoundedName(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL")
    .trim()
    .replace(/\s+/g, " ");
}

function hasReliableSinglePartyBoundary(value: string): boolean {
  const candidate = String(value || "").trim();
  return Boolean(candidate) &&
    !/[\n\r\t|/;]/.test(candidate);
}

const SURNAME_PARTICLES: ReadonlySet<string> = new Set([
  "de",
  "den",
  "der",
  "het",
  "ten",
  "ter",
  "van",
]);

function comparableNameTokens(value: string): string[] {
  return normalizeBoundedName(value).replace(/[.,]/g, " ").split(/\s+/)
    .filter(Boolean);
}

export function compareBoundedPartyNameValues(
  left: string,
  right: string,
  kind: "natural_person" | "organization",
): BoundedPartyNameMatch {
  if (kind === "organization") {
    return normalizeOrganizationName(left) === normalizeOrganizationName(right)
      ? "exact"
      : "mismatch";
  }

  const leftTokens = comparableNameTokens(left);
  const rightTokens = comparableNameTokens(right);
  if (leftTokens.join(" ") === rightTokens.join(" ")) return "exact";
  if (leftTokens.length < 2 || rightTokens.length < 2) return "mismatch";
  if (
    leftTokens[leftTokens.length - 1] !== rightTokens[rightTokens.length - 1]
  ) return "mismatch";

  const leftGiven = leftTokens.slice(0, -1);
  const rightGiven = rightTokens.slice(0, -1);
  if (leftGiven.length !== rightGiven.length) return "mismatch";
  const compatible = leftGiven.every((token, index) => {
    const other = rightGiven[index];
    if (SURNAME_PARTICLES.has(token) || SURNAME_PARTICLES.has(other)) {
      return token === other;
    }
    return token === other ||
      (token.length === 1 && token === other?.[0]) ||
      (other?.length === 1 && other === token[0]);
  });
  return compatible ? "probable" : "mismatch";
}

function endsWithTokens(values: string[], suffix: string[]): boolean {
  if (suffix.length === 0 || values.length <= suffix.length) return false;
  return suffix.every((token, index) =>
    values[values.length - suffix.length + index] === token
  );
}

function compareNaturalPersonName(
  expected: Extract<ExpectedDocumentPartyName, { kind: "natural_person" }>,
  observedValue: string,
): SignupPartyNameComparison {
  const declaredFirstNames = normalizeBoundedName(expected.firstNames);
  const declaredLastName = normalizeBoundedName(expected.lastName);
  const observed = normalizeBoundedName(observedValue);
  if (!declaredFirstNames || !declaredLastName || !observed) {
    return { status: "unavailable", focusTarget: null };
  }
  const boundedMatch = compareBoundedPartyNameValues(
    `${declaredFirstNames} ${declaredLastName}`,
    observed,
    "natural_person",
  );
  if (boundedMatch === "exact") {
    return { status: "exact_full_match", focusTarget: null };
  }
  if (boundedMatch === "probable") {
    return { status: "initial_and_surname_match", focusTarget: null };
  }

  const observedTokens = observed.split(" ");
  const declaredLastNameTokens = declaredLastName.split(" ");
  if (!endsWithTokens(observedTokens, declaredLastNameTokens)) {
    return observedTokens.length >= 2
      ? { status: "mismatch", focusTarget: "applicant.lastName" }
      : { status: "unavailable", focusTarget: null };
  }

  return { status: "mismatch", focusTarget: "applicant.firstName" };
}

function normalizeOrganizationName(value: string): string {
  return normalizeBoundedName(value)
    .replace(/\bb\s*\.\s*v\s*\.?(?=\s|$)/gu, "bv")
    .replace(/\bn\s*\.\s*v\s*\.?(?=\s|$)/gu, "nv")
    .replace(/,\s*(?=(?:bv|nv)(?:\s|$))/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareOrganizationName(
  expected: Extract<ExpectedDocumentPartyName, { kind: "organization" }>,
  observedValue: string,
): SignupPartyNameComparison {
  const declared = normalizeOrganizationName(expected.value);
  const observed = normalizeOrganizationName(observedValue);
  if (!declared || !observed) {
    return { status: "unavailable", focusTarget: null };
  }
  return declared === observed
    ? { status: "exact_full_match", focusTarget: null }
    : { status: "mismatch", focusTarget: "legalEntity.name" };
}

/**
 * Parser output is observed/derived assistance, not identity verification,
 * authority, connected-party status or accepted evidence. An initial proves
 * only that initial at its position plus the complete declared surname.
 */
export function compareExpectedDocumentPartyName(
  expected: ExpectedDocumentPartyName | null,
  observed: ObservedValue,
): SignupPartyNameComparison {
  const observedValue = observed.value?.trim() || "";
  if (
    !expected || !observedValue || !observed.displayable ||
    observed.confidence === "unavailable" ||
    !hasReliableSinglePartyBoundary(observedValue) ||
    (expected.kind === "natural_person" &&
      /\s(?:&|en|and)\s/iu.test(observedValue))
  ) {
    return { status: "unavailable", focusTarget: null };
  }

  return expected.kind === "natural_person"
    ? compareNaturalPersonName(expected, observedValue)
    : compareOrganizationName(expected, observedValue);
}

export function compareSignupDraftToObservedDocumentParty(
  draft: SignupDraft,
  observed: ObservedValue,
): SignupPartyNameComparison {
  return compareExpectedDocumentPartyName(
    resolveExpectedDocumentPartyName(draft),
    observed,
  );
}
