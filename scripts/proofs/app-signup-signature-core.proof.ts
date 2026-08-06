import type { DocumentReviewRow } from "../../app/src/features/signup/documentReviewMatrix.ts";
import type {
  FactPresentationRow,
  FactPresentationSection,
  UnifiedFactPresentation,
} from "../../app/src/features/signup/presentation/factPresentationModel.ts";
import {
  EMPTY_LEGAL_ACTION_STATE,
  LEGAL_DOCUMENT_TYPES,
  legalBundleActionState,
  listLegalDocuments,
  projectLegalActionIntents,
} from "../../app/src/features/signup/signing/legalDocumentRegistry.ts";
import {
  getMandateYearOptions,
  MANDATE_YEAR_POLICY,
  validateMandateCalendarYears,
} from "../../app/src/features/signup/signing/mandateDocumentModel.ts";
import type {
  SignatureMethodPort,
  SignerInput,
} from "../../app/src/features/signup/signing/signatureMethod.ts";
import {
  SIGNATURE_METHOD_IDS,
} from "../../app/src/features/signup/signing/signatureMethod.ts";
import { createSignatureMethodRegistry } from "../../app/src/features/signup/signing/signatureMethodRegistry.ts";
import { createSigningIntent } from "../../app/src/features/signup/signing/signingIntent.ts";
import {
  ACTIVE_SIGNATURE_METHOD_ID,
  getActiveSignupSignatureMethod,
  signupSignatureMethodRegistry,
} from "../../app/src/features/signup/signing/signupSigningComposition.ts";

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

function fact(input: {
  id: string;
  factKey: DocumentReviewRow["factKey"];
  label: string;
  value: string;
  state?: FactPresentationRow["resolutionState"];
  locationId?: string;
}): FactPresentationRow {
  const resolutionState = input.state || "confirmed";
  return {
    id: input.id,
    label: input.label,
    canonicalValue: input.value,
    sources: [],
    sourceValues: [],
    sourceLabels: [],
    applicability: "required",
    resolutionState,
    resolutionReason: resolutionState === "review_required"
      ? "user_override"
      : null,
    judgment: resolutionState === "confirmed"
      ? "Bevestigd"
      : "ENVAL-controle nodig",
    confirmationState: resolutionState === "confirmed"
      ? "confirmed"
      : "unconfirmed",
    correctionState: resolutionState === "review_required"
      ? "manual"
      : "unchanged",
    isRequired: true,
    isInformational: false,
    actions: [],
    locationId: input.locationId,
    reviewRow: { factKey: input.factKey } as DocumentReviewRow,
  };
}

function section(
  id: string,
  title: string,
  rows: FactPresentationRow[],
): FactPresentationSection {
  return { id, title, rows };
}

function privatePresentation(): UnifiedFactPresentation {
  const name = fact({
    id: "account:name",
    factKey: "partyName",
    label: "Naam",
    value: "Daan Koote",
  });
  const locationRows = [
    fact({
      id: "location:a:address",
      factKey: "structuredAddress",
      label: "Adres",
      value: "Dorpsweg 28, 1234 AB Plaats",
      locationId: "location_a",
    }),
    fact({
      id: "location:a:ean",
      factKey: "electricityEan",
      label: "EAN elektriciteit",
      value: "871687400000000001",
      state: "review_required",
      locationId: "location_a",
    }),
  ];
  return {
    organizationRows: [],
    account: section("account", "Account", [name]),
    locations: [section("location_a", "Locatie 1", locationRows)],
    chargers: [],
    documents: section("documents", "Documenten", []),
  };
}

function organizationPresentation(): UnifiedFactPresentation {
  const organizationRows = [
    fact({
      id: "account:organizationName",
      factKey: "organizationName",
      label: "Organisatienaam",
      value: "Voorbeeld B.V.",
    }),
    fact({
      id: "account:kvkNumber",
      factKey: "kvkNumber",
      label: "KvK-nummer",
      value: "12345678",
    }),
    fact({
      id: "account:registeredAddress",
      factKey: "registeredAddress",
      label: "Vestigingsadres",
      value: "Handelsweg 1, 1234 AB Plaats",
    }),
  ];
  const base = privatePresentation();
  return {
    ...base,
    organizationRows,
    account: section("account", "Account", organizationRows),
  };
}

const activeMethod = getActiveSignupSignatureMethod();
assert(
  ACTIVE_SIGNATURE_METHOD_ID === "typed_name_otp_v1" &&
    activeMethod.methodId === "typed_name_otp_v1" &&
    activeMethod.methodVersion === "1" &&
    activeMethod.requiredChallengeType === "otp" &&
    signupSignatureMethodRegistry.list().length === 1,
  "active_typed_name_otp_method_contract_failed",
);

assert(
  SIGNATURE_METHOD_IDS.includes("drawn_signature_v1") &&
    SIGNATURE_METHOD_IDS.includes("external_advanced_signature_v1") &&
    SIGNATURE_METHOD_IDS.includes("qualified_signature_v1") &&
    signupSignatureMethodRegistry.get("drawn_signature_v1") === null &&
    signupSignatureMethodRegistry.get("external_advanced_signature_v1") ===
      null &&
    signupSignatureMethodRegistry.get("qualified_signature_v1") === null,
  "future_method_identifiers_are_not_reserved_only",
);

const proofRegistry = createSignatureMethodRegistry();
const proofFutureMethod: SignatureMethodPort = {
  ...activeMethod,
  methodId: "drawn_signature_v1",
  displayName: "Proof-only registry method",
  createSigningIntent(input) {
    return {
      ...activeMethod.createSigningIntent(input),
      methodId: "drawn_signature_v1",
    };
  },
};
proofRegistry.register(activeMethod);
proofRegistry.register(proofFutureMethod);
assert(
  proofRegistry.require("drawn_signature_v1") === proofFutureMethod,
  "registry_extension_point_failed",
);

const legalDocuments = listLegalDocuments();
assert(
  legalDocuments.length === 4 &&
    LEGAL_DOCUMENT_TYPES.join("|") ===
      "privacy_notice|service_terms|fee_terms|mandate" &&
    legalDocuments.every((document) =>
      Boolean(document.version) && Boolean(document.status) &&
      document.hashStatus === "unverified"
    ) &&
    EMPTY_LEGAL_ACTION_STATE.privacyNoticeRead === false &&
    EMPTY_LEGAL_ACTION_STATE.serviceTermsAccepted === false &&
    EMPTY_LEGAL_ACTION_STATE.feeTermsAccepted === false,
  "versioned_separate_legal_document_contract_failed",
);

const privateSigner: SignerInput = {
  accountType: "particulier",
  fullName: "Daan Koote",
  role: "",
  intentAccepted: true,
};
const yearOptions = getMandateYearOptions(new Date("2026-08-06T00:00:00Z"));
const selectedYear = yearOptions[0];
const legalActionsComplete = {
  privacyNoticeRead: true,
  serviceTermsAccepted: true,
  feeTermsAccepted: true,
  mandateSigned: true,
};
const privateIntent = createSigningIntent({
  accountType: "particulier",
  presentation: privatePresentation(),
  signerInput: privateSigner,
  summaryConfirmed: true,
  selectedMethod: activeMethod,
  legalDocuments,
  legalActions: legalActionsComplete,
  mandateYear: selectedYear,
  evidence: null,
});
assert(
  yearOptions.join("|") === "2026|2027|2028" &&
    MANDATE_YEAR_POLICY.policyId === "whole_calendar_years_v1" &&
    validateMandateCalendarYears([2027, 2028]) &&
    !validateMandateCalendarYears([2027, 2029]) &&
    privateIntent.mandate?.mandatingParty.fullName === "Daan Koote" &&
    privateIntent.mandate.mandatingParty.canonicalAddresses.length === 1 &&
    privateIntent.mandate.electricityEans.length === 1 &&
    privateIntent.mandate.permissions.length === 2 &&
    privateIntent.mandate.issueDate.value === null &&
    privateIntent.mandate.authorityReviewStatus === "not_applicable" &&
    privateIntent.unresolvedReviewMarkers.includes("location:a:ean") &&
    privateIntent.readiness.reasons.includes("legal_version_not_current") &&
    privateIntent.readiness.reasons.includes("signature_challenge_missing") &&
    !privateIntent.readiness.ready,
  "private_mandate_or_closed_readiness_contract_failed",
);

const missingBusinessRole = createSigningIntent({
  accountType: "zakelijk",
  presentation: organizationPresentation(),
  signerInput: {
    accountType: "zakelijk",
    fullName: "Daan Koote",
    role: "",
    intentAccepted: true,
  },
  summaryConfirmed: true,
  selectedMethod: activeMethod,
  legalDocuments,
  legalActions: legalActionsComplete,
  mandateYear: selectedYear,
  evidence: null,
});
assert(
  missingBusinessRole.readiness.reasons.includes("signer_role_missing"),
  "business_signer_role_is_not_required",
);

const businessIntent = createSigningIntent({
  accountType: "zakelijk",
  presentation: organizationPresentation(),
  signerInput: {
    accountType: "zakelijk",
    fullName: "Daan Koote",
    role: "Bestuurder",
    intentAccepted: true,
  },
  summaryConfirmed: true,
  selectedMethod: activeMethod,
  legalDocuments,
  legalActions: legalActionsComplete,
  mandateYear: selectedYear,
  evidence: null,
});
assert(
  businessIntent.mandate?.mandatingParty.organizationName ===
      "Voorbeeld B.V." &&
    businessIntent.mandate.mandatingParty.kvkNumber === "12345678" &&
    businessIntent.mandate.mandatingParty.registeredAddress ===
      "Handelsweg 1, 1234 AB Plaats" &&
    businessIntent.mandate.signer.fullName === "Daan Koote" &&
    businessIntent.mandate.signer.role === "Bestuurder" &&
    businessIntent.mandate.authorityReviewStatus ===
      "required_not_completed",
  "organization_mandate_or_authority_separation_failed",
);

const signatureMethodSource = await source(
  "app/src/features/signup/signing/signatureMethod.ts",
);
const registrySource = await source(
  "app/src/features/signup/signing/signatureMethodRegistry.ts",
);
const compositionSource = await source(
  "app/src/features/signup/signing/signupSigningComposition.ts",
);
const signingSummarySource = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const mandateSource = await source(
  "app/src/features/signup/signing/MandateDocument.tsx",
);
const signerSource = await source(
  "app/src/features/signup/signing/SignerPanel.tsx",
);
const legalBundleSource = await source(
  "app/src/features/signup/signing/SigningLegalBundle.tsx",
);
const cssSource = await source("app/src/styles/components.css");
const coreSources = [signatureMethodSource, registrySource];
const uiSources = [
  signingSummarySource,
  mandateSource,
  signerSource,
  legalBundleSource,
];
assert(
  coreSources.every((value) => !value.includes("methods/")) &&
    compositionSource.includes("typedNameOtpV1Method") &&
    compositionSource.includes("signupSignatureMethodRegistry.register") &&
    !signingSummarySource.includes("methods/typedNameOtpV1") &&
    signingSummarySource.includes("getActiveSignupSignatureMethod"),
  "core_or_composition_import_boundary_failed",
);
assert(
  signingSummarySource.includes("selectUnifiedFactPresentation") &&
    signingSummarySource.includes("<FactTable") &&
    signingSummarySource.indexOf("<MandateDocument") <
      signingSummarySource.indexOf("<SigningLegalBundle") &&
    signingSummarySource.indexOf("<SigningLegalBundle") <
      signingSummarySource.indexOf("<SignerPanel") &&
    !signingSummarySource.includes("SignupReviewPanel"),
  "step_three_did_not_reuse_the_existing_document_projection",
);
assert(
  uiSources.every((value) => !value.includes("style={{")) &&
    uiSources.every((value) => !value.includes("<canvas")) &&
    uiSources.every((value) => !/print|scan/i.test(value)) &&
    uiSources.every((value) => !value.includes("fetch(")) &&
    uiSources.every((value) => !value.includes("otpChallengeId")) &&
    !cssSource.includes("@import") &&
    cssSource.includes(".signing-document__facts") &&
    cssSource.includes(".consent-check-item"),
  "forbidden_signing_ui_or_stylesheet_boundary_failed",
);
assert(
  legalBundleSource.includes("privacyNoticeRead") &&
    legalBundleSource.includes("serviceTermsAccepted") &&
    legalBundleSource.includes("feeTermsAccepted") &&
    legalBundleSource.includes("legalBundleActionState") &&
    !legalBundleSource.includes("disabled=") &&
    projectLegalActionIntents(
        legalDocuments,
        legalBundleActionState(true, EMPTY_LEGAL_ACTION_STATE),
      ).map((intent) => intent.actionType).join("|") ===
      "privacy_notice_read|service_terms_accepted|fee_terms_accepted|mandate_signed",
  "combined_legal_acknowledgement_or_separate_intents_failed",
);

for (
  const [path, expected] of Object.entries({
    "app/src/features/invoice-analysis/invoicePdfParserAdapter.ts":
      "ff7e40cd3c638d4c3a3b1649fe017da29d3e82faa92844a543deba528d6fb352",
    "app/src/features/invoice-analysis/documentObservationEnvelope.ts":
      "d437a77d5e5a5f2323eaf96d126e3c6272da728bf8228a701f356757b9963323",
    "app/src/features/invoice-analysis/documentTypeClassifier.ts":
      "f72a58e38e53cd6e769639f47412289e3a45deb4d3dc7b28982c4c1823b4986a",
    "app/src/features/invoice-analysis/energyEanCandidateExtractor.ts":
      "de06da71bf03185227ed563e5bfb652f804f08c739c9623851d0cf71a644577e",
    "app/src/features/invoice-analysis/energyDocumentObservation.ts":
      "25790501d38a302cbc7bfdc590928a8dfde8cf312c58f6a09462600eeffba25b",
    "app/src/features/signup/documentSemanticProjector.ts":
      "39ba67165aa0bd969498e3d400d5b7c871177821c21bec096fcdef300ecbb9b8",
    "app/src/features/signup/signupSubmitMapper.ts":
      "d348960a22701e5baec962fdb8e8964d8025b3afa6d8f7d3b30ba5ede147ad06",
    "supabase/migrations/20260730150000_app_signup_connection_declaration_sources.sql":
      "c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8",
    "supabase/migrations/20260730170000_app_assisted_connection_capture_correction.sql":
      "561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25",
    "supabase/functions/api-app-signup-submit/index.ts":
      "fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3",
  })
) {
  assert(await sha256(path) === expected, `protected_hash_mismatch:${path}`);
}

console.log("signup-signature-core-09a-proof-ok");
