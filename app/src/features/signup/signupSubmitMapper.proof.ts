import { mapSignupDraftToSubmitPayload } from "./signupSubmitMapper";
import { createLocationDraft } from "./signupNormalizers";
import type { SignupDraft } from "./signupTypes";
import { validateSignupDraft } from "./signupValidation";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function proofPdf(name: string): File {
  return new File(["proof"], name, { type: "application/pdf" });
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
          postcode: "2042 pc",
          houseNumber: "65",
          suffix: "",
          street: "Kostverlorenstraat",
          city: "Zandvoort",
          country: "Nederland",
          bagId: "bag-2042pc-65",
          resolvedLookupKey: "2042PC|65|",
        },
        energyDocument: {
          clientId: "energy-location-1",
          locationClientId: "",
          documentType: "energy_bill_or_contract",
          file: proofPdf("energy-location-1.pdf"),
          status: "selected",
        },
        energyDocumentObservation: null,
        connectionDeclaration: {
          sourceMode: "document",
          preflightStatus: "customer_confirmed",
          candidates: [{
            normalizedEan: "871685900012345678",
            classification: "electricity",
            context: "EAN elektriciteit 871685900012345678",
            page: null,
          }],
          selectedCandidateEan: "871685900012345678",
          confirmedEan: "871685900012345678",
          manualEan: "",
          customerConfirmed: true,
        },
        chargers: [
          {
            clientId: "charger-a-1",
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
            clientId: "charger-a-2",
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
    documentsByChargerId: {
      "charger-a-1": [{
        clientId: "invoice-a-1",
        chargerClientId: "charger-a-1",
        documentType: "installation_invoice",
        file: proofPdf("invoice-a-1.pdf"),
        status: "selected",
        observation: null,
        parseStatus: "idle",
      }],
      "charger-a-2": [{
        clientId: "invoice-a-2",
        chargerClientId: "charger-a-2",
        documentType: "installation_invoice",
        file: proofPdf("invoice-a-2.pdf"),
        status: "selected",
        observation: null,
        parseStatus: "idle",
      }],
    },
    consents: {
      termsBundleAccepted: true,
    },
  };
}

export function runSignupSubmitMapperProof(): void {
  const draft = proofDraft();
  const before = JSON.stringify(draft);
  const payload = mapSignupDraftToSubmitPayload(draft);

  assert(
    JSON.stringify(draft) === before,
    "mapper must not mutate input draft",
  );
  assert(payload.accountType === "particulier", "accountType must be mapped");
  assert(
    payload.applicant.email === "daan@example.com",
    "email must be normalized",
  );
  assert(
    payload.consentBundleAcceptance.accepted === true,
    "consentBundleAcceptance must be accepted",
  );
  assert(
    payload.feeTermsAcceptance.accepted === true,
    "feeTermsAcceptance must be accepted",
  );
  assert(payload.locations.length === 1, "one location must be mapped");
  assert(
    payload.locations[0].clientLocationId === "location-1",
    "missing location ID must be deterministic",
  );
  assert(
    payload.locations[0].address.postcode === "2042PC",
    "postcode must be normalized",
  );
  assert(
    payload.locations[0].address.houseNumber === "65",
    "house number must be mapped",
  );
  assert(
    payload.applicant.address.postcode ===
      payload.locations[0].address.postcode,
    "first location address must preserve the existing applicant payload shape",
  );
  assert(
    payload.locations[0].connectionDeclaration?.captureMethod ===
      "energy_document_customer_confirmed",
    "confirmed parser EAN must map as an energy-document declaration",
  );
  assert(
    payload.locations[0].chargers.length === 2,
    "two chargers must be mapped",
  );
  assert(
    payload.locations[0].chargers[0].clientChargerId === "charger-a-1",
    "first charger ID must be preserved",
  );
  assert(
    payload.locations[0].chargers[1].clientChargerId === "charger-a-2",
    "second charger ID must be preserved",
  );
  assert(
    payload.locations[0].chargers[0].backendSupplier === undefined,
    "backend supplier must be optional",
  );
  assert(
    payload.locations[0].chargers[0].midNumber === "MID-001",
    "first MID number must be mapped",
  );
  assert(
    payload.locations[0].chargers[1].midNumber === "MID-002",
    "second MID number must be mapped",
  );
  assert(
    payload.locations[0].chargers[1].manualBackendSupplier ===
      "Eigen leverancier",
    "manual supplier must be mapped when present",
  );

  const validation = validateSignupDraft(draft);
  assert(
    validation.canStartDossier,
    `complete confirmed connection draft must pass validation: ${
      validation.errors.map((issue) => issue.id).join(",")
    }`,
  );

  const manualDraft = structuredClone(draft);
  manualDraft.locations[0].connectionDeclaration = {
    sourceMode: "manual",
    preflightStatus: "manual_customer_confirmed",
    candidates: [],
    selectedCandidateEan: "",
    confirmedEan: "871685900012345678",
    manualEan: "871685900012345678",
    customerConfirmed: true,
  };
  manualDraft.locations[0].energyDocument = {
    ...manualDraft.locations[0].energyDocument,
    file: null,
    status: "empty",
  };
  manualDraft.locations[0].energyDocumentObservation = null;
  const manualPayload = mapSignupDraftToSubmitPayload(manualDraft);
  assert(
    manualPayload.locations[0].connectionDeclaration?.ean ===
        "871685900012345678" &&
      manualPayload.locations[0].connectionDeclaration?.captureMethod ===
        "manual_customer_confirmed" &&
      manualPayload.locations[0].connectionDeclaration?.customerConfirmed ===
        true,
    "manual fallback must map only an explicitly confirmed EAN",
  );
  assert(
    validateSignupDraft(manualDraft).canStartDossier,
    "valid confirmed manual EAN must pass validation",
  );

  const businessDraft = structuredClone(manualDraft);
  businessDraft.personalInfo.accountType = "zakelijk";
  businessDraft.personalInfo.companyName = "Proof Bedrijf";
  businessDraft.personalInfo.kvkNumber = "12345678";
  businessDraft.locations[0].clientId = "location-a";
  businessDraft.locations[0].address = structuredClone(
    businessDraft.personalInfo.address,
  );
  businessDraft.locations.push({
    ...structuredClone(businessDraft.locations[0]),
    clientId: "location-b",
    connectionDeclaration: {
      sourceMode: "document",
      preflightStatus: "idle",
      candidates: [],
      selectedCandidateEan: "",
      confirmedEan: "",
      manualEan: "",
      customerConfirmed: false,
    },
    energyDocument: {
      clientId: "energy-location-b",
      locationClientId: "location-b",
      documentType: "energy_bill_or_contract",
      file: proofPdf("energy-location-b.pdf"),
      status: "selected",
    },
    chargers: businessDraft.locations[0].chargers.map((charger, index) => ({
      ...charger,
      clientId: `charger-b-${index + 1}`,
    })),
  });

  const multiPayload = mapSignupDraftToSubmitPayload(businessDraft);
  assert(
    multiPayload.locations.length === 2,
    "two locations must remain separate",
  );
  assert(
    multiPayload.locations[0].connectionDeclaration?.ean ===
        "871685900012345678" &&
      multiPayload.locations[1].connectionDeclaration === undefined,
    "manual and deferred connection states must not leak between locations",
  );
  assert(
    businessDraft.locations[0].energyDocument.clientId !==
      businessDraft.locations[1].energyDocument.clientId,
    "energy-document state must remain independent per location",
  );

  const createdA = createLocationDraft();
  const createdB = createLocationDraft();
  assert(
    createdA.clientId !== createdB.clientId &&
      createdA.energyDocument.locationClientId === createdA.clientId &&
      createdB.energyDocument.locationClientId === createdB.clientId &&
      createdA.energyDocument.clientId !== createdB.energyDocument.clientId,
    "location normalizer must create independent location, EAN and document state",
  );

  businessDraft.locations[1].connectionDeclaration = {
    sourceMode: "manual",
    preflightStatus: "manual_entry_required",
    candidates: [],
    selectedCandidateEan: "",
    confirmedEan: "",
    manualEan: "123",
    customerConfirmed: false,
  };
  const invalidManual = validateSignupDraft(businessDraft);
  assert(
    invalidManual.errors.some((issue) =>
      issue.fieldPath === "locations.location-b.confirmedEan"
    ),
    "manual fallback must require an exact EAN and explicit confirmation",
  );
}
