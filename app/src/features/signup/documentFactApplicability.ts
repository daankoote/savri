import type { DocumentFactKey } from "./documentFactRegistry";
import type { AccountType } from "./signupTypes";

export type DocumentFactApplicability =
  | "required"
  | "informational"
  | "not_applicable";

const PRIVATE_REQUIRED_FACTS: ReadonlySet<DocumentFactKey> = new Set([
  "partyName",
  "structuredAddress",
  "electricityEan",
  "chargerBrand",
  "chargerModel",
  "midNumber",
  "serialNumber",
]);

const ORGANIZATION_REQUIRED_FACTS: ReadonlySet<DocumentFactKey> = new Set([
  "organizationName",
  "kvkNumber",
  "registeredAddress",
  "structuredAddress",
  "electricityEan",
  "chargerBrand",
  "chargerModel",
  "midNumber",
  "serialNumber",
]);

const PRIVATE_NOT_APPLICABLE_FACTS: ReadonlySet<DocumentFactKey> = new Set([
  "organizationName",
  "kvkNumber",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "directorTitle",
  "representationAuthorityText",
  "gasEan",
]);

const ORGANIZATION_NOT_APPLICABLE_FACTS: ReadonlySet<DocumentFactKey> = new Set(
  ["gasEan"],
);

export function selectDocumentFactApplicability(
  accountType: AccountType,
  factKey: DocumentFactKey,
): DocumentFactApplicability {
  const organizationAccount = accountType === "zakelijk" ||
    accountType === "vve";
  const notApplicableFacts = organizationAccount
    ? ORGANIZATION_NOT_APPLICABLE_FACTS
    : PRIVATE_NOT_APPLICABLE_FACTS;
  if (notApplicableFacts.has(factKey)) return "not_applicable";

  const requiredFacts = organizationAccount
    ? ORGANIZATION_REQUIRED_FACTS
    : PRIVATE_REQUIRED_FACTS;
  return requiredFacts.has(factKey) ? "required" : "informational";
}
