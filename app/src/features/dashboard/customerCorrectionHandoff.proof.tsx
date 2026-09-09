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
  projectCustomerCorrectionParserFacts,
} from "./customerCorrectionWorkspace.ts";
import {
  createCustomerCorrectionReplacementUploadAttempt,
  uploadCustomerCorrectionReplacement,
} from "./customerCorrectionReplacementUpload.ts";
import {
  clearCustomerCorrectionHandoffCache,
  type CustomerCorrectionHandoffState,
  loadCustomerCorrectionHandoffOnce,
} from "./useCustomerCorrectionHandoff.ts";
import {
  createCustomerCorrectionReplacementUploadCardModel,
  customerCorrectionInteractionLocked,
  customerCorrectionReasonLabel,
  customerCorrectionRowStatusLabel,
  submitCustomerCorrectionFinalization,
} from "./CustomerCorrectionHandoffPanel.tsx";
import { DocumentEvidenceUploadCard } from "../documents/DocumentEvidenceUploadCard.tsx";
import { SignerPanel } from "../signup/signing/SignerPanel.tsx";
import type { DashboardReadState } from "./useDashboardRead.ts";
import type {
  DashboardDossierSummary,
  DashboardReadModel,
} from "./dashboardTypes.ts";
import type { DocumentFactKey } from "../../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function CustomerCorrectionReplacementTargetCard(
  props: Parameters<
    typeof createCustomerCorrectionReplacementUploadCardModel
  >[0],
) {
  return (
    <DocumentEvidenceUploadCard
      {...createCustomerCorrectionReplacementUploadCardModel(props)}
    />
  );
}

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const CASE_A = "CASE-7E4CC75CD19F";
const CASE_B = "CASE-111111111111";
const DOSSIER_A = "11111111-1111-4111-8111-111111111111";
const DOSSIER_B = "22222222-2222-4222-8222-222222222222";
const TARGET_ENERGY = `CRT-${"1".repeat(32)}`;
const TARGET_INVOICE = `CRT-${"2".repeat(32)}`;
const CANDIDATE_ENERGY = `CRC-${"3".repeat(32)}`;
const CANDIDATE_INVOICE = `CRC-${"4".repeat(32)}`;
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
  factKey: DocumentFactKey = "energySupplier",
) {
  const serverLabels = {
    MISSING_INFORMATION: "Gegeven ontbreekt",
    INCORRECT_INFORMATION: "Gegeven onjuist",
    INCONSISTENT_INFORMATION: "Gegevens inconsistent",
    OTHER: "Aanpassing nodig",
  } as const;
  return {
    itemRef: `CCI-${itemNumber.toString(16).padStart(32, "0").toUpperCase()}`,
    factKey,
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

function replacementTarget(
  replacementTargetRef = TARGET_ENERGY,
  documentLabel: "Energiedocument" | "Installatiefactuur" = "Energiedocument",
) {
  return {
    replacementTargetRef,
    documentLabel,
    acceptedMimeTypes: ["application/pdf"],
    maximumFileSize: 15 * 1024 * 1024,
  };
}

function documentItem(
  responseRequirement:
    | "DOCUMENT_REPLACEMENT"
    | "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  itemNumber: number,
  target = replacementTarget(),
  factKey: DocumentFactKey = "energySupplier",
) {
  return {
    ...item("OTHER", itemNumber, factKey),
    documentLabel: target.documentLabel,
    responseRequirement,
    replacementTarget: target,
  };
}

function body(
  caseRef = CASE_A,
  items: unknown[] = [item()],
  currentReplacementCandidates: unknown[] = [],
) {
  return {
    schemaVersion: "customer-correction-handoff-v5",
    caseRef,
    handoff: {
      currentReplacementCandidates,
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
  const locationId = "33333333-3333-4333-8333-333333333333";
  return {
    request_id: "customer02-proof",
    dossiers: [selected],
    selected_dossier: selected,
    locations: [{
      location_id: locationId,
      label: "Locatie 1",
      status: "confirmed",
      declared_address: "Dichtestraat 10, 1234AB Proefstad",
      address: {
        postcode: "1234AB",
        house_number: "10",
        suffix: null,
        street: "Dichtestraat",
        city: "Proefstad",
        country: "Nederland",
      },
    }],
    chargers: [{
      charger_id: "44444444-4444-4444-8444-444444444444",
      location_id: locationId,
      status: "confirmed",
      brand: "Dense Browser Merk",
      model: "Dense Browser Model",
      serial_number: "DENSESERIAL2026",
      mid_number: "123456789",
      mid_status: "confirmed",
      installation_year: 2026,
      backend_supplier: null,
      solar_export_status: "unknown",
    }],
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
      dossierOptions={[{ ...dossier(), portal_context: "customer" }]}
      onRefreshSelectedDossier={async () => true}
      onSelectDossier={() => undefined}
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
  schemaVersion: "customer-correction-handoff-v5",
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
    !noHandoffHtml.includes("Aanpassing nodig") &&
    noHandoffHtml.includes('aria-label="Dossier"') &&
    noHandoffHtml.includes('aria-label="Locaties"') &&
    noHandoffHtml.includes('aria-label="Actieve laadpalen"'),
  "Q08_no_handoff_changed_existing_status",
);
const publishedHtml = renderDashboard(readyState());
assert(
  publishedHtml.includes("Aanpassing nodig") &&
    publishedHtml.includes("Upload en controle") &&
    publishedHtml.includes("Locatie 1") &&
    publishedHtml.includes("Laadpaal 1") &&
  publishedHtml.includes("Energieleverancier") &&
    publishedHtml.includes("Reden: Gegeven onjuist") &&
    publishedHtml.includes("Toelichting: foute invoer") &&
    publishedHtml.includes('title="Bevestigen niet beschikbaar"') &&
    publishedHtml.includes('title="Corrigeren"') &&
    !publishedHtml.includes("Energieleverancier nieuwe waarde") &&
    publishedHtml.includes("Wacht op klant") &&
    !publishedHtml.includes('aria-label="Dossier"') &&
    !publishedHtml.includes('aria-label="Locaties"') &&
    !publishedHtml.includes('aria-label="Documenten"') &&
    !publishedHtml.includes('aria-label="Actieve laadpalen"') &&
    !publishedHtml.includes("Dit moet worden ondertekend door") &&
    !publishedHtml.includes("Lokaal Piloot") &&
    !publishedHtml.includes("WAITING_CUSTOMER"),
  "Q09_published_handoff_not_rendered_safely",
);

const multiple = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1, "partyName"),
    item("INCONSISTENT_INFORMATION", 2, "structuredAddress"),
    item("OTHER", 3, "energySupplier"),
  ]),
  CASE_A,
);
assert(multiple.ok, "multiple_items_invalid");
const multipleHtml = renderDashboard(readyState(multiple.model));
assert(
  (multipleHtml.match(/class="fact-table__row"/g) || []).length === 8 &&
    !multipleHtml.includes("portal-evidence-card") &&
    multipleHtml.includes("Reden: Gegeven ontbreekt") &&
    multipleHtml.includes("Reden: Gegevens komen niet overeen") &&
    multipleHtml.includes("Reden: Anders") &&
    (multipleHtml.match(/Toelichting: foute invoer/g) || []).length === 3 &&
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
  replacementUploadSource,
  uploadTransportSource,
  dashboardSource,
  shellSource,
  signerPanelSource,
  correctionSubmissionSource,
  cssSource,
  appGlobalCssSource,
  legacyCssSource,
  sharedFormStateCssSource,
  retentionToolSource,
  retentionWorkerSource,
  replacementFinalizationMigrationSource,
] = await Promise.all([
  source("app/src/features/dashboard/customerCorrectionHandoffClient.ts"),
  source("app/src/features/dashboard/useCustomerCorrectionHandoff.ts"),
  source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
  source("app/src/features/dashboard/customerCorrectionWorkspace.ts"),
  source(
    "app/src/features/dashboard/customerCorrectionReplacementUpload.ts",
  ),
  source("app/src/features/documents/documentUploadTransport.ts"),
  source("app/src/features/dashboard/ActivePrivateDashboard.tsx"),
  source("app/src/features/dashboard/DashboardPageShell.tsx"),
  source("app/src/features/signup/signing/SignerPanel.tsx"),
  source("supabase/functions/_shared/app_customer_correction_submission.ts"),
  source("app/src/styles/components.css"),
  source("app/src/styles/global.css"),
  source("assets/css/style.css"),
  source("assets/css/form-states.css"),
  source("scripts/tools/retention-storage-cleanup.mjs"),
  source("supabase/functions/retention-worker/index.ts"),
  source(
    "supabase/migrations/20260821100000_app_customer_correction_document_finalization.sql",
  ),
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
    "correctedValue" in singleReady.responses[0] &&
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
    missingHtml.includes("Info uit bron") &&
    missingHtml.includes('title="Bevestigen niet beschikbaar"') &&
    missingHtml.includes('title="Corrigeren"') &&
    !missingHtml.includes("Energieleverancier nieuwe waarde"),
  "Q15_missing_value_fabricated_current_or_not_editable",
);

const threeDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1, "partyName"),
    item("OTHER", 2, "structuredAddress"),
    item("OTHER", 3, "energySupplier"),
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
const threeHtml = renderDashboard(readyState(threeDecoded.model));
assert(
  threeReady.ready && threeReady.responses.length === 3 &&
    (threeHtml.match(/title="Bevestigen niet beschikbaar"/g) || []).length ===
      3 &&
    (threeHtml.match(/title="Corrigeren"/g) || []).length === 3 &&
    !threeHtml.includes("nieuwe waarde"),
  "Q16_three_fact_single_workspace_invalid",
);

const crossDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1),
    {
      ...item("MISSING_INFORMATION", 2),
      documentLabel: "Installatiefactuur",
      factKey: "serialNumber",
      factLabel: "Serienummer",
    },
  ]),
  CASE_A,
);
assert(crossDecoded.ok, "cross_invalid");
assert(crossDecoded.model.handoff !== null, "cross_handoff_invalid");
const crossHtml = renderDashboard(readyState(crossDecoded.model));
assert(
  crossHtml.includes("Locatie 1") &&
    crossHtml.includes("Laadpaal 1") &&
    crossHtml.includes("Energieleverancier · Energiedocument") &&
    crossHtml.includes("Serienummer · Installatiefactuur") &&
    (crossHtml.match(/Wijzigingen indienen/g) || []).length === 1,
  "Q17_cross_document_single_action_invalid",
);

const mixedDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    item("MISSING_INFORMATION", 1),
    documentItem("DOCUMENT_REPLACEMENT", 2),
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
  !mixedWorkspace.hasUnsupportedAction && !mixedWorkspace.ready &&
    mixedWorkspace.replacementTargets.length === 1 &&
    mixedHtml.includes("Wijzigingen indienen") &&
    mixedHtml.includes('type="file"') && mixedHtml.includes("PDF kiezen") &&
    !mixedHtml.includes(
      "Deze aanpassing kan nog niet online worden ingediend.",
    ),
  "Q18_mixed_document_action_not_rendered",
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
  factResolutions: [{
    itemRefs: [singleReady.responses[0].itemRef],
    resolutionType: "MANUAL",
    sources: [],
  }],
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
          "caseRef|factResolutions|responses|typedFullName" &&
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

let releaseSessionFinalize: (
  result: Readonly<{
    ok: true;
    value: Readonly<{ finalized: true }>;
  }>,
) => void = () => undefined;
let sessionFinalizeCalls = 0;
let sessionPendingTransitions = 0;
let sessionRefreshes = 0;
let releaseSessionRefresh: (refreshed: boolean) => void = () => undefined;
const sessionRuntime = {
  attempt: { current: null },
  submitting: { current: false },
  finalize: (_idempotencyKey: string) => {
    sessionFinalizeCalls += 1;
    return new Promise<Readonly<{
      ok: true;
      value: Readonly<{ finalized: true }>;
    }>>((resolve) => {
      releaseSessionFinalize = resolve;
    });
  },
  onPending: () => sessionPendingTransitions += 1,
  onFailure: () => undefined,
  onStale: () => undefined,
  onSuccessRefresh: () => {
    sessionRefreshes += 1;
    return new Promise<boolean>((resolve) => {
      releaseSessionRefresh = resolve;
    });
  },
};
const firstSessionFinalize = submitCustomerCorrectionFinalization(
  "challenge:responses",
  sessionRuntime,
);
await Promise.resolve();
const concurrentSessionFinalize = submitCustomerCorrectionFinalization(
  "challenge:responses",
  sessionRuntime,
);
assert(
  sessionFinalizeCalls === 1 && sessionPendingTransitions === 1 &&
    sessionRuntime.submitting.current,
  "Q42_concurrent_finalize_or_pending_lock_invalid",
);
releaseSessionFinalize({ ok: true, value: { finalized: true } });
await Promise.resolve();
await Promise.resolve();
const refreshConcurrentFinalize = submitCustomerCorrectionFinalization(
  "challenge:responses",
  sessionRuntime,
);
assert(
  sessionRefreshes === 1 && sessionRuntime.submitting.current &&
    customerCorrectionInteractionLocked(
      sessionRuntime.submitting.current,
      "finalizing",
    ) && sessionFinalizeCalls === 1,
  "Q42_refresh_pending_lock_invalid",
);
releaseSessionRefresh(true);
await Promise.all([
  firstSessionFinalize,
  concurrentSessionFinalize,
  refreshConcurrentFinalize,
]);
assert(
  sessionFinalizeCalls === 1 && sessionRefreshes === 1 &&
    !sessionRuntime.submitting.current,
  "Q42_success_refresh_count_invalid",
);

const retryKeys: string[] = [];
let retryFailures = 0;
let retryRefreshes = 0;
const retryRuntime = {
  attempt: { current: null },
  submitting: { current: false },
  finalize: async (idempotencyKey: string) => {
    retryKeys.push(idempotencyKey);
    return retryKeys.length === 1
      ? {
        ok: false as const,
        error: {
          code: "service_unavailable" as const,
          message: "Ondertekenen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
        },
      }
      : { ok: true as const, value: { finalized: true as const } };
  },
  onPending: () => undefined,
  onFailure: () => retryFailures += 1,
  onStale: () => undefined,
  onSuccessRefresh: async () => {
    retryRefreshes += 1;
    return true;
  },
};
await submitCustomerCorrectionFinalization("retry-binding", retryRuntime);
await submitCustomerCorrectionFinalization("retry-binding", retryRuntime);
assert(
  retryKeys.length === 2 && retryKeys[0] === retryKeys[1] &&
    retryFailures === 1 && retryRefreshes === 1,
  "Q42_ordinary_error_retry_or_idempotency_invalid",
);

let staleRecoveries = 0;
let staleRefreshes = 0;
const staleSessionRuntime = {
  attempt: { current: null },
  submitting: { current: false },
  finalize: async () => ({
    ok: false as const,
    error: {
      code: "stale_handoff" as const,
      message: "Aanpassing is gewijzigd. Controleer opnieuw.",
    },
  }),
  onPending: () => undefined,
  onFailure: () => undefined,
  onStale: () => staleRecoveries += 1,
  onSuccessRefresh: async () => {
    staleRefreshes += 1;
    return true;
  },
};
await submitCustomerCorrectionFinalization(
  "stale-binding",
  staleSessionRuntime,
);
assert(
  staleRecoveries === 1 && staleRefreshes === 0 &&
    staleSessionRuntime.attempt.current === null &&
    !staleSessionRuntime.submitting.current,
  "Q42_stale_refresh_handling_invalid",
);

const staleResult = await requestCustomerCorrectionChallenge({
  accessToken: "proof-token",
  caseRef: CASE_A,
  factResolutions: [{
    itemRefs: [singleReady.responses[0].itemRef],
    resolutionType: "MANUAL",
    sources: [],
  }],
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
    panelSource.includes("onRefreshSelectedDossier") &&
    panelSource.includes("finalizeAttemptRef") &&
    panelSource.includes("submitCustomerCorrectionFinalization") &&
    panelSource.includes("customerCorrectionInteractionLocked") &&
    panelSource.includes("inert={customerCorrectionInteractionLocked(") &&
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
        [],
        "Proof Customer",
        true,
      ) !==
      customerCorrectionChallengeBindingKey(
        singleReady.responses,
        [],
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

const missingTarget = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [{
    ...item("OTHER", 1),
    responseRequirement: "DOCUMENT_REPLACEMENT",
  }]),
  CASE_A,
);
const targetOnValue = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [{ ...item(), replacementTarget: replacementTarget() }]),
  CASE_A,
);
assert(
  !missingTarget.ok && !targetOnValue.ok,
  "Q27_replacement_target_contract_not_fail_closed",
);

const documentOnlyDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [documentItem("DOCUMENT_REPLACEMENT", 1)]),
  CASE_A,
);
assert(documentOnlyDecoded.ok, "Q28_document_only_decode_failed");
const documentOnlyHandoff = documentOnlyDecoded.model.handoff;
assert(documentOnlyHandoff !== null, "Q28_document_only_handoff_missing");
const documentOnlyHtml = renderDashboard(readyState(documentOnlyDecoded.model));
assert(
  documentOnlyHtml.includes("Installatiefactuur") === false &&
    documentOnlyHtml.includes("Energienota of energiecontract") &&
    documentOnlyHtml.includes("PDF kiezen") &&
    documentOnlyHtml.includes("Vastgelegd") &&
    !documentOnlyHtml.includes("Documentbewijs nog niet gereed") &&
    documentOnlyHtml.includes('accept="application/pdf,.pdf"') &&
    !documentOnlyHtml.includes("Nieuwe waarde") &&
    (documentOnlyHtml.match(/type="file"/g) || []).length === 1,
  "Q28_document_only_ui_or_fake_value_invalid",
);

const sameTargetDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    documentItem("VALUE_PLUS_DOCUMENT_REPLACEMENT", 1),
    documentItem("VALUE_PLUS_DOCUMENT_REPLACEMENT", 2),
    documentItem("VALUE_PLUS_DOCUMENT_REPLACEMENT", 3),
  ]),
  CASE_A,
);
assert(sameTargetDecoded.ok, "Q29_same_target_decode_failed");
const sameTargetHandoff = sameTargetDecoded.model.handoff;
assert(sameTargetHandoff !== null, "Q29_same_target_handoff_missing");
const sameTargetWorkspace = buildCustomerCorrectionWorkspace(
  sameTargetHandoff.items,
  Object.fromEntries(
    sameTargetHandoff.items.map((entry, index) => [
      entry.itemRef,
      `Correctie ${index + 1}`,
    ]),
  ),
  { [TARGET_ENERGY]: { candidateRef: CANDIDATE_ENERGY } },
);
const sameTargetHtml = renderDashboard(readyState(sameTargetDecoded.model));
assert(
  sameTargetWorkspace.ready &&
    sameTargetWorkspace.replacementTargets.length === 1 &&
    sameTargetWorkspace.replacementTargets[0].itemRefs.length === 3 &&
    sameTargetWorkspace.responses.every((response) =>
      "replacementCandidateRef" in response &&
      response.replacementCandidateRef === CANDIDATE_ENERGY
    ) && (sameTargetHtml.match(/type="file"/g) || []).length === 1,
  "Q29_three_items_not_grouped_by_server_target",
);

const crossTargetDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    documentItem("DOCUMENT_REPLACEMENT", 1),
    documentItem(
      "DOCUMENT_REPLACEMENT",
      2,
      replacementTarget(TARGET_INVOICE, "Installatiefactuur"),
    ),
  ]),
  CASE_A,
);
assert(crossTargetDecoded.ok, "Q30_cross_target_decode_failed");
const crossTargetHandoff = crossTargetDecoded.model.handoff;
assert(crossTargetHandoff !== null, "Q30_cross_target_handoff_missing");
const crossTargetPartial = buildCustomerCorrectionWorkspace(
  crossTargetHandoff.items,
  createCustomerCorrectionDraft(crossTargetHandoff.items),
  { [TARGET_ENERGY]: { candidateRef: CANDIDATE_ENERGY } },
);
const crossTargetReady = buildCustomerCorrectionWorkspace(
  crossTargetHandoff.items,
  createCustomerCorrectionDraft(crossTargetHandoff.items),
  {
    [TARGET_ENERGY]: { candidateRef: CANDIDATE_ENERGY },
    [TARGET_INVOICE]: { candidateRef: CANDIDATE_INVOICE },
  },
);
const crossTargetHtml = renderDashboard(readyState(crossTargetDecoded.model));
assert(
  crossTargetPartial.replacementTargets.length === 2 &&
    !crossTargetPartial.ready && crossTargetReady.ready &&
    (crossTargetHtml.match(/type="file"/g) || []).length === 2,
  "Q30_cross_document_targets_or_all_ready_gate_invalid",
);

const denseDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [
    ...([
      "partyName",
      "structuredAddress",
      "electricityEan",
      "energySupplier",
    ] as const).map((factKey, index) => ({
      ...documentItem(
        "VALUE_PLUS_DOCUMENT_REPLACEMENT",
        index + 1,
        replacementTarget(TARGET_ENERGY, "Energiedocument"),
        factKey,
      ),
      factLabel: `Energiegegeven ${index + 1}`,
    })),
    ...([
      "partyName",
      "structuredAddress",
      "chargerBrand",
      "chargerModel",
      "midNumber",
      "serialNumber",
    ] as const).map((factKey, index) => ({
      ...documentItem(
        "VALUE_PLUS_DOCUMENT_REPLACEMENT",
        index + 5,
        replacementTarget(TARGET_INVOICE, "Installatiefactuur"),
        factKey,
      ),
      factLabel: `Installatiegegeven ${index + 1}`,
    })),
  ], [{
    replacementTargetRef: TARGET_ENERGY,
    candidateRef: CANDIDATE_ENERGY,
    fileName: "energy-current.pdf",
    contentFingerprint: "a".repeat(64),
    parserObservation: {
      schemaVersion: "customer-correction-replacement-observation-v1",
      parserProfile: "energy_document_v1",
      outcome: "completed",
      observedFacts: [
        {
          factKey: "partyName",
          status: "observed",
          observedValue: "Parser Klant",
          extractionMethod: "semantic_contract_holder_block",
        },
        {
          factKey: "structuredAddress",
          status: "observed",
          observedValue: "Parserstraat 1",
          extractionMethod: "semantic_delivery_address_block",
        },
        {
          factKey: "electricityEan",
          status: "not_observed",
          observedValue: null,
          extractionMethod: null,
        },
        {
          factKey: "energySupplier",
          status: "observed",
          observedValue: "Parser Energie",
          extractionMethod: "semantic_energy_supplier_block",
        },
      ],
    },
  }, {
    replacementTargetRef: TARGET_INVOICE,
    candidateRef: CANDIDATE_INVOICE,
    fileName: "installation-current.pdf",
    contentFingerprint: "b".repeat(64),
    parserObservation: null,
  }]),
  CASE_A,
);
assert(denseDecoded.ok, "Q30_dense_decode_failed");
const denseHandoff = denseDecoded.model.handoff;
assert(denseHandoff !== null, "Q30_dense_handoff_missing");
const denseWorkspace = buildCustomerCorrectionWorkspace(
  denseHandoff.items,
  createCustomerCorrectionDraft(denseHandoff.items),
);
const denseHtml = renderDashboard(readyState(denseDecoded.model));
assert(
  denseWorkspace.items.length === 10 &&
    denseWorkspace.replacementTargets.length === 2 &&
    denseWorkspace.documentSections.length === 2 &&
    denseWorkspace.replacementTargets.find((target) =>
        target.replacementTargetRef === TARGET_ENERGY
      )?.itemRefs.length === 4 &&
    denseWorkspace.replacementTargets.find((target) =>
        target.replacementTargetRef === TARGET_INVOICE
      )?.itemRefs.length === 6,
  "Q30_dense_workspace_not_grouped_by_server_target",
);
assert(
  (denseHtml.match(/type="file"/g) || []).length === 2 &&
    !denseHtml.includes("Nieuw bewijsstuk") &&
    (denseHtml.match(/class="fact-review-section-item"/g) || []).length === 2 &&
    (denseHtml.match(/class="fact-table__row"/g) || []).length === 8,
  "Q30_dense_shared_layout_invalid",
);
assert(
  !denseHtml.includes("Bestaand document gereed") &&
    !denseHtml.includes("PDF, maximaal") &&
    !denseHtml.includes("portal-evidence-card"),
  "Q30_dense_compact_copy_invalid",
);
assert(
  denseHtml.includes("Wacht op klant") &&
    denseHtml.includes('title="Bevestigen"') &&
    !denseHtml.includes("status-pill status-pill-danger"),
  "Q30_dense_enval_status_invalid",
);
assert(
  denseHtml.includes("energy-current.pdf") &&
    denseHtml.includes("Parser Energie") &&
    denseHtml.includes("Verwijderen"),
  "Q30_dense_current_customer_source_projection_invalid",
);
const denseEnergyTarget = denseWorkspace.replacementTargets.find((target) =>
  target.replacementTargetRef === TARGET_ENERGY
);
assert(denseEnergyTarget !== undefined, "Q39_dense_energy_target_missing");
const denseEnergyProjection = projectCustomerCorrectionParserFacts(
  denseHandoff.items,
  denseEnergyTarget,
  [
    { factKey: "partyName", observedValue: "Parser Klant" },
    { factKey: "structuredAddress", observedValue: "Parserstraat 1" },
    { factKey: "electricityEan", observedValue: null },
    { factKey: "energySupplier", observedValue: "Parser Energie" },
  ],
);
const energySupplierItem = denseHandoff.items.find((entry) =>
  entry.replacementTarget?.replacementTargetRef === TARGET_ENERGY &&
  entry.factKey === "energySupplier"
);
const electricityEanItem = denseHandoff.items.find((entry) =>
  entry.replacementTarget?.replacementTargetRef === TARGET_ENERGY &&
  entry.factKey === "electricityEan"
);
assert(
  energySupplierItem !== undefined && electricityEanItem !== undefined &&
    denseEnergyProjection.observedValuesByItemRef[
        energySupplierItem.itemRef
      ] === "Parser Energie" &&
    denseEnergyProjection
        .observedValuesByItemRef[electricityEanItem.itemRef] ===
      null &&
    denseEnergyProjection.prefills.length === 3 &&
    denseEnergyProjection.prefills.some((prefill) =>
      prefill.itemRef === energySupplierItem.itemRef &&
      prefill.observedValue === "Parser Energie"
    ),
  "Q39_dense_parser_fact_scope_projection_invalid",
);

const lockedDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [documentItem("DOCUMENT_REPLACEMENT", 1)]),
  CASE_A,
);
assert(lockedDecoded.ok, "Q40_locked_decode_failed");
const lockedHtml = renderDashboard(readyState(lockedDecoded.model));
assert(
  lockedHtml.includes("Vastgelegd"),
  "Q40_locked_customer_state_missing",
);
assert(
  lockedHtml.includes("Nog te beoordelen"),
  "Q40_locked_enval_state_missing",
);
assert(
  !lockedHtml.includes('type="text"') &&
    lockedHtml.includes('type="file"'),
  "Q40_locked_fact_editability_invalid",
);

const valueDocumentDecoded = decodeCustomerCorrectionHandoffResponse(
  body(CASE_A, [documentItem("VALUE_PLUS_DOCUMENT_REPLACEMENT", 1)]),
  CASE_A,
);
assert(valueDocumentDecoded.ok, "Q31_value_document_decode_failed");
const valueDocumentHandoff = valueDocumentDecoded.model.handoff;
assert(valueDocumentHandoff !== null, "Q31_value_document_handoff_missing");
const valueDocumentItem = valueDocumentHandoff.items[0];
const valueDocumentDraft = {
  [valueDocumentItem.itemRef]: "Pilot Energie Correct B.V.",
};
const valueDocumentCandidates = {
  [TARGET_ENERGY]: { candidateRef: CANDIDATE_ENERGY },
};
const parserPrefillBlocked = buildCustomerCorrectionWorkspace(
  valueDocumentHandoff.items,
  valueDocumentDraft,
  valueDocumentCandidates,
  new Set([valueDocumentItem.itemRef]),
);
const valueDocumentReady = buildCustomerCorrectionWorkspace(
  valueDocumentHandoff.items,
  valueDocumentDraft,
  valueDocumentCandidates,
);
const manualOverrideDraft = {
  [valueDocumentItem.itemRef]: "Handmatige klantwaarde",
};
const manualOverrideReady = buildCustomerCorrectionWorkspace(
  valueDocumentHandoff.items,
  manualOverrideDraft,
  valueDocumentCandidates,
);
const parserVsManualProjection = projectCustomerCorrectionParserFacts(
  valueDocumentHandoff.items,
  valueDocumentReady.replacementTargets[0],
  [{ factKey: "energySupplier", observedValue: "Parserwaarde X" }],
);
const emptyEditable = buildCustomerCorrectionWorkspace(
  valueDocumentHandoff.items,
  createCustomerCorrectionDraft(valueDocumentHandoff.items),
  valueDocumentCandidates,
);
const documentOnlyReady = buildCustomerCorrectionWorkspace(
  lockedDecoded.ok && lockedDecoded.model.handoff
    ? lockedDecoded.model.handoff.items
    : [],
  {},
  { [TARGET_ENERGY]: { candidateRef: CANDIDATE_ENERGY } },
);
assert(
  !parserPrefillBlocked.ready && parserPrefillBlocked.responses.length === 0 &&
    valueDocumentReady.ready && valueDocumentReady.responses.length === 1 &&
    "correctedValue" in valueDocumentReady.responses[0] &&
    "replacementCandidateRef" in valueDocumentReady.responses[0] &&
    valueDocumentReady.responses[0].correctedValue ===
      "Pilot Energie Correct B.V." &&
    valueDocumentReady.responses[0].replacementCandidateRef ===
      CANDIDATE_ENERGY,
  "Q31_parser_prefill_not_explicit_or_combined_response_invalid",
);
assert(
  customerCorrectionRowStatusLabel(emptyEditable.items[0]) ===
      "Nog invullen" &&
    customerCorrectionRowStatusLabel(valueDocumentReady.items[0]) ===
      "Handmatig aangepast" &&
    customerCorrectionRowStatusLabel(manualOverrideReady.items[0]) ===
      "Handmatig aangepast" &&
    documentOnlyReady.ready &&
    customerCorrectionRowStatusLabel(documentOnlyReady.items[0]) ===
      "Handmatig aangepast" &&
    valueDocumentReady.ready && manualOverrideReady.ready &&
    "correctedValue" in valueDocumentReady.responses[0] &&
    "correctedValue" in manualOverrideReady.responses[0] &&
    valueDocumentReady.responses[0].correctedValue ===
      "Pilot Energie Correct B.V." &&
    manualOverrideReady.responses[0].correctedValue ===
      "Handmatige klantwaarde" &&
    parserVsManualProjection.observedValuesByItemRef[
        valueDocumentItem.itemRef
      ] === "Parserwaarde X" &&
    parserVsManualProjection.observedValuesByItemRef[
        valueDocumentItem.itemRef
      ] !== manualOverrideReady.responses[0].correctedValue,
  "Q41_correction_status_or_submission_readiness_semantics_invalid",
);

const proofFile = new File(
  [new TextEncoder().encode("%PDF-1.4 proof")],
  "correctie.pdf",
  { type: "application/pdf" },
);
const proofTarget = valueDocumentReady.replacementTargets[0];
const proofAttempt = createCustomerCorrectionReplacementUploadAttempt();
const uploadStages: string[] = [];
const uploadCalls: string[] = [];
const uploadResult = await uploadCustomerCorrectionReplacement({
  accessToken: "proof-token",
  caseRef: CASE_A,
  target: proofTarget,
  file: proofFile,
  attempt: proofAttempt,
  onStage: (stage) => uploadStages.push(stage),
}, {
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async (input, init) => {
    const url = String(input);
    uploadCalls.push(`${init?.method}:${url}`);
    const headers = new Headers(init?.headers);
    assert(
      headers.get("Authorization") === "Bearer proof-token" &&
        headers.get("apikey") === "proof-anon",
      "Q32_private_upload_auth_missing",
    );
    if (url.endsWith("api-app-customer-correction-upload-url")) {
      const requestBody = JSON.parse(String(init?.body));
      assert(
        Object.keys(requestBody).sort().join("|") ===
            "caseRef|fileName|mimeType|replacementTargetRef|sizeBytes" &&
          requestBody.replacementTargetRef === TARGET_ENERGY &&
          requestBody.mimeType === "application/pdf" &&
          !/storage|sha|evidence|customer|authUuid|carry/i.test(
            JSON.stringify(requestBody),
          ),
        "Q32_upload_url_payload_contains_browser_authority",
      );
      return new Response(
        JSON.stringify({
          ok: true,
          uploadRef: `CRU-${"5".repeat(32)}`,
          replacementTargetRef: TARGET_ENERGY,
          signedUploadUrl:
            "https://local.invalid/storage/v1/object/upload/sign/customer-corrections/proof?token=private",
          uploadToken: "private",
          expiresAt: "2026-08-22T12:30:00.000Z",
          acceptedMimeTypes: ["application/pdf"],
          maximumFileSize: 15 * 1024 * 1024,
        }),
        { status: 201 },
      );
    }
    if (init?.method === "PUT") {
      assert(
        headers.get("Content-Type") === "application/pdf" &&
          headers.get("x-upsert") === "false" && init.body === proofFile,
        "Q32_private_signed_put_invalid",
      );
      return new Response(null, { status: 200 });
    }
    const requestBody = JSON.parse(String(init?.body));
    assert(
      Object.keys(requestBody).sort().join("|") === "caseRef|uploadRef",
      "Q32_confirm_payload_invalid",
    );
    return new Response(
      JSON.stringify({
        ok: true,
        uploadRef: `CRU-${"5".repeat(32)}`,
        candidateRef: CANDIDATE_ENERGY,
        replacementTargetRef: TARGET_ENERGY,
        fileName: "replacement.pdf",
        status: "confirmed_staged",
        parserObservation: {
          schemaVersion: "customer-correction-replacement-observation-v1",
          parserProfile: "energy_document_v1",
          outcome: "observed",
          observedFacts: [{
            factKey: "energySupplier",
            status: "observed",
            observedValue: "Pilot Energie Correct B.V.",
            normalizedObservedValue: "Pilot Energie Correct B.V.",
            extractionMethod: "semantic_energy_supplier_block",
            confidence: "high",
            limitation: null,
          }],
          limitations: [],
        },
        parserSuccessRequiredForFinalCustomerValue: false,
      }),
      { status: 200 },
    );
  },
});
assert(
  uploadResult.ok && uploadResult.receipt.candidateRef === CANDIDATE_ENERGY &&
    uploadResult.receipt.observedFacts.length === 1 &&
    uploadResult.receipt.observedFacts[0].factKey === "energySupplier" &&
    uploadResult.receipt.observedFacts[0].observedValue ===
      "Pilot Energie Correct B.V." &&
    uploadCalls.length === 3 &&
    uploadStages.join("|") === "UPLOADING|PARSING",
  "Q32_upload_url_put_confirm_parser_flow_invalid",
);

let retryIssueCalls = 0;
let retryPutCalls = 0;
let retryConfirmCalls = 0;
const retryFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("api-app-customer-correction-upload-url")) {
    retryIssueCalls += 1;
    return new Response(
      JSON.stringify({
        ok: true,
        uploadRef: `CRU-${"6".repeat(32)}`,
        replacementTargetRef: TARGET_ENERGY,
        signedUploadUrl:
          "https://local.invalid/storage/v1/object/upload/sign/customer-corrections/retry?token=private",
        uploadToken: "private",
        expiresAt: "2026-08-22T12:30:00.000Z",
        acceptedMimeTypes: ["application/pdf"],
        maximumFileSize: 15 * 1024 * 1024,
      }),
      { status: 201 },
    );
  }
  if (init?.method === "PUT") {
    retryPutCalls += 1;
    return new Response(null, { status: 200 });
  }
  retryConfirmCalls += 1;
  if (retryConfirmCalls === 1) {
    return new Response(JSON.stringify({ ok: false, code: "internal_error" }), {
      status: 503,
    });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      uploadRef: `CRU-${"6".repeat(32)}`,
      candidateRef: CANDIDATE_ENERGY,
      replacementTargetRef: TARGET_ENERGY,
      fileName: "replacement.pdf",
      status: "confirmed_staged",
      parserObservation: null,
      parserSuccessRequiredForFinalCustomerValue: false,
    }),
    { status: 200 },
  );
};
const retryFirst = await uploadCustomerCorrectionReplacement({
  accessToken: "proof-token",
  caseRef: CASE_A,
  target: proofTarget,
  file: proofFile,
  attempt: createCustomerCorrectionReplacementUploadAttempt(),
}, {
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: retryFetch,
});
assert(!retryFirst.ok, "Q33_confirm_failure_not_returned");
const retrySecond = await uploadCustomerCorrectionReplacement({
  accessToken: "proof-token",
  caseRef: CASE_A,
  target: proofTarget,
  file: proofFile,
  attempt: retryFirst.attempt,
}, {
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: retryFetch,
});
assert(
  retrySecond.ok && retryIssueCalls === 1 && retryPutCalls === 1 &&
    retryConfirmCalls === 2 && retrySecond.receipt.observedFacts.length === 0,
  "Q33_confirm_retry_reuploaded_or_parser_miss_not_ready",
);

const staleUpload = await uploadCustomerCorrectionReplacement({
  accessToken: "proof-token",
  caseRef: CASE_A,
  target: proofTarget,
  file: proofFile,
  attempt: createCustomerCorrectionReplacementUploadAttempt(),
}, {
  runtimeConfig: {
    apiBaseUrl: "https://local.invalid/functions/v1",
    anonKey: "proof-anon",
  },
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        ok: false,
        code: "correction_handoff_not_current",
      }),
      { status: 409 },
    ),
});
assert(
  !staleUpload.ok && staleUpload.error.code === "stale_handoff",
  "Q34_upload_stale_handoff_not_safe",
);

assert(uploadResult.ok, "Q35_upload_receipt_missing");
const readyTargetHtml = renderToStaticMarkup(
  <CustomerCorrectionReplacementTargetCard
    onFileChange={() => undefined}
    onRetry={() => undefined}
    state={{
      status: "READY",
      file: proofFile,
      attempt: uploadResult.attempt,
      receipt: uploadResult.receipt,
    }}
    target={proofTarget}
  />,
);
const missTargetHtml = renderToStaticMarkup(
  <CustomerCorrectionReplacementTargetCard
    onFileChange={() => undefined}
    onRetry={() => undefined}
    state={{
      status: "READY",
      file: proofFile,
      attempt: retrySecond.ok ? retrySecond.attempt : proofAttempt,
      receipt: retrySecond.ok ? retrySecond.receipt : uploadResult.receipt,
    }}
    target={proofTarget}
  />,
);
const emptyTargetHtml = renderToStaticMarkup(
  <CustomerCorrectionReplacementTargetCard
    onFileChange={() => undefined}
    onRetry={() => undefined}
    state={{ status: "EMPTY" }}
    target={proofTarget}
  />,
);
const uploadingTargetHtml = renderToStaticMarkup(
  <CustomerCorrectionReplacementTargetCard
    onFileChange={() => undefined}
    onRetry={() => undefined}
    state={{ status: "UPLOADING", file: proofFile, attempt: proofAttempt }}
    target={proofTarget}
  />,
);
const parsingTargetHtml = renderToStaticMarkup(
  <CustomerCorrectionReplacementTargetCard
    onFileChange={() => undefined}
    onRetry={() => undefined}
    state={{ status: "PARSING", file: proofFile, attempt: proofAttempt }}
    target={proofTarget}
  />,
);
const errorTargetHtml = renderToStaticMarkup(
  <CustomerCorrectionReplacementTargetCard
    onFileChange={() => undefined}
    onRetry={() => undefined}
    state={{
      status: "ERROR",
      file: proofFile,
      attempt: proofAttempt,
      error: {
        code: "service_unavailable",
        message: "Upload mislukt.",
        stage: "upload",
      },
    }}
    target={proofTarget}
  />,
);
assert(
  !readyTargetHtml.includes("Gevonden in document") &&
    !readyTargetHtml.includes("Pilot Energie Correct B.V.") &&
    !missTargetHtml.includes("Niet gevonden") &&
    !/energySupplier|parserProfile|confidence|CRC-|CRT-|storage|sha/i.test(
      `${readyTargetHtml}${missTargetHtml}`,
    ),
  "Q35_customer_safe_parser_observation_ui_invalid",
);
assert(
  emptyTargetHtml.includes("Geen document gekozen") &&
    emptyTargetHtml.includes('class="sr-only"') &&
    !emptyTargetHtml.includes("status-dot") &&
    uploadingTargetHtml.includes("Uploaden…") &&
    uploadingTargetHtml.includes("status-dot-warning") &&
    uploadingTargetHtml.includes("document-upload-card-message-warning") &&
    parsingTargetHtml.includes("Controleren…") &&
    parsingTargetHtml.includes("status-dot-warning") &&
    parsingTargetHtml.includes("document-upload-card-message-warning") &&
    readyTargetHtml.includes("Document beschikbaar") &&
    readyTargetHtml.includes("status-pill status-pill-ok") &&
    readyTargetHtml.includes("✓") &&
    readyTargetHtml.includes("document-upload-card-message-success") &&
    !readyTargetHtml.includes(">PDF gereed<") &&
    !readyTargetHtml.includes('class="field-message"') &&
    errorTargetHtml.includes("Upload mislukt.") &&
    errorTargetHtml.includes("status-dot-danger") &&
    errorTargetHtml.includes("document-upload-card-message-danger"),
  "Q35_upload_status_presentation_semantics_invalid",
);

assert(
  customerCorrectionChallengeBindingKey(
        valueDocumentReady.responses,
        [],
        "Lokaal Piloot",
        true,
      ) !==
      customerCorrectionChallengeBindingKey(
        buildCustomerCorrectionWorkspace(
          valueDocumentHandoff.items,
          valueDocumentDraft,
          { [TARGET_ENERGY]: { candidateRef: CANDIDATE_INVOICE } },
        ).responses,
        [],
        "Lokaal Piloot",
        true,
      ) &&
    panelSource.includes("uploadInFlightRefs.current.has(targetRef)") &&
    panelSource.includes("invalidateChallenge();") &&
    panelSource.includes("setReplacementUploads({});") &&
    panelSource.includes("state.retryStale();") &&
    !panelSource.match(/localStorage|sessionStorage|indexedDB/i) &&
    !replacementUploadSource.match(/localStorage|sessionStorage|indexedDB/i),
  "Q36_candidate_binding_single_flight_or_stale_reset_invalid",
);

assert(
  replacementUploadSource.includes(
    "api-app-customer-correction-upload-url",
  ) && replacementUploadSource.includes(
    "api-app-customer-correction-upload-confirm",
  ) && replacementUploadSource.includes("putPrivateSignedUploadUrl") &&
    uploadTransportSource.includes('"x-upsert": "false"') &&
    !replacementUploadSource.match(
      /clientSha|storagePath|storageBucket|evidenceVersion|carryForward|customerId|authUuid/,
    ),
  "Q37_upload_transport_or_browser_authority_boundary_invalid",
);

assert(
  !retentionToolSource.includes("customer-corrections/") &&
    !retentionToolSource.includes(
      "app_customer_correction_replacement_candidates",
    ) && !retentionWorkerSource.includes("customer-corrections/") &&
    !retentionWorkerSource.includes(
      "app_customer_correction_replacement_candidates",
    ) && replacementFinalizationMigrationSource.includes(
      "correction_replacement_candidate_id uuid",
    ) && replacementFinalizationMigrationSource.includes(
      "unique (correction_replacement_candidate_id)",
    ) && replacementFinalizationMigrationSource.includes(
      "correction_replacement_candidate_id, storage_bucket, storage_path",
    ),
  "Q38_promoted_candidate_storage_retention_guard_invalid",
);

console.log("CUSTOMER_CORRECTION_HANDOFF_UI_Q01_Q40=PASS");
console.log("CUSTOMER04C3C5_CORRECTION_STATUS=PASS");
console.log("CUSTOMER04C3C5_PARSER_RESOLUTION_DISTINCTION=PASS");
console.log("CUSTOMER04C3C9H_CORRECTION_UI=PASS");
console.log("CUSTOMER_CORRECTION_RESUBMISSION_SESSION=PASS");
Deno.exit(0);
