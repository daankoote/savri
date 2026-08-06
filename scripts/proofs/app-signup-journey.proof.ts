function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string) {
  return await Deno.readTextFile(`app/src/features/signup/${path}`);
}

async function sha256(path: string) {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function runSignupJourneyProof(): Promise<void> {
  const shell = await source("SignupPageShell.tsx");
  const account = await source("PersonalInfoSection.tsx");
  const flow = await source("DocumentFirstSignupFlow.tsx");
  const documents = await source("DocumentFirstDocumentsStep.tsx");
  const organizationPanel = await source(
    "OrganizationDocumentStepPanel.tsx",
  );
  const matrix = await source("DocumentFirstCheckMatrix.tsx");
  const factTable = await source("presentation/FactTable.tsx");
  const reviewControls = await source("presentation/FactReviewControls.tsx");
  const presentationModel = await source(
    "presentation/factPresentationModel.ts",
  );
  const matrixSelector = await source("documentReviewMatrix.ts");
  const registry = await source("documentFactRegistry.ts");
  const navigation = await source("SignupFlowNavigation.tsx");
  const signingSummary = await source("DocumentFirstSigningSummary.tsx");
  const signingIntent = await source("signing/signingIntent.ts");
  const signingComposition = await source(
    "signing/signupSigningComposition.ts",
  );
  const gaps = await source("DocumentFirstGapFields.tsx");
  const model = await source("documentFirstSignupModel.ts");
  const selectors = await source("documentFirstSignupSelectors.ts");
  const connectionConfirmation = await source(
    "ConnectionEanConfirmation.tsx",
  );
  const locationTabs = await source("SignupLocationTabs.tsx");
  const upload = await source("DocumentUploadSlot.tsx");
  const consent = await source("ConsentSignatureSection.tsx");
  const types = await source("signupTypes.ts");
  const normalizers = await source("signupNormalizers.ts");
  const mapper = await source("signupSubmitMapper.ts");
  const css = await Deno.readTextFile("app/src/styles/components.css");

  assert(
    selectors.includes('label: "Account"') &&
      selectors.includes('label: "Documenten"') &&
      selectors.includes('label: "Ondertekenen"') &&
      !selectors.includes('label: "Controleren"') &&
      !selectors.includes('label: "Aanvullen"') &&
      (selectors.match(/label: "/g) || []).length >= 3 &&
      flow.includes("DOCUMENT_FIRST_STEPS.map") &&
      shell.includes("<DocumentFirstSignupFlow"),
    "visible_signup_journey_order_mismatch",
  );

  for (
    const [productionSource, heading] of [
      [account, "Account"],
      [documents, "Documenten"],
      [shell, "Ondertekenen"],
    ]
  ) {
    assert(
      productionSource.includes(`>${heading}</h2>`),
      `signup_heading_missing:${heading}`,
    );
  }

  assert(
    !shell.includes("<SignupLocationSection") &&
      !shell.includes("<SignupConnectionSection") &&
      !shell.includes("<ChargerInfoSection") &&
      !shell.includes("<SignupReviewPanel") &&
      !shell.includes("Aanvullende documenten") &&
      !shell.includes("Controleren en afronden"),
    "superseded_form_first_journey_active",
  );

  assert(
    !account.includes("DOCUMENT_FIRST_ACCOUNT_TYPE_CONFIG") &&
      account.includes("Particulier") && account.includes("Zakelijk") &&
      account.includes("VVE") &&
      account.includes("E-mail") &&
      !account.includes("Bedrijfsnaam") && !account.includes("KVK nummer") &&
      !account.includes("AddressFields") &&
      !account.includes("DocumentUploadSlot") &&
      !account.includes("ChargerForm") &&
      !account.includes("Telefoon"),
    "account_scope_mismatch",
  );

  assert(
    shell.includes("OrganizationDocumentStepPanel") &&
      shell.includes('accountType !== "particulier"') &&
      organizationPanel.includes("KvK-uittreksel") &&
      organizationPanel.includes("DocumentUploadSlot") &&
      organizationPanel.includes("Controleer de organisatiegegevens") &&
      !organizationPanel.includes("parseInvoicePdfInput") &&
      !documents.includes("KvK-uittreksel") &&
      !matrix.includes("KvK-uittreksel"),
    "organization_step_one_or_step_two_cleanup_mismatch",
  );

  assert(
    documents.includes("DocumentUploadSlot") &&
      documents.includes("parseInvoicePdfInput") &&
      documents.includes("activeLocation.energyDocument") &&
      documents.includes("chargerDocumentsByChargerId[chargerId]") &&
      documents.includes('"installation_invoice"') &&
      !documents.includes("ChargerForm"),
    "document_scope_or_binding_mismatch",
  );

  assert(
    locationTabs.includes("if (locations.length <= 1) return null") &&
      locationTabs.includes("locations.map") &&
      documents.includes("<SignupLocationTabs") &&
      shell.includes("activeLocationId={activeLocationId}") &&
      shell.includes("onSelectLocation={setActiveLocationId}"),
    "shared_location_tabs_contract_missing",
  );

  assert(
    matrix.includes("DocumentReviewRow") &&
      matrix.includes("locations.flatMap") &&
      matrix.includes("chargers.filter") &&
      matrix.includes("sections.map") &&
      factTable.includes("visibleRows.map") &&
      factTable.includes("FactReviewControls") &&
      reviewControls.includes("onConfirm(reviewRow)") &&
      reviewControls.includes("onCorrect(reviewRow") &&
      !matrix.includes("compareEnergyDocument") &&
      !matrix.includes("compareChargerDocument") &&
      !matrix.includes("parseInvoicePdfInput"),
    "shared_matrix_contains_business_logic",
  );

  assert(
    shell.includes("selectUnifiedFactPresentation") &&
      matrixSelector.includes("blockers.length === 0") &&
      matrixSelector.includes("selectDocumentFactApplicability") &&
      !registry.includes("requiredForReview") &&
      presentationModel.includes('row.applicability === "not_applicable"') &&
      !shell.includes("<DocumentFirstGapFields"),
    "inline_gap_and_review_contract_missing",
  );

  assert(
    navigation.includes("disabled={!canContinue}") &&
      !navigation.includes("Ondertekenen") &&
      selectors.includes("signing: false") &&
      signingIntent.includes('"mandate_year_missing"') &&
      signingIntent.includes('"signature_challenge_missing"') &&
      signingComposition.includes('"typed_name_otp_v1"') &&
      !shell.includes("submitSignupPayload(") &&
      !shell.includes("mapSignupDraftToSubmitPayload(") &&
      !shell.includes("ConsentSignatureSection") &&
      !shell.includes("Dossier starten") &&
      signingSummary.includes("selectUnifiedFactPresentation") &&
      signingSummary.includes('variant="document"') &&
      presentationModel.includes("ENVAL-controle nodig"),
    "safe_signing_contract_missing",
  );

  assert(
    model.includes("parserObservations") &&
      model.includes("customerConfirmations") &&
      model.includes("manualCorrections") &&
      model.includes("rejectedFactKeys") &&
      model.includes("locationOrder") &&
      model.includes("chargerOrderByLocationId") &&
      matrixSelector.includes("selectDocumentReviewMatrix") &&
      selectors.includes("selectStepCompleteness") &&
      selectors.includes("selectMapperCompatibleDraft"),
    "canonical_state_or_selector_contract_missing",
  );

  assert(
    types.includes('sourceMode: "document" | "manual"') &&
      types.includes('"multiple_candidates"') &&
      normalizers.includes('sourceMode: "document"') &&
      connectionConfirmation.includes("onRequireManualEntry") &&
      mapper.includes("assertExclusiveConnectionDeclarationSource") &&
      mapper.includes('"energy_document_customer_confirmed"') &&
      mapper.includes('"manual_customer_confirmed"') &&
      !mapper.includes("parserObservations") &&
      !mapper.includes("comparisonStatus"),
    "protected_mapper_or_connection_compatibility_missing",
  );

  assert(
    flow.includes("signup-flow-document-first") &&
      factTable.includes("fact-table") &&
      css.includes(".signup-flow-document-first") &&
      css.includes(".fact-table") &&
      css.includes(".signing-document") &&
      css.includes("@media (max-width: 700px)"),
    "signup_scoped_compact_css_missing",
  );

  const productionSources = [
    shell,
    account,
    organizationPanel,
    flow,
    documents,
    matrix,
    navigation,
    signingSummary,
    factTable,
    reviewControls,
    connectionConfirmation,
    locationTabs,
    upload,
    consent,
  ].join("\n");
  const lowerProductionSources = productionSources.toLowerCase();
  for (
    const forbidden of [
      "confidence",
      "sourcepage",
      "rejectionreason",
      "raw context",
      "verwerkingstijd",
      "definitief goedgekeurd",
      "geaccepteerd bewijs",
      "aangeslotene bevestigd",
      "machtiging actief",
      "style={{",
    ]
  ) {
    assert(
      !lowerProductionSources.includes(forbidden),
      `forbidden_signup_copy_or_inline_style:${forbidden}`,
    );
  }

  assert(
    (productionSources.match(/export function DocumentUploadSlot/g) || [])
          .length === 1 &&
      (productionSources.match(/export function SignupLocationTabs/g) || [])
          .length === 1,
    "duplicate_upload_or_location_tabs_component",
  );

  const protectedHashes = [
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
  ] as const;

  for (const [path, expectedHash] of protectedHashes) {
    assert(
      await sha256(path) === expectedHash,
      `protected_hash_mismatch:${path}`,
    );
  }
}

if (import.meta.main) {
  await runSignupJourneyProof();
  console.log("signup-journey-proof-ok");
}
