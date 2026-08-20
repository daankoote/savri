import { renderToStaticMarkup } from "react-dom/server";
import { ActivePrivateDashboard } from "./ActivePrivateDashboard.tsx";
import {
  CUSTOMER_CORRECTION_LEGAL_BUNDLE,
  type CustomerCorrectionHandoffModel,
  type CustomerCorrectionHandoffResult,
  decodeCustomerCorrectionHandoffResponse,
  fetchCustomerCorrectionHandoff,
  finalizeCustomerCorrection,
  requestCustomerCorrectionChallenge,
} from "./customerCorrectionHandoffClient.ts";
import {
  buildCustomerCorrectionWorkspace,
  createCustomerCorrectionDraft,
  customerCorrectionChallengeBindingKey,
  normalizeCustomerCorrectionValue,
} from "./customerCorrectionWorkspace.ts";
import {
  clearCustomerCorrectionHandoffCache,
  type CustomerCorrectionHandoffState,
  loadCustomerCorrectionHandoffOnce,
} from "./useCustomerCorrectionHandoff.ts";
import {
  customerCorrectionReasonLabel,
} from "./CustomerCorrectionHandoffPanel.tsx";
import { SignerPanel } from "../signup/signing/SignerPanel.tsx";
import type { DashboardReadState } from "./useDashboardRead.ts";
import type {
  DashboardDossierSummary,
  DashboardReadModel,
} from "./dashboardTypes.ts";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const CASE_A = "CASE-7E4CC75CD19F";
const CASE_B = "CASE-111111111111";
const DOSSIER_A = "11111111-1111-4111-8111-111111111111";
const DOSSIER_B = "22222222-2222-4222-8222-222222222222";
const root = new URL("../../../../", import.meta.url);

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, root));
}

function item(
  correctionReason:
    | "MISSING_INFORMATION"
    | "INCORRECT_INFORMATION"
    | "INCONSISTENT_INFORMATION"
    | "OTHER" = "INCORRECT_INFORMATION",
  itemNumber = 1,
) {
  const serverLabels = {
    MISSING_INFORMATION: "Gegeven ontbreekt",
    INCORRECT_INFORMATION: "Gegeven onjuist",
    INCONSISTENT_INFORMATION: "Gegevens inconsistent",
    OTHER: "Aanpassing nodig",
  } as const;
  return {
    itemRef: `CCI-${itemNumber.toString(16).padStart(32, "0").toUpperCase()}`,
    documentLabel: "Energiedocument",
    factLabel: "Energieleverancier",
    ...(correctionReason === "MISSING_INFORMATION"
      ? {}
      : { currentValue: "Pilot Energie Nederland B.V." }),
    correctionReason,
    correctionReasonLabel: serverLabels[correctionReason],
    correctionInstruction: "foute invoer",
    responseRequirement: correctionReason === "MISSING_INFORMATION"
      ? "MISSING_VALUE"
      : "VALUE_CORRECTION",
  };
}

function body(caseRef = CASE_A, items: unknown[] = [item()]) {
  return {
    schemaVersion: "customer-correction-handoff-v3",
    caseRef,
    handoff: {
      handoffRef: "CRH-0123456789ABCDEF",
      publishedAt: "2026-08-19T14:54:34.880Z",
      signerAuthority: {
        status: "available",
        expectedSignerDisplayName: "Lokaal Piloot",
      },
      items,
    },
  };
}

function handoffModel(caseRef = CASE_A): CustomerCorrectionHandoffModel {
  const decoded = decodeCustomerCorrectionHandoffResponse(
    body(caseRef),
    caseRef,
  );
  assert(decoded.ok, "proof_handoff_invalid");
  return decoded.model;
}

function dossier(
  dossierId = DOSSIER_A,
  caseRef = CASE_A,
): DashboardDossierSummary {
  return {
    dossier_id: dossierId,
    dossier_number: null,
    account_type: "particulier",
    status: "submitted_for_review",
    document_changes_allowed: false,
    case_id: dossierId,
    case_reference: caseRef,
  };
}

function dashboardModel(): DashboardReadModel {
  const selected = dossier();
  return {
    request_id: "customer02-proof",
    dossiers: [selected],
    selected_dossier: selected,
    locations: [],
    chargers: [],
    document_slots: [],
    legal_acceptances: [],
  };
}

const dashboardRead: DashboardReadState = {
  status: "ready",
  model: dashboardModel(),
  error: null,
  retry: () => undefined,
  refreshSelectedDossier: async () => true,
};

function renderDashboard(correctionHandoff: CustomerCorrectionHandoffState) {
  return renderToStaticMarkup(
    <ActivePrivateDashboard
      accessToken="proof-token"
      correctionHandoff={correctionHandoff}
      dashboardRead={dashboardRead}
      dossierOptions={[dossier()]}
      onRefreshSelectedDossier={async () => true}
      onSelectDossier={() => undefined}
      onStartNewApplication={() => undefined}
      selectedDossierId={DOSSIER_A}
    />,
  );
}

function readyState(
  model = handoffModel(),
  notice: string | null = null,
): CustomerCorrectionHandoffState {
  return {
    status: "ready",
    model,
    error: null,
    notice,
    retry: () => undefined,
    retryStale: () => undefined,
  };
}

const decoded = decodeCustomerCorrectionHandoffResponse(body(), CASE_A);
assert(
  decoded.ok && decoded.model.handoff?.items.length === 1 &&
    decoded.model.handoff.items[0].correctionReason ===
      "INCORRECT_INFORMATION" &&
    decoded.model.handoff.items[0].responseRequirement ===
      "VALUE_CORRECTION" &&
    decoded.model.handoff.items[0].currentValue ===
      "Pilot Energie Nederland B.V.",
  "Q01_customer_safe_response_not_decoded",
);
const noHandoff = decodeCustomerCorrectionHandoffResponse({
  schemaVersion: "customer-correction-handoff-v3",
  caseRef: CASE_A,
  handoff: null,
}, CASE_A);
assert(
  noHandoff.ok && noHandoff.model.handoff === null,
  "Q02_no_handoff_not_decoded",
);
assert(
  !decodeCustomerCorrectionHandoffResponse({
    ...body(),
    subjectRef: "internal",
  }, CASE_A).ok &&
    !decodeCustomerCorrectionHandoffResponse(body(CASE_B), CASE_A).ok &&
    !decodeCustomerCorrectionHandoffResponse(
      body(CASE_A, [{
        ...item(),
        evidenceVersionRef: "internal",
      }]),
      CASE_A,
    ).ok &&
    !decodeCustomerCorrectionHandoffResponse(
      body(CASE_A, [{
        ...item(),
        correctionReason: "UNCLASSIFIED",
      }]),
      CASE_A,
    ).ok,
  "Q03_unknown_or_internal_response_not_rejected",
);

let requestCount = 0;
const fetched = await fetchCustomerCorrectionHandoff({
  accessToken: "proof-token",
  caseRef: CASE_A,
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async (input, init) => {
    requestCount += 1;
    const headers = new Headers(init?.headers);
    assert(
      String(input) ===
          `https://local.invalid/functions/v1/api-app-customer-correction-handoff?caseRef=${CASE_A}` &&
        init?.method === "GET" && init.body === undefined &&
        headers.get("Authorization") === "Bearer proof-token" &&
        headers.get("apikey") === "proof-anon",
      "Q04_authenticated_exact_case_get_invalid",
    );
    return new Response(JSON.stringify(body()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
assert(
  fetched.ok && requestCount === 1,
  "Q04_authenticated_exact_case_get_invalid",
);

clearCustomerCorrectionHandoffCache();
let cachedFetchCount = 0;
const fetcher = async (
  { caseRef }: { accessToken: string; caseRef: string },
): Promise<CustomerCorrectionHandoffResult> => {
  cachedFetchCount += 1;
  await Promise.resolve();
  return { ok: true, model: handoffModel(caseRef) };
};
const [firstLoad, strictModeLoad] = await Promise.all([
  loadCustomerCorrectionHandoffOnce({
    accessToken: "proof-token",
    cacheScope: "principal-a",
    caseRef: CASE_A,
    fetcher,
  }),
  loadCustomerCorrectionHandoffOnce({
    accessToken: "proof-token",
    cacheScope: "principal-a",
    caseRef: CASE_A,
    fetcher,
  }),
]);
await loadCustomerCorrectionHandoffOnce({
  accessToken: "proof-token",
  cacheScope: "principal-a",
  caseRef: CASE_A,
  fetcher,
});
assert(
  cachedFetchCount === 1 && firstLoad === strictModeLoad,
  "Q05_strictmode_duplicate_get_not_deduplicated",
);
await loadCustomerCorrectionHandoffOnce({
  accessToken: "proof-token",
  cacheScope: "principal-a",
  caseRef: CASE_B,
  fetcher,
});
assert(
  Number(cachedFetchCount) === 2,
  "Q06_selected_case_replacement_get_invalid",
);

const denied = await fetchCustomerCorrectionHandoff({
  accessToken: "proof-token",
  caseRef: CASE_A,
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        ok: false,
        code: "customer_case_access_denied",
        error: "Dossier niet gevonden.",
      }),
      { status: 404 },
    ),
});
assert(
  !denied.ok && denied.error.code === "inaccessible" &&
    !JSON.stringify(denied).includes("customer_case_access_denied"),
  "Q07_access_denial_not_safe",
);

const noHandoffHtml = renderDashboard(readyState(
  noHandoff.ok ? noHandoff.model : handoffModel(),
));
assert(
  noHandoffHtml.includes("In behandeling") &&
    !noHandoffHtml.includes("Aanpassing nodig"),
  "Q08_no_handoff_changed_existing_status",
);
const publishedHtml = renderDashboard(readyState());
assert(
  publishedHtml.includes("Aanpassing nodig") &&
    publishedHtml.includes("Energiedocument") &&
    publishedHtml.includes("Energieleverancier") &&
    publishedHtml.includes("Gegeven onjuist") &&
    publishedHtml.includes("foute invoer") &&
    !publishedHtml.includes("Dit moet worden ondertekend door") &&
    !publishedHtml.includes("Lokaal Piloot") &&
    !publishedHtml.includes("WAITING_CUSTOMER"),
  "Q09_published_handoff_not_rendered_safely",
);

const multiple = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1),
    item("INCONSISTENT_INFORMATION", 2),
    item("OTHER", 3),
  ]),
  CASE_A,
);
assert(multiple.ok, "multiple_items_invalid");
const multipleHtml = renderDashboard(readyState(multiple.model));
assert(
  (multipleHtml.match(/class="portal-evidence-card"/g) || []).length === 3 &&
    multipleHtml.indexOf("Gegeven ontbreekt") <
      multipleHtml.indexOf("Gegevens komen niet overeen") &&
    multipleHtml.indexOf("Gegevens komen niet overeen") <
      multipleHtml.indexOf("Anders") &&
    customerCorrectionReasonLabel("INCORRECT_INFORMATION") ===
      "Gegeven onjuist",
  "Q10_multiple_items_or_reason_mapping_invalid",
);

const errorHtml = renderDashboard({
  status: "error",
  model: null,
  error: {
    code: "inaccessible",
    message: "De dossieractie is niet beschikbaar voor dit account.",
  },
  notice: null,
  retry: () => undefined,
  retryStale: () => undefined,
});
assert(
  errorHtml.includes("Dossieractie niet beschikbaar") &&
    errorHtml.includes("Opnieuw proberen") &&
    errorHtml.includes("In behandeling") &&
    !errorHtml.includes("Energieleverancier") &&
    !errorHtml.includes("Aanpassing nodig"),
  "Q11_error_not_isolated_or_safe",
);

const [
  clientSource,
  hookSource,
  panelSource,
  workspaceSource,
  dashboardSource,
  shellSource,
  signerPanelSource,
  correctionSubmissionSource,
  cssSource,
  appGlobalCssSource,
  legacyCssSource,
  sharedFormStateCssSource,
] = await Promise.all([
  source("app/src/features/dashboard/customerCorrectionHandoffClient.ts"),
  source("app/src/features/dashboard/useCustomerCorrectionHandoff.ts"),
  source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
  source("app/src/features/dashboard/customerCorrectionWorkspace.ts"),
  source("app/src/features/dashboard/ActivePrivateDashboard.tsx"),
  source("app/src/features/dashboard/DashboardPageShell.tsx"),
  source("app/src/features/signup/signing/SignerPanel.tsx"),
  source("supabase/functions/_shared/app_customer_correction_submission.ts"),
  source("app/src/styles/components.css"),
  source("app/src/styles/global.css"),
  source("assets/css/style.css"),
  source("assets/css/form-states.css"),
]);
assert(
  clientSource.includes("api-app-customer-correction-handoff?caseRef=") &&
    clientSource.includes('method: "GET"') &&
    !/(email|customerId|customer_id)/.test(clientSource) &&
    shellSource.includes("selectedCaseRef") &&
    shellSource.includes("effectiveDossierId") &&
    hookSource.includes("requestKeyRef.current !== requestKey") &&
    hookSource.includes("customerCorrectionHandoffSafeError(code)") &&
    !hookSource.includes("error.message") &&
    !hookSource.includes("setInterval") && !hookSource.includes("setTimeout"),
  "Q12_selected_case_authority_or_stale_guard_invalid",
);
assert(
  !panelSource.includes("dangerouslySetInnerHTML") &&
    !/(subjectRef|workforce|reviewer|manifest|evidenceVersionRef|fraud|security)/i
      .test(panelSource) &&
    !publishedHtml.includes("CCI-") &&
    !dashboardSource.includes("style={{") && !panelSource.includes("style={{"),
  "Q13_internal_metadata_mutation_control_or_inline_css_present",
);

const singleItem = handoffModel().handoff?.items[0];
assert(singleItem !== undefined, "Q14_single_item_missing");
const singleEmpty = buildCustomerCorrectionWorkspace(
  [singleItem],
  createCustomerCorrectionDraft([singleItem]),
);
const singleSame = buildCustomerCorrectionWorkspace([singleItem], {
  [singleItem.itemRef]: "  Pilot   Energie Nederland B.V.  ",
});
const singleReady = buildCustomerCorrectionWorkspace([singleItem], {
  [singleItem.itemRef]: "  Pilot   Energie Correct B.V.  ",
});
assert(
  !singleEmpty.ready && !singleSame.ready &&
    singleSame.items[0].sameAsCurrentValue && singleReady.ready &&
    singleReady.responses.length === 1 &&
    singleReady.responses[0].correctedValue === "Pilot Energie Correct B.V." &&
    normalizeCustomerCorrectionValue("  a   b ") === "a b",
  "Q14_value_correction_readiness_or_normalization_invalid",
);

const missingDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [item("MISSING_INFORMATION", 1)]),
  CASE_A,
);
assert(missingDecoded.ok, "missing_invalid");
const missingHandoff = missingDecoded.model.handoff;
assert(missingHandoff !== null, "missing_handoff_invalid");
const missingHtml = renderDashboard(readyState(missingDecoded.model));
const missingItem = missingHandoff.items[0];
const missingReady = buildCustomerCorrectionWorkspace([missingItem], {
  [missingItem.itemRef]: "Nieuwe waarde",
});
assert(
  missingReady.ready && missingReady.responses.length === 1 &&
    !missingHtml.includes("Huidige waarde") &&
    missingHtml.includes("Nieuwe waarde"),
  "Q15_missing_value_fabricated_current_or_not_editable",
);

const threeDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1),
    item("OTHER", 2),
    item("OTHER", 3),
  ]),
  CASE_A,
);
assert(threeDecoded.ok, "three_invalid");
const threeHandoff = threeDecoded.model.handoff;
assert(threeHandoff !== null, "three_handoff_invalid");
const threeDraft = Object.fromEntries(
  threeHandoff.items.map((entry, index) => [
    entry.itemRef,
    `Nieuwe waarde ${index + 1}`,
  ]),
);
const threeReady = buildCustomerCorrectionWorkspace(
  threeHandoff.items,
  threeDraft,
);
assert(
  threeReady.ready && threeReady.responses.length === 3 &&
    (renderDashboard(readyState(threeDecoded.model)).match(/<input/g) || [])
        .length === 3,
  "Q16_three_fact_single_workspace_invalid",
);

const crossDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1),
    {
      ...item("MISSING_INFORMATION", 2),
      documentLabel: "Installatiefactuur",
      factLabel: "Serienummer",
    },
  ]),
  CASE_A,
);
assert(crossDecoded.ok, "cross_invalid");
assert(crossDecoded.model.handoff !== null, "cross_handoff_invalid");
const crossHtml = renderDashboard(readyState(crossDecoded.model));
assert(
  crossHtml.includes("Energiedocument") &&
    crossHtml.includes("Installatiefactuur") &&
    (crossHtml.match(/Wijzigingen indienen/g) || []).length === 1,
  "Q17_cross_document_single_action_invalid",
);

const mixedDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1),
    {
      ...item("OTHER", 2),
      responseRequirement: "DOCUMENT_REPLACEMENT",
    },
  ]),
  CASE_A,
);
assert(mixedDecoded.ok, "mixed_invalid");
const mixedHandoff = mixedDecoded.model.handoff;
assert(mixedHandoff !== null, "mixed_handoff_invalid");
const mixedWorkspace = buildCustomerCorrectionWorkspace(
  mixedHandoff.items,
  {
    [mixedHandoff.items[0].itemRef]: "Nieuwe waarde",
  },
);
const mixedHtml = renderDashboard(readyState(mixedDecoded.model));
assert(
  mixedWorkspace.hasUnsupportedAction && !mixedWorkspace.ready &&
    mixedHtml.includes(
      "Deze aanpassing kan nog niet online worden ingediend.",
    ) &&
    mixedHtml.includes("Wijzigingen indienen") &&
    !mixedHtml.includes('type="file"') && !mixedHtml.includes("Upload"),
  "Q18_mixed_document_action_not_fail_closed",
);

const allItemsDecoded = decodeCustomerCorrectionHandoffResponse(
  body(
    CASE_A,
    Array.from({ length: 8 }, (_, index) => ({
      ...item(index % 2 ? "MISSING_INFORMATION" : "OTHER", index + 1),
      documentLabel: index < 4 ? "Energiedocument" : "Installatiefactuur",
      factLabel: `Gegeven ${index + 1}`,
    })),
  ),
  CASE_A,
);
assert(allItemsDecoded.ok, "all_invalid");
const allItemsHandoff = allItemsDecoded.model.handoff;
assert(allItemsHandoff !== null, "all_handoff_invalid");
const allDraft = Object.fromEntries(
  allItemsHandoff.items.map((entry, index) => [
    entry.itemRef,
    `Correctie ${index + 1}`,
  ]),
);
assert(
  buildCustomerCorrectionWorkspace(
    allItemsHandoff.items,
    allDraft,
  ).responses.length === 8,
  "Q19_all_items_not_included",
);

const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const challengeReference = "22222222-2222-4222-8222-222222222222";
let challengeCalls = 0;
const challengeResult = await requestCustomerCorrectionChallenge({
  accessToken: "proof-token",
  caseRef: CASE_A,
  idempotencyKey,
  responses: singleReady.responses,
  typedFullName: "Lokaal Piloot",
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async (input, init) => {
    challengeCalls += 1;
    const headers = new Headers(init?.headers);
    const requestBody = JSON.parse(String(init?.body));
    assert(
      String(input).endsWith("api-app-customer-correction-signing-challenge") &&
        init?.method === "POST" &&
        headers.get("Authorization") === "Bearer proof-token" &&
        headers.get("Idempotency-Key") === idempotencyKey &&
        Object.keys(requestBody).sort().join("|") ===
          "caseRef|responses|typedFullName" &&
        requestBody.typedFullName === "Lokaal Piloot" &&
        Object.keys(requestBody.responses[0]).sort().join("|") ===
          "correctedValue|itemRef",
      "Q20_challenge_request_authority_invalid",
    );
    return new Response(
      JSON.stringify({
        ok: true,
        challenge_reference: challengeReference,
        expires_at: "2026-08-20T12:10:00.000Z",
        item_count: 1,
        delivery_target_masked: "p***@example.invalid",
        legal_bundle: CUSTOMER_CORRECTION_LEGAL_BUNDLE,
      }),
      { status: 201 },
    );
  },
});
assert(
  challengeResult.ok && challengeCalls === 1 &&
    challengeResult.value.legalBundle.bundleVersion ===
      "customer-correction-confirmation-nl-v1",
  "Q20_challenge_or_legal_bundle_invalid",
);

let finalizeCalls = 0;
const finalizeResult = await finalizeCustomerCorrection({
  accessToken: "proof-token",
  caseRef: CASE_A,
  challengeReference,
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
  otp: "123456",
  typedFullName: "Lokaal Piloot",
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async (_input, init) => {
    finalizeCalls += 1;
    const requestBody = JSON.parse(String(init?.body));
    assert(
      Object.keys(requestBody).sort().join("|") ===
          "caseRef|challengeReference|otp|typedFullName" &&
        !JSON.stringify(requestBody).match(
          /customerId|authUuid|carry|manifest|subjectRef|itemIndex/,
        ),
      "Q21_finalize_request_authority_invalid",
    );
    return new Response(
      JSON.stringify({
        ok: true,
        status: 201,
        code: "finalized",
        submission_ref: "CRS-0123456789ABCDEF",
      }),
      { status: 201 },
    );
  },
});
assert(
  finalizeResult.ok && finalizeCalls === 1,
  "Q21_finalize_request_invalid",
);

const staleResult = await requestCustomerCorrectionChallenge({
  accessToken: "proof-token",
  caseRef: CASE_A,
  idempotencyKey,
  responses: singleReady.responses,
  typedFullName: "Lokaal Piloot",
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        ok: false,
        code: "stale_correction_context",
        error: "De correctieopdracht is gewijzigd.",
      }),
      { status: 409 },
    ),
});
const invalidOtpResult = await finalizeCustomerCorrection({
  accessToken: "proof-token",
  caseRef: CASE_A,
  challengeReference,
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
  otp: "000000",
  typedFullName: "Lokaal Piloot",
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        ok: false,
        code: "invalid_signing_code",
        error: "Controleer de ondertekening.",
      }),
      { status: 400 },
    ),
});
assert(
  !staleResult.ok && staleResult.error.code === "stale_handoff" &&
    !invalidOtpResult.ok && invalidOtpResult.error.code === "invalid_otp",
  "Q22_safe_error_semantics_invalid",
);

assert(
  panelSource.includes("challengeRequestInFlightRef.current") &&
    panelSource.includes("finalizeRequestInFlightRef.current") &&
    panelSource.includes("currentBindingRef.current !== issuedBindingKey") &&
    panelSource.includes("invalidateChallenge()") &&
    panelSource.includes("state.retryStale()") &&
    panelSource.includes("state.retry();") &&
    !panelSource.includes("onRefreshSelectedDossier") &&
    !panelSource.match(/localStorage|sessionStorage|indexedDB/i) &&
    !workspaceSource.match(/localStorage|sessionStorage|indexedDB/i),
  "Q23_single_flight_binding_refresh_or_ephemeral_draft_invalid",
);

assert(
  panelSource.includes("<SignerPanel") &&
    panelSource.includes("CUSTOMER_CORRECTION_LEGAL_BUNDLE.statement") &&
    signerPanelSource.includes("intentStatement") &&
    signerPanelSource.includes('fullNameAutoComplete = "name"') &&
    panelSource.includes('fullNameAutoComplete="off"') &&
    panelSource.includes('fullName: ""') &&
    panelSource.includes("expectedSignerDisplayName") &&
    !panelSource.includes(
      "Typ de bovenstaande volledige naam om te ondertekenen.",
    ) &&
    !panelSource.includes(
      "De naam moet overeenkomen met de verwachte ondertekenaar.",
    ) &&
    panelSource.includes("fullNameInvalid={fullNameInvalid}") &&
    panelSource.includes("disabled={!signingReady") &&
    !panelSource.includes("fullName: expectedSignerName") &&
    correctionSubmissionSource.includes(
      'bundleVersion: "customer-correction-confirmation-nl-v1"',
    ) &&
    correctionSubmissionSource.includes(
      CUSTOMER_CORRECTION_LEGAL_BUNDLE.statement,
    ) &&
    customerCorrectionChallengeBindingKey(
        singleReady.responses,
        "Proof Customer",
        true,
      ) !==
      customerCorrectionChallengeBindingKey(
        singleReady.responses,
        "Changed Customer",
        true,
      ),
  "Q24_typed_name_otp_or_versioned_intent_not_reused",
);

const signerInput = {
  accountType: "particulier" as const,
  fullName: "",
  role: "",
  intentAccepted: false,
};
function renderCorrectionSigner(fullName: string, fullNameInvalid: boolean) {
  return renderToStaticMarkup(
    <SignerPanel
      expectedSignerDisplayName="Lokaal Piloot"
      fullNameAutoComplete="off"
      fullNameInvalid={fullNameInvalid}
      onChange={() => undefined}
      organizationName=""
      sectionId="customer-correction-signer-proof"
      showRole={false}
      value={{ ...signerInput, fullName }}
    />,
  );
}
const emptySignerHtml = renderCorrectionSigner("", false);
const wrongSignerHtml = renderCorrectionSigner("Andere Naam", true);
const correctSignerHtml = renderCorrectionSigner("Lokaal Piloot", false);
assert(
  emptySignerHtml.indexOf("Ondertekening") <
      emptySignerHtml.indexOf("Dit moet worden ondertekend door") &&
    emptySignerHtml.indexOf("Dit moet worden ondertekend door") <
      emptySignerHtml.indexOf("Volledige naam") &&
    !emptySignerHtml.includes('aria-invalid="true"') &&
    !emptySignerHtml.includes('class="input-error"') &&
    wrongSignerHtml.includes('aria-invalid="true"') &&
    wrongSignerHtml.includes(
      'aria-describedby="customer-correction-signer-proof-full-name-error"',
    ) &&
    wrongSignerHtml.includes('class="input-error"') &&
    wrongSignerHtml.includes('class="sr-only"') &&
    !wrongSignerHtml.includes('class="field-message"') &&
    !correctSignerHtml.includes('aria-invalid="true"') &&
    !correctSignerHtml.includes('class="input-error"') &&
    appGlobalCssSource.includes(
      '@import "../../../assets/css/form-states.css";',
    ) &&
    legacyCssSource.includes('@import "./form-states.css";') &&
    !cssSource.includes(".input-error {") &&
    !legacyCssSource.includes(".input-error {") &&
    sharedFormStateCssSource.match(/\.input-error\s*\{/g)?.length === 1 &&
    sharedFormStateCssSource.includes(
      "border-color: #ff4d4f !important;",
    ) &&
    sharedFormStateCssSource.includes(".input-error:focus {") &&
    sharedFormStateCssSource.includes(
      "box-shadow: 0 0 0 3px rgba(255, 77, 79, 0.20);",
    ),
  "Q25_signer_presentation_states_invalid",
);

const unavailable = decodeCustomerCorrectionHandoffResponse({
  ...body(),
  handoff: {
    ...body().handoff,
    signerAuthority: { status: "unavailable" },
  },
}, CASE_A);
assert(unavailable.ok, "unavailable_signer_authority_invalid");
const unavailableHtml = renderDashboard(readyState(unavailable.model));
assert(
  unavailableHtml.includes(
    "Ondertekenen is niet beschikbaar voor dit account.",
  ) && unavailableHtml.includes("disabled"),
  "Q26_business_authority_seam_not_fail_closed",
);

console.log("CUSTOMER_CORRECTION_HANDOFF_UI_Q01_Q26=PASS");
Deno.exit(0);
