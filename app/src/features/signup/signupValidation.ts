import { getBrandLabel, getModelLabel } from "./chargerCatalog";
import {
  isValidDutchPostcode,
  isValidHouseNumber,
  isValidSuffix,
} from "./address/addressNormalizers";
import {
  isValidEmail,
  isValidKvkNumber,
  isValidName,
  isValidPhone,
} from "./signupFieldNormalizers";
import type {
  AddressDraft,
  ChargerDraft,
  SignupDraft,
  SignupFieldErrors,
  SignupValidationResult,
  ValidationIssue,
} from "./signupTypes";

function filled(value: string) {
  return value.trim().length > 0;
}

function chargerLabel(charger: ChargerDraft, index: number) {
  const brand = charger.brand
    ? getBrandLabel(charger.brand, charger.manualBrand)
    : "";
  const model = charger.model
    ? getModelLabel(charger.brand, charger.model, charger.manualModel)
    : "";
  return [brand, model].filter(Boolean).join(" ") || `Laadpaal ${index + 1}`;
}

function addIssue(
  target: ValidationIssue[],
  fieldPath: string,
  id: string,
  message: string,
  severity: ValidationIssue["severity"] = "error",
) {
  target.push({ id, fieldPath, message, severity });
}

function validateAddress(
  address: AddressDraft,
  fieldPrefix: string,
  label: string,
  errors: ValidationIssue[],
) {
  if (!filled(address.postcode)) {
    addIssue(
      errors,
      `${fieldPrefix}.postalCode`,
      `${fieldPrefix}.postalCode.required`,
      `${label}: postcode is verplicht.`,
    );
  } else if (!isValidDutchPostcode(address.postcode)) {
    addIssue(
      errors,
      `${fieldPrefix}.postalCode`,
      `${fieldPrefix}.postalCode.format`,
      `${label}: gebruik postcode zoals 1234AB.`,
    );
  }

  if (!filled(address.houseNumber)) {
    addIssue(
      errors,
      `${fieldPrefix}.houseNumber`,
      `${fieldPrefix}.houseNumber.required`,
      `${label}: huisnummer is verplicht.`,
    );
  } else if (!isValidHouseNumber(address.houseNumber)) {
    addIssue(
      errors,
      `${fieldPrefix}.houseNumber`,
      `${fieldPrefix}.houseNumber.format`,
      `${label}: huisnummer moet uit cijfers tot 9999 bestaan.`,
    );
  }

  if (address.suffix && !isValidSuffix(address.suffix)) {
    addIssue(
      errors,
      `${fieldPrefix}.suffix`,
      `${fieldPrefix}.suffix.format`,
      `${label}: controleer de suffix/toevoeging.`,
    );
  }
}

function hasModel(charger: ChargerDraft) {
  return charger.model === "manual"
    ? filled(charger.manualModel)
    : filled(charger.model);
}

function groupFieldErrors(errors: ValidationIssue[]): SignupFieldErrors {
  return errors.reduce<SignupFieldErrors>((grouped, issue) => {
    (grouped[issue.fieldPath] ||= []).push(issue);
    return grouped;
  }, {});
}

export function signupFieldErrorId(fieldPath: string): string {
  return `signup-error-${fieldPath.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

export function firstSignupFieldError(
  fieldErrors: SignupFieldErrors,
  fieldPath: string,
): ValidationIssue | null {
  return fieldErrors[fieldPath]?.[0] || null;
}

export function validateSignupDraft(
  draft: SignupDraft,
): SignupValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const { personalInfo } = draft;
  const isBusiness = personalInfo.accountType !== "particulier";

  if (!filled(personalInfo.accountType)) {
    addIssue(
      errors,
      "applicant.accountType",
      "applicant.accountType.required",
      "Kies een type aanmelding.",
    );
  }

  if (!filled(personalInfo.firstName)) {
    addIssue(
      errors,
      "applicant.firstName",
      "applicant.firstName.required",
      "Voornaam is verplicht.",
    );
  } else if (!isValidName(personalInfo.firstName)) {
    addIssue(
      errors,
      "applicant.firstName",
      "applicant.firstName.format",
      "Voornaam: gebruik alleen letters, spaties en streepjes.",
    );
  }

  if (!filled(personalInfo.lastName)) {
    addIssue(
      errors,
      "applicant.lastName",
      "applicant.lastName.required",
      "Achternaam is verplicht.",
    );
  } else if (!isValidName(personalInfo.lastName)) {
    addIssue(
      errors,
      "applicant.lastName",
      "applicant.lastName.format",
      "Achternaam: gebruik alleen letters, spaties en streepjes.",
    );
  }

  if (!filled(personalInfo.email)) {
    addIssue(
      errors,
      "applicant.email",
      "applicant.email.required",
      "E-mailadres is verplicht.",
    );
  } else if (!isValidEmail(personalInfo.email)) {
    addIssue(
      errors,
      "applicant.email",
      "applicant.email.format",
      "Controleer het e-mailadres.",
    );
  }

  if (personalInfo.phone && !isValidPhone(personalInfo.phone)) {
    addIssue(
      errors,
      "applicant.phone",
      "applicant.phone.format",
      "Controleer het telefoonnummer.",
    );
  }

  const legalEntityName = personalInfo.accountType === "vve"
    ? personalInfo.organizationName
    : personalInfo.companyName;
  if (isBusiness && !filled(legalEntityName)) {
    addIssue(
      errors,
      "legalEntity.name",
      "legalEntity.name.required",
      personalInfo.accountType === "vve"
        ? "VVE naam is verplicht."
        : "Bedrijfsnaam is verplicht.",
    );
  } else if (isBusiness && !isValidName(legalEntityName)) {
    addIssue(
      errors,
      "legalEntity.name",
      "legalEntity.name.format",
      personalInfo.accountType === "vve"
        ? "VVE naam: gebruik alleen letters, spaties en streepjes."
        : "Bedrijfsnaam: gebruik alleen letters, spaties en streepjes.",
    );
  }

  if (isBusiness && !filled(personalInfo.kvkNumber)) {
    addIssue(
      errors,
      "legalEntity.tradeRegisterNumber",
      "legalEntity.tradeRegisterNumber.required",
      "KVK nummer is verplicht.",
    );
  } else if (isBusiness && !isValidKvkNumber(personalInfo.kvkNumber)) {
    addIssue(
      errors,
      "legalEntity.tradeRegisterNumber",
      "legalEntity.tradeRegisterNumber.format",
      "KVK nummer moet uit 8 cijfers bestaan.",
    );
  }

  if (isBusiness && !personalInfo.kvkDocument) {
    addIssue(
      warnings,
      "legalEntity.tradeRegisterDocument",
      "legalEntity.tradeRegisterDocument.deferred",
      "KVK-uittreksel moet later worden toegevoegd.",
      "warning",
    );
  }

  if (draft.locations.length < 1) {
    addIssue(
      errors,
      "locations",
      "locations.required",
      "Voeg minimaal één locatie toe.",
    );
  }

  draft.locations.forEach((location, locationIndex) => {
    const locationLabel = isBusiness
      ? `Locatie ${locationIndex + 1}`
      : "Locatie";
    const locationPath = `locations.${location.clientId}`;
    const declaration = location.connectionDeclaration;

    validateAddress(location.address, locationPath, locationLabel, errors);

    if (
      declaration.sourceMode === "document" &&
      !location.energyDocument.file
    ) {
      addIssue(
        errors,
        `${locationPath}.energyDocument`,
        `${locationPath}.energyDocument.required`,
        `${locationLabel}: kies een energienota of energiecontract.`,
      );
    }

    if (
      !declaration.customerConfirmed ||
      !/^\d{18}$/.test(declaration.confirmedEan)
    ) {
      addIssue(
        errors,
        `${locationPath}.confirmedEan`,
        `${locationPath}.confirmedEan.required`,
        declaration.sourceMode === "manual" && declaration.manualEan &&
          !/^\d{18}$/.test(declaration.manualEan)
          ? `${locationLabel}: EAN moet uit exact 18 cijfers bestaan.`
          : `${locationLabel}: bevestig één EAN van de elektriciteitsaansluiting.`,
      );
    }

    if (location.chargers.length < 1) {
      addIssue(
        errors,
        `${locationPath}.chargers`,
        `${locationPath}.chargers.required`,
        `${locationLabel}: voeg minimaal één laadpaal toe.`,
      );
    }

    location.chargers.forEach((charger, chargerIndex) => {
      const label = `${locationLabel} / ${chargerLabel(charger, chargerIndex)}`;
      const chargerPath = `chargers.${charger.clientId}`;

      if (!filled(charger.brand)) {
        addIssue(
          errors,
          `${chargerPath}.brand`,
          `${chargerPath}.brand.required`,
          `${label}: merk is verplicht.`,
        );
      }

      if (charger.brand === "other" && !filled(charger.manualBrand)) {
        addIssue(
          errors,
          `${chargerPath}.manualBrand`,
          `${chargerPath}.manualBrand.required`,
          `${label}: vul merk namelijk in.`,
        );
      }

      if (!hasModel(charger)) {
        addIssue(
          errors,
          `${chargerPath}.model`,
          `${chargerPath}.model.required`,
          `${label}: model is verplicht.`,
        );
      }

      if (!filled(charger.installationYear)) {
        addIssue(
          errors,
          `${chargerPath}.installationYear`,
          `${chargerPath}.installationYear.required`,
          `${label}: installatiejaar is verplicht.`,
        );
      }

      if (!filled(charger.midNumber)) {
        addIssue(
          errors,
          `${chargerPath}.midNumber`,
          `${chargerPath}.midNumber.required`,
          `${label}: MID nummer is verplicht.`,
        );
      }

      if (!filled(charger.serialNumber)) {
        addIssue(
          errors,
          `${chargerPath}.serialNumber`,
          `${chargerPath}.serialNumber.required`,
          `${label}: serienummer is verplicht.`,
        );
      }

      if (
        charger.backendSupplier === "Custom (nieuwe toevoegen)" &&
        !filled(charger.manualBackendSupplier)
      ) {
        addIssue(
          errors,
          `${chargerPath}.manualBackendSupplier`,
          `${chargerPath}.manualBackendSupplier.required`,
          `${label}: vul back-end leverancier namelijk in.`,
        );
      }

      if (!filled(charger.solarPanelStatus)) {
        addIssue(
          errors,
          `${chargerPath}.solarPanelStatus`,
          `${chargerPath}.solarPanelStatus.required`,
          `${label}: kies een optie voor zonnepanelen.`,
        );
      }

      if (charger.solarPanelStatus === "not_hourly_exportable") {
        addIssue(
          warnings,
          `${chargerPath}.solarPanelStatus`,
          `${chargerPath}.solarPanelStatus.review`,
          `${label}: zonnepanelendata vraagt mogelijk extra review.`,
          "warning",
        );
      }

      const invoice = draft.documentsByChargerId[charger.clientId]?.find(
        (document) => document.documentType === "installation_invoice",
      );
      if (!invoice?.file) {
        addIssue(
          errors,
          `${chargerPath}.invoice`,
          `${chargerPath}.invoice.required`,
          `${label}: kies de installatie- of aanschaffactuur.`,
        );
      }
    });
  });

  if (!draft.consents.termsBundleAccepted) {
    addIssue(
      errors,
      "acceptances.terms",
      "acceptances.terms.required",
      "Accepteer de voorwaarden voordat ENVAL uw dossier kan starten.",
    );
  }

  return {
    canStartDossier: errors.length === 0,
    errors,
    fieldErrors: groupFieldErrors(errors),
    warnings,
  };
}

export function isSignupReadyForSigning(draft: SignupDraft): boolean {
  return validateSignupDraft(draft).canStartDossier;
}
