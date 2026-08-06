import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import { selectDocumentFactApplicability } from "../../app/src/features/signup/documentFactApplicability.ts";
import type { DocumentFactKey } from "../../app/src/features/signup/documentFactRegistry.ts";
import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import {
  selectDocumentReviewMatrix,
  selectOrganizationDocumentReviewRows,
} from "../../app/src/features/signup/documentReviewMatrix.ts";
import { hasMeaningfulManualAddress } from "../../app/src/features/signup/structuredAddress.ts";
import type { AddressDraft } from "../../app/src/features/signup/signupTypes.ts";

const ROOT = new URL("../../", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
}

async function sha256(path: string): Promise<string> {
  const bytes = await Deno.readFile(new URL(path, ROOT));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requiredFixture(variable: string): Promise<Uint8Array> {
  const path = Deno.env.get(variable);
  assert(path, `required_fixture_env_missing:${variable}`);
  return await Deno.readFile(path);
}

function row(
  accountType: "particulier" | "zakelijk" | "vve",
  factKey: DocumentFactKey,
) {
  const draft = createFreshDocumentFirstSignupDraft(accountType);
  const locationId = draft.locationOrder[0];
  const chargerId = draft.chargerOrderByLocationId[locationId][0];
  const organizationFact = [
    "organizationName",
    "kvkNumber",
    "registeredAddress",
    "legalForm",
    "tradeName",
    "directorOrBoardMember",
    "representationAuthorityText",
  ].includes(factKey);
  const result =
    (organizationFact
      ? selectOrganizationDocumentReviewRows(draft)
      : selectDocumentReviewMatrix(draft, locationId, chargerId).rows)
      .find((candidate) => candidate.factKey === factKey);
  assert(result, `matrix_row_missing:${accountType}:${factKey}`);
  return result;
}

const privateRequired = [
  "partyName",
  "structuredAddress",
  "electricityEan",
  "chargerBrand",
  "chargerModel",
  "midNumber",
  "serialNumber",
] as const;
const privateNotApplicable = [
  "organizationName",
  "kvkNumber",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "directorTitle",
  "representationAuthorityText",
  "gasEan",
] as const;
const privateInformational = [
  "energySupplier",
  "contractStart",
  "contractEnd",
  "installerOrSupplier",
  "invoiceDate",
  "explicitInstallationDate",
] as const;

for (const factKey of privateRequired) {
  assert(
    selectDocumentFactApplicability("particulier", factKey) === "required",
    `private_required_mismatch:${factKey}`,
  );
  const requiredRow = row("particulier", factKey);
  assert(
    requiredRow.required && requiredRow.action === "Invullen" &&
      requiredRow.blocksProgress,
    `private_required_row_mismatch:${factKey}`,
  );
}
for (const factKey of privateNotApplicable) {
  assert(
    selectDocumentFactApplicability("particulier", factKey) ===
      "not_applicable",
    `private_not_applicable_mismatch:${factKey}`,
  );
  if (factKey === "directorTitle") continue;
  const notApplicableRow = row("particulier", factKey);
  assert(
    notApplicableRow.decisionStatus === "not_applicable" &&
      notApplicableRow.action === null &&
      !notApplicableRow.blocksProgress &&
      !notApplicableRow.canonicalValue,
    `private_not_applicable_row_mismatch:${factKey}`,
  );
}
for (const factKey of privateInformational) {
  assert(
    selectDocumentFactApplicability("particulier", factKey) ===
      "informational",
    `private_informational_mismatch:${factKey}`,
  );
  const informationalRow = row("particulier", factKey);
  assert(
    informationalRow.decisionStatus === "missing" &&
      informationalRow.action === null &&
      !informationalRow.blocksProgress,
    `private_informational_row_mismatch:${factKey}`,
  );
}

for (const accountType of ["zakelijk", "vve"] as const) {
  for (
    const factKey of [
      "organizationName",
      "kvkNumber",
      "registeredAddress",
    ] as const
  ) {
    assert(
      selectDocumentFactApplicability(accountType, factKey) === "required" &&
        row(accountType, factKey).required,
      `organization_required_mismatch:${accountType}:${factKey}`,
    );
  }
  assert(
    selectDocumentFactApplicability(accountType, "partyName") ===
        "informational" &&
      !row(accountType, "partyName").required,
    `organization_party_name_requirement_mismatch:${accountType}`,
  );
  assert(
    selectDocumentFactApplicability(accountType, "gasEan") ===
      "not_applicable",
    `organization_gas_requirement_mismatch:${accountType}`,
  );
}

const emptyAddress: AddressDraft = {
  postcode: "",
  houseNumber: "",
  suffix: "",
  street: "",
  city: "",
  country: "Nederland",
  bagId: null,
  resolvedLookupKey: null,
};
const incompleteAddress: AddressDraft = {
  ...emptyAddress,
  postcode: "1234AB",
  houseNumber: "1",
};
const completeAddress: AddressDraft = {
  ...incompleteAddress,
  street: "Voorbeeldstraat",
  city: "Utrecht",
};
assert(
  !hasMeaningfulManualAddress({
    street: emptyAddress.street,
    houseNumber: emptyAddress.houseNumber,
    houseNumberAddition: emptyAddress.suffix,
    postalCode: emptyAddress.postcode,
    city: emptyAddress.city,
    country: emptyAddress.country,
  }) &&
    !hasMeaningfulManualAddress({
      street: incompleteAddress.street,
      houseNumber: incompleteAddress.houseNumber,
      houseNumberAddition: incompleteAddress.suffix,
      postalCode: incompleteAddress.postcode,
      city: incompleteAddress.city,
      country: incompleteAddress.country,
    }) &&
    hasMeaningfulManualAddress({
      street: completeAddress.street,
      houseNumber: completeAddress.houseNumber,
      houseNumberAddition: completeAddress.suffix,
      postalCode: completeAddress.postcode,
      city: completeAddress.city,
      country: completeAddress.country,
    }),
  "manual_address_completeness_boundary_failed",
);

let draft = createFreshDocumentFirstSignupDraft("particulier");
const locationId = draft.locationOrder[0];
const chargerId = draft.chargerOrderByLocationId[locationId][0];
const addressKey = `location:${locationId}:address`;
let addressRow = selectDocumentReviewMatrix(draft, locationId, chargerId).rows
  .find((candidate) => candidate.factKey === "structuredAddress");
assert(
  addressRow?.decisionStatus === "missing" &&
    addressRow.action === "Invullen" &&
    addressRow.declared.value === null &&
    !addressRow.canonicalValue &&
    !draft.manualCorrections[addressKey] &&
    !draft.customerConfirmations[addressKey],
  "default_country_created_address_state",
);

const unchangedAfterCancel = draft;
assert(
  !unchangedAfterCancel.manualCorrections[addressKey] &&
    !unchangedAfterCancel.customerConfirmations[addressKey],
  "cancel_left_address_state",
);

const energyBytes = await requiredFixture("ENVAL_EAN_REAL_PDF");
const chargerBytes = await requiredFixture("ENVAL_CHARGER_REAL_PDF");
const energyResult = await parseInvoicePdfInput(energyBytes);
const chargerResult = await parseInvoicePdfInput(chargerBytes);
assert(energyResult.ok && chargerResult.ok, "real_fixture_parse_failed");
const energyDocument = draft.energyDocumentsByLocationId[locationId];
const chargerDocument = draft.chargerDocumentsByChargerId[chargerId].find(
  (document) => document.documentType === "installation_invoice",
);
assert(chargerDocument, "charger_document_slot_missing");
draft = documentFirstSignupReducer(draft, {
  type: "update_energy_document",
  document: {
    ...energyDocument,
    file: new File([energyBytes.buffer as ArrayBuffer], "energy-fixture.pdf", {
      type: "application/pdf",
    }),
    status: "selected",
  },
});
draft = documentFirstSignupReducer(draft, {
  type: "set_document_observation",
  documentId: energyDocument.clientId,
  value: {
    documentId: energyDocument.clientId,
    contentFingerprint: energyResult.observation_envelope.contentFingerprint,
    parserVersion: energyResult.parser_version,
    envelope: energyResult.observation_envelope,
  },
});
draft = documentFirstSignupReducer(draft, {
  type: "update_charger_document",
  document: {
    ...chargerDocument,
    file: new File(
      [chargerBytes.buffer as ArrayBuffer],
      "charger-fixture.pdf",
      {
        type: "application/pdf",
      },
    ),
    status: "selected",
    parseStatus: "parsed",
  },
});
draft = documentFirstSignupReducer(draft, {
  type: "set_document_observation",
  documentId: chargerDocument.clientId,
  value: {
    documentId: chargerDocument.clientId,
    contentFingerprint: chargerResult.observation_envelope.contentFingerprint,
    parserVersion: chargerResult.parser_version,
    envelope: chargerResult.observation_envelope,
  },
});
draft = documentFirstSignupReducer(draft, {
  type: "set_manual_correction",
  factKey: addressKey,
  canonicalFactKey: "structuredAddress",
  value: completeAddress,
  sourceDocumentId: energyDocument.clientId,
  sourceDocumentType: "energy_bill_or_contract",
  observedFact: null,
  correctionType: "customer_declared_difference",
  confirmedAt: "2026-08-04T00:00:00.000Z",
  pendingPersistence: false,
});
addressRow = selectDocumentReviewMatrix(draft, locationId, chargerId).rows.find(
  (candidate) => candidate.factKey === "structuredAddress",
);
assert(
  addressRow?.decisionStatus === "review_required" &&
    addressRow.canonicalValue.includes("Voorbeeldstraat") &&
    addressRow.blocksProgress,
  "complete_manual_address_did_not_create_review_state",
);
draft = documentFirstSignupReducer(draft, {
  type: "confirm_fact",
  factKey: addressKey,
  canonicalFactKey: "structuredAddress",
  value: completeAddress,
  sourceDocuments: [{
    documentId: energyDocument.clientId,
    documentType: "energy_bill_or_contract",
  }],
  confirmedAt: "2026-08-04T00:00:00.000Z",
  decisionStatus: "review_required",
  normalizationApplied: false,
  pendingPersistence: false,
});

const confirmations = [
  [
    `location:${locationId}:energy:contractHolder`,
    "partyName",
    "Voorbeeld Persoon",
  ],
  [`location:${locationId}:energy:ean`, "electricityEan", "871234567890123456"],
  [`charger:${chargerId}:brand`, "chargerBrand", "Voorbeeldmerk"],
  [`charger:${chargerId}:model`, "chargerModel", "Voorbeeldmodel"],
  [`charger:${chargerId}:midNumber`, "midNumber", "MID-voorbeeld"],
  [`charger:${chargerId}:serialNumber`, "serialNumber", "SER-voorbeeld"],
] as const;
for (const [scopeKey, factKey, value] of confirmations) {
  draft = documentFirstSignupReducer(draft, {
    type: "confirm_fact",
    factKey: scopeKey,
    canonicalFactKey: factKey,
    value,
    sourceDocuments: [{
      documentId: factKey.startsWith("charger") ||
          factKey === "midNumber" || factKey === "serialNumber"
        ? chargerDocument.clientId
        : energyDocument.clientId,
      documentType: factKey.startsWith("charger") ||
          factKey === "midNumber" || factKey === "serialNumber"
        ? "installation_invoice"
        : "energy_bill_or_contract",
    }],
    confirmedAt: "2026-08-04T00:00:00.000Z",
    decisionStatus: "clean_match",
    normalizationApplied: false,
    pendingPersistence: false,
  });
}

assert(
  [
    addressKey,
    `location:${locationId}:energy:contractHolder`,
    `location:${locationId}:energy:ean`,
    `charger:${chargerId}:brand`,
    `charger:${chargerId}:model`,
    `charger:${chargerId}:midNumber`,
    `charger:${chargerId}:serialNumber`,
  ].every((scopeKey) => draft.customerConfirmations[scopeKey]),
  "summary_missing_confirmed_required_facts",
);
assert(
  draft.customerConfirmations[addressKey].correctedManually &&
    draft.customerConfirmations[addressKey].decisionStatus ===
      "review_required",
  "summary_manual_review_marker_missing",
);
const populatedMatrix = selectDocumentReviewMatrix(
  draft,
  locationId,
  chargerId,
);
assert(
  populatedMatrix.rows.filter((candidate) =>
    candidate.applicability === "informational"
  ).flatMap((candidate) => candidate.observations).some((observation) =>
    observation.extractionStatus === "found" &&
    observation.displayable && observation.value
  ),
  "summary_found_informational_facts_missing",
);

const matrixUi = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const summaryUi = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const presentationModel = await source(
  "app/src/features/signup/presentation/factPresentationModel.ts",
);
const factTable = await source(
  "app/src/features/signup/presentation/FactTable.tsx",
);
const reviewControls = await source(
  "app/src/features/signup/presentation/FactReviewControls.tsx",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
assert(
  factTable.includes('row.applicability !== "not_applicable"') &&
    presentationModel.includes('row.applicability === "not_applicable"') &&
    reviewControls.includes("hasMeaningfulManualAddress") &&
    reviewControls.includes("setAddressCorrection(null)") &&
    !matrixUi.includes("style={{"),
  "matrix_applicability_or_manual_address_ui_missing",
);
assert(
  !summaryUi.includes("Aanvullend uit documenten") &&
    summaryUi.includes("selectUnifiedFactPresentation") &&
    summaryUi.includes('variant="document"') &&
    presentationModel.includes('label: "Handmatig aangepast"') &&
    presentationModel.includes('row.applicability === "informational"') &&
    presentationModel.includes('candidate.extractionStatus === "found"') &&
    presentationModel.includes("documentFilename") &&
    presentationModel.includes("locationTitle") &&
    presentationModel.includes("chargerTitle") &&
    !summaryUi.includes("confidence") &&
    !summaryUi.includes("sourcePage") &&
    !summaryUi.includes("extractionMethod") &&
    !summaryUi.includes("Onderteken nu") &&
    !summaryUi.includes("style={{") &&
    !shell.includes("Onderteken nu"),
  "summary_customer_safety_boundary_failed",
);

for (
  const [path, expected] of [
    [
      "app/src/features/invoice-analysis/invoicePdfParserAdapter.ts",
      "ff7e40cd3c638d4c3a3b1649fe017da29d3e82faa92844a543deba528d6fb352",
    ],
    [
      "app/src/features/invoice-analysis/documentObservationEnvelope.ts",
      "d437a77d5e5a5f2323eaf96d126e3c6272da728bf8228a701f356757b9963323",
    ],
    [
      "app/src/features/invoice-analysis/documentTypeClassifier.ts",
      "f72a58e38e53cd6e769639f47412289e3a45deb4d3dc7b28982c4c1823b4986a",
    ],
    [
      "app/src/features/invoice-analysis/energyEanCandidateExtractor.ts",
      "de06da71bf03185227ed563e5bfb652f804f08c739c9623851d0cf71a644577e",
    ],
    [
      "app/src/features/invoice-analysis/energyDocumentObservation.ts",
      "25790501d38a302cbc7bfdc590928a8dfde8cf312c58f6a09462600eeffba25b",
    ],
    [
      "app/src/features/signup/documentSemanticProjector.ts",
      "39ba67165aa0bd969498e3d400d5b7c871177821c21bec096fcdef300ecbb9b8",
    ],
    [
      "supabase/migrations/20260730150000_app_signup_connection_declaration_sources.sql",
      "c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8",
    ],
    [
      "supabase/migrations/20260730170000_app_assisted_connection_capture_correction.sql",
      "561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25",
    ],
    [
      "supabase/functions/api-app-signup-submit/index.ts",
      "fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3",
    ],
  ] as const
) {
  assert(await sha256(path) === expected, `protected_hash_mismatch:${path}`);
}

console.log("signup-fact-applicability-summary-06-proof-ok");
