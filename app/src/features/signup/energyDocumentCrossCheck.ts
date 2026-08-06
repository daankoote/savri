import type {
  ObservedDeliveryAddress,
  ObservedValue,
} from "../invoice-analysis/energyDocumentObservation";
import {
  normalizeHouseNumber,
  normalizePostcode,
} from "./address/addressNormalizers";
import { normalizeHouseNumberAddition } from "./structuredAddress";
import {
  compareSignupDraftToObservedDocumentParty,
  type SignupPartyNameComparison,
} from "./signupPartyNameCrossCheck";
import type { AddressDraft, SignupDraft } from "./signupTypes";

export type EnergyDocumentComparisonStatus =
  | "match"
  | "probable_match"
  | "mismatch"
  | "unavailable";

export type EnergyDocumentComparison = {
  status: EnergyDocumentComparisonStatus;
};

export function compareEnergyDocumentPartyName(
  draft: SignupDraft,
  observed: ObservedValue,
): SignupPartyNameComparison {
  return compareSignupDraftToObservedDocumentParty(draft, observed);
}

export function compareDeclaredLocationToObservedDeliveryAddress(
  declared: AddressDraft,
  observed: ObservedDeliveryAddress,
): EnergyDocumentComparison {
  if (!observed.displayable || observed.confidence === "unavailable") {
    return { status: "unavailable" };
  }
  const declaredPostcode = normalizePostcode(declared.postcode);
  const observedPostcode = normalizePostcode(observed.postalCode || "");
  const declaredHouseNumber = normalizeHouseNumber(declared.houseNumber);
  const observedHouseNumber = normalizeHouseNumber(observed.houseNumber || "");
  const declaredAddition = normalizeHouseNumberAddition(declared.suffix);
  const observedAddition = normalizeHouseNumberAddition(
    observed.houseNumberAddition,
  );

  if (
    declaredPostcode && observedPostcode &&
    declaredPostcode !== observedPostcode
  ) {
    return { status: "mismatch" };
  }
  if (
    declaredHouseNumber && observedHouseNumber &&
    declaredHouseNumber !== observedHouseNumber
  ) {
    if (
      declaredAddition && !observedAddition &&
      observedHouseNumber === `${declaredHouseNumber}${declaredAddition}`
    ) {
      return { status: "unavailable" };
    }
    return { status: "mismatch" };
  }

  if (
    declaredPostcode && observedPostcode && declaredHouseNumber &&
    observedHouseNumber
  ) {
    if (
      declaredAddition && observedAddition &&
      declaredAddition !== observedAddition
    ) {
      return { status: "mismatch" };
    }
    if (Boolean(declaredAddition) !== Boolean(observedAddition)) {
      return { status: "probable_match" };
    }
    return { status: "match" };
  }

  return { status: "unavailable" };
}

export function energyDocumentComparisonLabel(
  status: EnergyDocumentComparisonStatus,
): string | null {
  if (status === "match") return "Komt overeen";
  if (status === "probable_match") return "Lijkt overeen";
  if (status === "mismatch") return "Controle nodig";
  return null;
}
