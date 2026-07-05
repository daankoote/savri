import { getBrandLabel, getModelLabel } from "./chargerCatalog";
import type {
  AddressDraft,
  ChargerDraft,
  SignupDraft,
  SignupValidationResult,
  ValidationIssue,
} from "./signupTypes";

function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function filled(value: string) {
  return value.trim().length > 0;
}

function chargerLabel(charger: ChargerDraft, index: number) {
  const brand = charger.brand ? getBrandLabel(charger.brand, charger.manualBrand) : "";
  const model = charger.model ? getModelLabel(charger.brand, charger.model, charger.manualModel) : "";
  return [brand, model].filter(Boolean).join(" ") || `Laadpaal ${index + 1}`;
}

function validateAddress(address: AddressDraft, prefix: string, errors: ValidationIssue[]) {
  if (!filled(address.postcode)) {
    errors.push({ id: `${prefix}-postcode`, message: `${prefix}: postcode is verplicht.`, severity: "error" });
  }

  if (!filled(address.houseNumber)) {
    errors.push({ id: `${prefix}-houseNumber`, message: `${prefix}: huisnummer is verplicht.`, severity: "error" });
  }
}

function hasModel(charger: ChargerDraft) {
  return charger.model === "manual" ? filled(charger.manualModel) : filled(charger.model);
}

export function validateSignupDraft(draft: SignupDraft): SignupValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const { personalInfo } = draft;
  const isBusiness = personalInfo.accountType !== "particulier";

  if (!filled(personalInfo.accountType)) {
    errors.push({ id: "accountType", message: "Kies een type aanmelding.", severity: "error" });
  }

  if (!filled(personalInfo.firstName)) {
    errors.push({ id: "firstName", message: "Voornaam is verplicht.", severity: "error" });
  }

  if (!filled(personalInfo.lastName)) {
    errors.push({ id: "lastName", message: "Achternaam is verplicht.", severity: "error" });
  }

  if (!filled(personalInfo.email)) {
    errors.push({ id: "email", message: "E-mailadres is verplicht.", severity: "error" });
  } else if (!isPlausibleEmail(personalInfo.email)) {
    errors.push({ id: "email", message: "Controleer het e-mailadres.", severity: "error" });
  }

  if (personalInfo.accountType === "zakelijk" && !filled(personalInfo.companyName)) {
    errors.push({ id: "companyName", message: "Bedrijfsnaam is verplicht.", severity: "error" });
  }

  if (personalInfo.accountType === "vve" && !filled(personalInfo.organizationName)) {
    errors.push({ id: "organizationName", message: "VVE naam is verplicht.", severity: "error" });
  }

  if (isBusiness && !filled(personalInfo.kvkNumber)) {
    errors.push({ id: "kvkNumber", message: "KVK nummer is verplicht.", severity: "error" });
  }

  if (isBusiness && !personalInfo.kvkDocument) {
    warnings.push({
      id: "kvkDocument",
      message: "KVK-uittreksel moet later worden toegevoegd.",
      severity: "warning",
    });
  }

  validateAddress(personalInfo.address, isBusiness ? "Hoofdgegevens" : "Adres", errors);

  if (draft.locations.length < 1) {
    errors.push({ id: "locations", message: "Voeg minimaal één locatie toe.", severity: "error" });
  }

  draft.locations.forEach((location, locationIndex) => {
    const locationLabel = isBusiness ? `Locatie ${locationIndex + 1}` : "Locatie";

    if (isBusiness) {
      validateAddress(location.address, locationLabel, errors);
    }

    if (location.chargers.length < 1) {
      errors.push({
        id: `${location.clientId}-chargers`,
        message: `${locationLabel}: voeg minimaal één laadpaal toe.`,
        severity: "error",
      });
    }

    location.chargers.forEach((charger, chargerIndex) => {
      const label = `${locationLabel} / ${chargerLabel(charger, chargerIndex)}`;

      if (!filled(charger.brand)) {
        errors.push({ id: `${charger.clientId}-brand`, message: `${label}: merk is verplicht.`, severity: "error" });
      }

      if (charger.brand === "other" && !filled(charger.manualBrand)) {
        errors.push({
          id: `${charger.clientId}-manual-brand`,
          message: `${label}: vul merk namelijk in.`,
          severity: "error",
        });
      }

      if (!hasModel(charger)) {
        errors.push({ id: `${charger.clientId}-model`, message: `${label}: model is verplicht.`, severity: "error" });
      }

      if (!filled(charger.installationYear)) {
        errors.push({
          id: `${charger.clientId}-installation-year`,
          message: `${label}: installatiejaar is verplicht.`,
          severity: "error",
        });
      }

      if (!filled(charger.midNumber)) {
        errors.push({
          id: `${charger.clientId}-mid-number`,
          message: `${label}: MID nummer is verplicht.`,
          severity: "error",
        });
      }

      if (!filled(charger.serialNumber)) {
        errors.push({
          id: `${charger.clientId}-serial`,
          message: `${label}: serienummer is verplicht.`,
          severity: "error",
        });
      }

      if (!filled(charger.backendSupplier)) {
        errors.push({
          id: `${charger.clientId}-backend-supplier`,
          message: `${label}: back-end leverancier is verplicht.`,
          severity: "error",
        });
      }

      if (charger.backendSupplier === "Custom (nieuwe toevoegen)" && !filled(charger.manualBackendSupplier)) {
        errors.push({
          id: `${charger.clientId}-manual-backend-supplier`,
          message: `${label}: vul back-end leverancier namelijk in.`,
          severity: "error",
        });
      }

      if (!filled(charger.solarPanelStatus)) {
        errors.push({
          id: `${charger.clientId}-solar`,
          message: `${label}: kies een optie voor zonnepanelen.`,
          severity: "error",
        });
      }

      if (charger.solarPanelStatus === "not_hourly_exportable") {
        warnings.push({
          id: `${charger.clientId}-solar-review`,
          message: `${label}: zonnepanelendata vraagt mogelijk extra review.`,
          severity: "warning",
        });
      }
    });
  });

  return {
    canStartDossier: errors.length === 0,
    errors,
    warnings,
  };
}
