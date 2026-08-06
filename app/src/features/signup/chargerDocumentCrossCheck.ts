import type { ObservedValue } from "../invoice-analysis/energyDocumentObservation";
import { getBrandLabel, getModelLabel } from "./chargerCatalog";
import {
  compareDeclaredLocationToObservedDeliveryAddress,
  type EnergyDocumentComparison,
} from "./energyDocumentCrossCheck";
import {
  compareSignupDraftToObservedDocumentParty,
  type SignupPartyNameComparison,
} from "./signupPartyNameCrossCheck";
import type {
  AddressDraft,
  ChargerDocumentObservation,
  ChargerDraft,
  SignupDraft,
} from "./signupTypes";

function comparableIdentifier(value: string): string {
  return String(value || "").toLocaleUpperCase("nl-NL").replace(
    /[\s._\-/]+/g,
    "",
  );
}

function comparableLabel(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function exactComparison(
  declared: string,
  observed: ObservedValue,
  normalize: (value: string) => string,
): EnergyDocumentComparison {
  if (!declared.trim() || !observed.displayable || !observed.value?.trim()) {
    return { status: "unavailable" };
  }
  const declaredValue = normalize(declared);
  const observedValue = normalize(observed.value);
  if (!declaredValue || !observedValue) return { status: "unavailable" };
  return { status: declaredValue === observedValue ? "match" : "mismatch" };
}

export type ChargerDocumentComparisons = {
  customerName: SignupPartyNameComparison;
  brand: EnergyDocumentComparison;
  model: EnergyDocumentComparison;
  serialNumber: EnergyDocumentComparison;
  midNumber: EnergyDocumentComparison;
  location: EnergyDocumentComparison;
  installationYear: EnergyDocumentComparison;
};

export function compareChargerDocumentObservation(
  charger: ChargerDraft,
  draft: SignupDraft,
  location: AddressDraft,
  observation: ChargerDocumentObservation,
): ChargerDocumentComparisons {
  const brand = getBrandLabel(charger.brand, charger.manualBrand);
  const model = getModelLabel(
    charger.brand,
    charger.model,
    charger.manualModel,
  );
  return {
    customerName: compareSignupDraftToObservedDocumentParty(
      draft,
      observation.customerName,
    ),
    brand: exactComparison(brand, observation.brand, comparableLabel),
    model: exactComparison(model, observation.model, comparableLabel),
    serialNumber: exactComparison(
      charger.serialNumber,
      observation.serialNumber,
      comparableIdentifier,
    ),
    midNumber: exactComparison(
      charger.midNumber,
      observation.midNumber,
      comparableIdentifier,
    ),
    location: compareDeclaredLocationToObservedDeliveryAddress(
      location,
      observation.location,
    ),
    installationYear: exactComparison(
      charger.installationYear,
      observation.installationYear,
      (value) => value.trim(),
    ),
  };
}
