import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import { selectUnifiedFactPresentation } from "../../app/src/features/signup/presentation/factPresentationModel.ts";
import { normalizeName } from "../../app/src/features/signup/signupFieldNormalizers.ts";
import {
  EMPTY_LEGAL_ACTION_STATE,
  legalBundleActionState,
  listLegalDocuments,
  projectLegalActionIntents,
} from "../../app/src/features/signup/signing/legalDocumentRegistry.ts";

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

let draft = createFreshDocumentFirstSignupDraft("zakelijk");
const firstLocationId = draft.locationOrder[0];
draft = documentFirstSignupReducer(draft, {
  type: "add_charger",
  locationId: firstLocationId,
});
draft = documentFirstSignupReducer(draft, { type: "add_location" });
const secondLocationId = draft.locationOrder[1];
draft = documentFirstSignupReducer(draft, {
  type: "add_charger",
  locationId: secondLocationId,
});
const presentation = selectUnifiedFactPresentation(draft);
const chargerTitles = presentation.chargers.map((charger) => charger.title);

assert(
  presentation.locations.length === 2 &&
    presentation.chargers.length === 4 &&
    presentation.locations.every((location) =>
      presentation.chargers.filter((charger) =>
        charger.locationId === location.locationId
      ).length === 2
    ) &&
    chargerTitles.every((title, index) =>
      title.startsWith(`Laadpaal ${index + 1}`)
    ) &&
    new Set(presentation.chargers.map((charger) => charger.id)).size === 4,
  "stable_location_binding_or_global_charger_numbering_failed",
);

assert(
  normalizeName("  d.   van den berg-janssen ") ===
      "D. Van Den Berg-Janssen" &&
    normalizeName("anne-marie o'neil") === "Anne-Marie O'Neil",
  "existing_name_normalizer_behavior_changed",
);

const legalIntents = projectLegalActionIntents(
  listLegalDocuments(),
  legalBundleActionState(true, EMPTY_LEGAL_ACTION_STATE),
);
assert(
  legalIntents.slice(0, 3).map((intent) => intent.actionType).join("|") ===
      "privacy_notice_read|service_terms_accepted|fee_terms_accepted" &&
    legalIntents.slice(0, 3).every((intent) => intent.confirmed),
  "combined_legal_control_no_longer_projects_three_audit_intents",
);

const summarySource = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const tableSource = await source(
  "app/src/features/signup/presentation/FactTable.tsx",
);
const groupSource = await source(
  "app/src/features/signup/signing/SigningEntityGroup.tsx",
);
const mandateSource = await source(
  "app/src/features/signup/signing/MandateDocument.tsx",
);
const legalSource = await source(
  "app/src/features/signup/signing/SigningLegalBundle.tsx",
);
const signerSource = await source(
  "app/src/features/signup/signing/SignerPanel.tsx",
);
const cssSource = await source("app/src/styles/components.css");
const customerSources = [
  summarySource,
  groupSource,
  mandateSource,
  legalSource,
  signerSource,
];

assert(
  summarySource.includes("export function DocumentFirstSigningSummary") &&
    !summarySource.includes("SignupReviewPanel") &&
    summarySource.includes("<SigningEntityGroup") &&
    groupSource.includes("<FactTable") &&
    groupSource.includes('variant="document"'),
  "single_summary_or_shared_fact_table_contract_failed",
);
assert(
  summarySource.includes("rows={presentation.account.rows}") &&
    summarySource.includes("judgment: null") &&
    summarySource.includes("sources: null") &&
    tableSource.includes("fact-table--two-columns") &&
    tableSource.includes("showSources") &&
    !summarySource.includes('sources: "Binding"'),
  "account_is_not_an_exact_two_column_document_table",
);
assert(
  summarySource.includes("presentation.locations.map") &&
    summarySource.includes("presentation.chargers.filter") &&
    summarySource.includes("charger.locationId === location.locationId") &&
    summarySource.includes("key={location.id}") &&
    groupSource.includes("key={charger.id}") &&
    groupSource.includes("signing-entity-group__rail") &&
    (groupSource.match(/<FactTable/g) || []).length === 1 &&
    !groupSource.includes("<table") &&
    !groupSource.includes("useState") &&
    !groupSource.includes("useReducer"),
  "entity_grouping_has_wrong_binding_or_owns_business_state",
);
assert(
  cssSource.includes(".signing-entity-group__rail") &&
    cssSource.includes("overflow-x: auto") &&
    cssSource.includes("overscroll-behavior-inline: contain") &&
    cssSource.includes("max-width: 100%") &&
    cssSource.includes("grid-auto-flow: column") &&
    cssSource.includes("grid-auto-flow: row") &&
    !cssSource.includes("body {\n  overflow-x"),
  "entity_rail_scroll_boundary_or_page_overflow_failed",
);
assert(
  summarySource.includes('label: "Documentsoort"') &&
    summarySource.includes('value: "Bestandsnaam"') &&
    summarySource.includes("row.sources[0]?.binding") &&
    summarySource.includes("`${row.label} · ${binding}`") &&
    summarySource.includes("rows={documentRows}") &&
    summarySource.includes("sources: null"),
  "documents_table_or_label_binding_contract_failed",
);
assert(
  (summarySource.match(/type="checkbox"/g) || []).length === 1 &&
    (mandateSource.match(/type="checkbox"/g) || []).length === 0 &&
    (legalSource.match(/type="checkbox"/g) || []).length === 1 &&
    (signerSource.match(/type="checkbox"/g) || []).length === 1 &&
    mandateSource.includes("Volledige documenten bekijken") &&
    summarySource.includes('className="signing-blocks"') &&
    summarySource.indexOf("<MandateDocument") <
      summarySource.indexOf("<SigningLegalBundle") &&
    summarySource.indexOf("<SigningLegalBundle") <
      summarySource.indexOf("<SignerPanel") &&
    cssSource.includes("grid-template-columns: repeat(3, minmax(0, 1fr))"),
  "three_signing_blocks_or_confirmation_count_failed",
);
assert(
  signerSource.includes(
    'import { normalizeName } from "../signupFieldNormalizers"',
  ) &&
    signerSource.includes("onBlur") &&
    signerSource.includes("normalizeName(event.target.value)") &&
    signerSource.includes('value.accountType !== "particulier"') &&
    signerSource.includes("organizationName") &&
    signerSource.includes("Functie/rol"),
  "shared_name_normalizer_or_account_type_signer_contract_failed",
);
assert(
    summarySource.includes("signing-primary-action-boundary") &&
    summarySource.includes("Ondertekenen en indienen") &&
    summarySource.includes("Ondertekening bevestigen") &&
    summarySource.includes("disabled={!signingStartReadiness.ready") &&
    summarySource.includes("{readinessMessage}") &&
    !summarySource.includes("VITE_SIGNING_LOCAL_CANDIDATES") &&
    customerSources.every((value) =>
      !value.includes("OTP") &&
      !value.includes("Signing-readiness") &&
      !value.includes("style={{") &&
      !/\.css["']/.test(value)
    ),
  "primary_action_or_forbidden_signing_ui_invalid",
);

for (
  const [path, expected] of Object.entries({
    "app/src/features/signup/signing/signatureMethod.ts":
      "5a2c9f6b2e7f03c5046937c2a6efae9b6122d0f8cf5f1665c2342341a612dc7d",
    "app/src/features/signup/signing/signatureMethodRegistry.ts":
      "0fc19eb9f679505eb50a08d2efbe373b92734270b06854a3444a4b1e9f486b2b",
    "app/src/features/signup/signing/methods/typedNameOtpV1.ts":
      "f6e2a730475815cf731ec49737d77bce65e7130b0691c289e809da28ad912aa0",
    "app/src/features/signup/signing/signupSigningComposition.ts":
      "6e11a2360071bd02236d6de77f693cdb7097b394b0886819103f1deaf13326dd",
    "app/src/features/signup/signing/legalDocumentRegistry.ts":
      "6da68da17a7df18c6af4da23228342af51a2653f900f2738dedaf02d79e97748",
    "app/src/features/signup/signing/mandateDocumentModel.ts":
      "877168ae26d08913c1770797045e0ea9346d0e3c892a1bed9f7a14030fee6a6f",
    "app/src/features/signup/signing/signingIntent.ts":
      "77e4f523f5eee7c7febb0feb6efbc3ea2dd2a39c046a90871ec3ea52cd421af1",
    "app/src/features/signup/signing/legalBundleDocument.ts":
      "f73a1bb26b175f768d0c27e97d6467c2e633bd6c2538753b56b589b6d9676813",
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

console.log("signup-signing-layout-09a2-proof-ok");
