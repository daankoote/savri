import { mapSignupDraftToSubmitPayload } from "./signupSubmitMapper";
import type { SignupDraft } from "./signupTypes";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function proofDraft(): SignupDraft {
  return {
    personalInfo: {
      accountType: "particulier",
      firstName: "Daan",
      lastName: "Koote",
      companyName: "",
      organizationName: "",
      kvkNumber: "",
      email: "DAAN@example.com ",
      phone: "",
      kvkDocument: null,
      address: {
        postcode: "2042 pc",
        houseNumber: "65",
        suffix: "",
        street: "Kostverlorenstraat",
        city: "Zandvoort",
        country: "Nederland",
        bagId: "bag-2042pc-65",
        resolvedLookupKey: "2042PC|65|",
      },
    },
    locations: [
      {
        clientId: "",
        address: {
          postcode: "",
          houseNumber: "",
          suffix: "",
          street: "",
          city: "",
          country: "Nederland",
          bagId: null,
          resolvedLookupKey: null,
        },
        chargers: [
          {
            clientId: "",
            source: "manual",
            brand: "1",
            manualBrand: "",
            model: "1",
            manualModel: "",
            installationYear: "2024",
            midNumber: "MID-001",
            serialNumber: "SER-001",
            backendSupplier: "",
            manualBackendSupplier: "",
            solarPanelStatus: "none",
          },
          {
            clientId: "",
            source: "manual",
            brand: "other",
            manualBrand: "Eigen merk",
            model: "manual",
            manualModel: "Eigen model",
            installationYear: "2025",
            midNumber: "MID-002",
            serialNumber: "SER-002",
            backendSupplier: "Custom (nieuwe toevoegen)",
            manualBackendSupplier: "Eigen leverancier",
            solarPanelStatus: "hourly_exportable",
          },
        ],
      },
    ],
    documentsByChargerId: {},
    consents: {
      termsBundleAccepted: true,
    },
  };
}

export function runSignupSubmitMapperProof(): void {
  const draft = proofDraft();
  const before = JSON.stringify(draft);
  const payload = mapSignupDraftToSubmitPayload(draft);

  assert(JSON.stringify(draft) === before, "mapper must not mutate input draft");
  assert(payload.accountType === "particulier", "accountType must be mapped");
  assert(payload.applicant.email === "daan@example.com", "email must be normalized");
  assert(payload.consentBundleAcceptance.accepted === true, "consentBundleAcceptance must be accepted");
  assert(payload.feeTermsAcceptance.accepted === true, "feeTermsAcceptance must be accepted");
  assert(payload.locations.length === 1, "one location must be mapped");
  assert(payload.locations[0].clientLocationId === "location-1", "missing location ID must be deterministic");
  assert(payload.locations[0].address.postcode === "2042PC", "postcode must be normalized");
  assert(payload.locations[0].address.houseNumber === "65", "house number must be mapped");
  assert(payload.locations[0].chargers.length === 2, "two chargers must be mapped");
  assert(payload.locations[0].chargers[0].clientChargerId === "charger-1-1", "first missing charger ID must be deterministic");
  assert(payload.locations[0].chargers[1].clientChargerId === "charger-1-2", "second missing charger ID must be deterministic");
  assert(payload.locations[0].chargers[0].backendSupplier === undefined, "backend supplier must be optional");
  assert(payload.locations[0].chargers[0].midNumber === "MID-001", "first MID number must be mapped");
  assert(payload.locations[0].chargers[1].midNumber === "MID-002", "second MID number must be mapped");
  assert(payload.locations[0].chargers[1].manualBackendSupplier === "Eigen leverancier", "manual supplier must be mapped when present");
}
