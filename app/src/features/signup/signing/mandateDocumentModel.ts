import type { AccountType } from "../signupTypes";
import type { CanonicalSigningFactModel } from "./canonicalSigningFacts";
import { factsByKey } from "./canonicalSigningFacts";
import type { SignatureMethodId } from "./signatureMethod";

export const MANDATE_YEAR_POLICY = {
  policyId: "whole_calendar_years_v1",
  minimumYearCount: 1,
} as const;

export type MandatePermission = {
  permissionId:
    | "nea_dso_connection_data_request"
    | "verifier_location_inspection";
  text: string;
  textStatus: "requirement_reference_not_final_legal_copy";
};

export type MandateDocumentModel = {
  schemaVersion: "mandate-document-model-v1";
  accountType: AccountType;
  title: "Machtiging";
  mandatingParty: {
    fullName: string;
    canonicalAddresses: string[];
    organizationName: string;
    kvkNumber: string;
    registeredAddress: string;
  };
  signer: {
    fullName: string;
    role: string;
  };
  electricityEans: string[];
  permissions: readonly MandatePermission[];
  issueDate: {
    status: "server_assigned_at_finalization";
    value: null;
  };
  validity: {
    policyId: typeof MANDATE_YEAR_POLICY.policyId;
    calendarYears: number[];
  };
  signatureMethod: SignatureMethodId;
  authorityReviewStatus:
    | "not_applicable"
    | "required_not_completed";
};

const REQUIRED_PERMISSIONS: readonly MandatePermission[] = [
  {
    permissionId: "nea_dso_connection_data_request",
    text:
      "Ik machtig de Nederlandse Emissieautoriteit (NEa) om gegevens over de genoemde elektriciteitsaansluiting(en) op te vragen bij de distributiesysteembeheerder.",
    textStatus: "requirement_reference_not_final_legal_copy",
  },
  {
    permissionId: "verifier_location_inspection",
    text:
      "Ik machtig de inboekverificateur om de genoemde laadlocatie(s) te controleren.",
    textStatus: "requirement_reference_not_final_legal_copy",
  },
];

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function getMandateYearOptions(
  referenceDate = new Date(),
): readonly number[] {
  const currentYear = referenceDate.getFullYear();
  return [currentYear, currentYear + 1, currentYear + 2];
}

export function validateMandateCalendarYears(
  years: readonly number[],
): boolean {
  if (years.length < MANDATE_YEAR_POLICY.minimumYearCount) return false;
  return years.every((year, index) =>
    Number.isInteger(year) && (index === 0 || year === years[index - 1] + 1)
  );
}

export function createMandateDocumentModel(input: {
  accountType: AccountType;
  canonicalFacts: CanonicalSigningFactModel;
  signerFullName: string;
  signerRole: string;
  calendarYears: number[];
  signatureMethod: SignatureMethodId;
}): MandateDocumentModel {
  const values = (factKey: Parameters<typeof factsByKey>[1]) =>
    uniqueValues(
      factsByKey(input.canonicalFacts, factKey).map((fact) => fact.value),
    );
  const partyNames = values("partyName");
  const addresses = values("structuredAddress");
  return {
    schemaVersion: "mandate-document-model-v1",
    accountType: input.accountType,
    title: "Machtiging",
    mandatingParty: {
      fullName: input.accountType === "particulier" ? partyNames[0] || "" : "",
      canonicalAddresses: input.accountType === "particulier" ? addresses : [],
      organizationName: input.accountType === "particulier"
        ? ""
        : values("organizationName")[0] || "",
      kvkNumber: input.accountType === "particulier"
        ? ""
        : values("kvkNumber")[0] || "",
      registeredAddress: input.accountType === "particulier"
        ? ""
        : values("registeredAddress")[0] || "",
    },
    signer: {
      fullName: input.signerFullName.trim(),
      role: input.accountType === "particulier" ? "" : input.signerRole.trim(),
    },
    electricityEans: values("electricityEan"),
    permissions: REQUIRED_PERMISSIONS,
    issueDate: { status: "server_assigned_at_finalization", value: null },
    validity: {
      policyId: MANDATE_YEAR_POLICY.policyId,
      calendarYears: input.calendarYears,
    },
    signatureMethod: input.signatureMethod,
    authorityReviewStatus: input.accountType === "particulier"
      ? "not_applicable"
      : "required_not_completed",
  };
}
