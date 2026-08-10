import {
  type BrowserHtmlLegalBundleEnvironment,
  createBrowserHtmlLegalBundleV1,
  renderBrowserHtmlLegalBundleV1,
} from "../../app/src/features/signup/signing/browserHtmlLegalBundleV1.ts";
import { createLegalBundleDocument } from "../../app/src/features/signup/signing/legalBundleDocument.ts";
import {
  EMPTY_LEGAL_ACTION_STATE,
  legalBundleActionState,
  listLegalDocuments,
  projectLegalActionIntents,
} from "../../app/src/features/signup/signing/legalDocumentRegistry.ts";
import {
  getMandateYearOptions,
  type MandateDocumentModel,
} from "../../app/src/features/signup/signing/mandateDocumentModel.ts";
import {
  signupStepScrollBehavior,
  type SignupStepTransitionEnvironment,
  transitionSignupStep,
} from "../../app/src/features/signup/signupStepTransition.ts";

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

const mandate: MandateDocumentModel = {
  schemaVersion: "mandate-document-model-v1",
  accountType: "zakelijk",
  title: "Machtiging",
  mandatingParty: {
    fullName: "",
    canonicalAddresses: [],
    organizationName: "Voorbeeld B.V.",
    kvkNumber: "12345678",
    registeredAddress: "Handelsweg 1, 1234 AB Plaats",
  },
  signer: { fullName: "Daan Koote", role: "Bestuurder" },
  electricityEans: ["871687400000000001"],
  permissions: [
    {
      permissionId: "nea_dso_connection_data_request",
      text:
        "Ik machtig de Nederlandse Emissieautoriteit (NEa) om gegevens over de genoemde elektriciteitsaansluiting(en) op te vragen bij de distributiesysteembeheerder.",
      textStatus: "requirement_reference_not_final_legal_copy",
    },
    {
      permissionId: "verifier_location_inspection",
      text:
        "Ik machtig de inboekverificateur om de genoemde laadlocatie(s) te controleren.",
      textStatus: "requirement_reference_not_final_legal_copy",
    },
  ],
  issueDate: { status: "server_assigned_at_finalization", value: null },
  validity: {
    policyId: "one_whole_calendar_year_v1",
    calendarYears: [2026],
  },
  signatureMethod: "typed_name_otp_v1",
  authorityReviewStatus: "required_not_completed",
};

const documents = listLegalDocuments();
const confirmedActions = legalBundleActionState(
  true,
  EMPTY_LEGAL_ACTION_STATE,
);
const actionIntents = projectLegalActionIntents(documents, confirmedActions);
assert(
  actionIntents.map((intent) => intent.actionType).join("|") ===
      "privacy_notice_read|service_terms_accepted|fee_terms_accepted|mandate_signed" &&
    actionIntents.slice(0, 3).every((intent) => intent.confirmed) &&
    actionIntents[3].confirmed === false &&
    actionIntents.every((intent) =>
      Boolean(intent.version) && intent.language === "nl" &&
      intent.hashStatus === "unverified"
    ),
  "combined_checkbox_did_not_project_separate_versioned_actions",
);

assert(
  getMandateYearOptions(new Date("2026-08-06T00:00:00Z")).join("|") ===
    "2026|2027|2028",
  "mandate_year_policy_is_not_current_plus_two",
);

const bundle = createLegalBundleDocument({ documents, mandate });
const rendered = renderBrowserHtmlLegalBundleV1(bundle);
assert(
  bundle.sections.map((section) => section.documentType).join("|") ===
      "privacy_notice|service_terms|fee_terms|mandate" &&
    rendered.includes("Privacyverklaring") &&
    rendered.includes("Algemene voorwaarden") &&
    rendered.includes("Vergoedingsvoorwaarden") &&
    rendered.includes("Machtiging") &&
    rendered.includes("Voorbeeld B.V.") &&
    rendered.includes("871687400000000001") &&
    !rendered.includes("unverified") && !rendered.includes("draft-v1"),
  "self_contained_bundle_render_failed",
);

const urls: string[] = [];
const revoked: string[] = [];
const previewWindow = { opener: "parent" as unknown };
const anchor = {
  clickCount: 0,
  download: "",
  href: "",
  rel: "",
  removed: false,
  click() {
    this.clickCount += 1;
  },
  remove() {
    this.removed = true;
  },
};
const exportEnvironment: BrowserHtmlLegalBundleEnvironment = {
  appendAnchor: (candidate) => assert(candidate === anchor, "wrong_anchor"),
  createAnchor: () => anchor,
  createObjectUrl: () => {
    const url = `blob:proof-${urls.length + 1}`;
    urls.push(url);
    return url;
  },
  openPreview: (url) => {
    assert(url.startsWith("blob:proof-"), "preview_is_not_blob_backed");
    return previewWindow;
  },
  revokeObjectUrl: (url) => revoked.push(url),
  scheduleRevoke: (callback) => callback(),
};
const exporter = createBrowserHtmlLegalBundleV1(exportEnvironment);
assert(exporter.preview(bundle), "preview_was_not_opened");
assert(exporter.download(bundle), "download_was_not_started");
assert(
  previewWindow.opener === null && anchor.clickCount === 1 && anchor.removed &&
    anchor.download === "enval-aanmelddocumenten.html" &&
    anchor.rel === "noopener noreferrer" && urls.length === 2 &&
    revoked.join("|") === urls.join("|"),
  "preview_download_lifecycle_is_not_state_safe",
);

const transitions: string[] = [];
const scrolled: ScrollIntoViewOptions[] = [];
const focused: string[] = [];
const stepEnvironment: SignupStepTransitionEnvironment = {
  getElementById: (id) => ({
    focus: () => focused.push(id),
    scrollIntoView: (options) => scrolled.push(options || {}),
    setAttribute: (name, value) => {
      assert(name === "tabindex" && value === "-1", "title_not_focusable");
    },
  }),
  prefersReducedMotion: () => true,
  schedule: (callback) => callback(),
};
for (const step of ["documents", "signing", "documents", "account"] as const) {
  transitionSignupStep(step, (next) => transitions.push(next), stepEnvironment);
}
assert(
  transitions.join("|") === "documents|signing|documents|account" &&
    scrolled.length === 4 &&
    scrolled.every((options) => options.behavior === "auto") &&
    focused.join("|") ===
      "document-first-documents-title|document-first-signing-title|document-first-documents-title|document-first-account-title" &&
    signupStepScrollBehavior(false) === "auto" &&
    signupStepScrollBehavior(true) === "auto",
  "central_step_scroll_or_focus_transition_failed",
);

const summarySource = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
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
const shellSource = await source(
  "app/src/features/signup/SignupPageShell.tsx",
);
const flowSource = await source(
  "app/src/features/signup/DocumentFirstSignupFlow.tsx",
);
const transitionSource = await source(
  "app/src/features/signup/signupStepTransition.ts",
);
const exportSource = await source(
  "app/src/features/signup/signing/browserHtmlLegalBundleV1.ts",
);
const customerSources = [
  summarySource,
  mandateSource,
  legalSource,
  signerSource,
];
assert(
  customerSources.reduce(
        (count, value) =>
          count + (value.match(/signing-kiss-section/g) || []).length,
        0,
      ) === 4 &&
    summarySource.includes("Samenvatting") &&
    mandateSource.includes("Machtiging") &&
    legalSource.includes("Voorwaarden en privacy") &&
    signerSource.includes("Ondertekening"),
  "step_three_does_not_have_exactly_four_major_sections",
);
assert(
  summarySource.includes(
    "Ik bevestig dat de bovenstaande gegevens juist en volledig zijn.",
  ) &&
    legalSource.includes("Documenten bekijken") &&
    legalSource.includes("Download documenten") &&
    legalSource.includes("Privacyverklaring") &&
    legalSource.includes("Algemene voorwaarden") &&
    legalSource.includes("Vergoedingsvoorwaarden") &&
    legalSource.includes("Ik heb de privacyverklaring gelezen") &&
    signerSource.includes("Volledige naam") &&
    signerSource.includes("Functie/rol") &&
    signerSource.includes("namens ${") &&
    signerSource.includes("de hierboven genoemde persoon"),
  "required_customer_copy_missing",
);
assert(
  (summarySource.match(/type="checkbox"/g) || []).length === 1 &&
    (legalSource.match(/type="checkbox"/g) || []).length === 1 &&
    summarySource.includes("Ondertekenen en indienen") &&
    summarySource.includes("Ondertekening bevestigen") &&
    summarySource.includes("Eenmalige code") &&
    customerSources.every((value) =>
      !value.includes("OTP") &&
      !value.includes("<canvas") &&
      !/print|scan/i.test(value) &&
      !value.includes("style={{") &&
      !/\.css["']/.test(value)
    ),
  "signing_control_or_forbidden_ui_implementation_invalid",
);
assert(
  customerSources.every((value) =>
    !value.includes("Signing-readiness") &&
    !value.includes("status-pill") &&
    !value.includes("Actie wordt beschikbaar") &&
    !value.includes("Handtekeningmethode") &&
    !value.includes("serverfinalisatie") &&
    !value.includes("Canonical adres") &&
    !value.includes("Electricity-EAN") &&
    !value.includes('href="/privacy"') &&
    !value.includes('href="/voorwaarden"')
  ),
  "technical_or_route_based_legal_ui_is_still_visible",
);
assert(
  shellSource.includes("transitionSignupStep") &&
    shellSource.includes("onStepChange={changeActiveStep}") &&
    (shellSource.match(/onStepChange=\{changeActiveStep\}/g) || []).length ===
      2 &&
    flowSource.includes('id="signup-flow-top"'),
  "step_controls_do_not_share_the_central_transition",
);
assert(
  transitionSource.includes('getElementById("signup-flow-top")') &&
    transitionSource.includes('return "auto"') &&
    !transitionSource.includes("dispatch") &&
    !transitionSource.includes("replace_draft") &&
    !exportSource.includes("window.location") &&
    !exportSource.includes("navigate(") &&
    exportSource.includes(
      'window.open(url, "_blank", "noopener,noreferrer")',
    ) &&
    exportSource.includes("revokeObjectURL"),
  "transition_reset_or_router_based_export_detected",
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

console.log("signup-signing-kiss-09a1-proof-ok");
