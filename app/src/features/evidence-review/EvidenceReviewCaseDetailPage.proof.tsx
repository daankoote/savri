import { renderToStaticMarkup } from "react-dom/server";
import type {
  EvidenceReviewCaseDetailResponseV1,
  EvidenceReviewEvidenceV1,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import {
  buildEvidenceFactReviewRows,
  EVIDENCE_FACT_CORRECTION_REASON_LABELS,
  EVIDENCE_FACT_CORRECTION_REASON_OPTIONS,
  EVIDENCE_REVIEW_REASON_LABELS,
  EvidenceReviewCaseDetailContent,
} from "./EvidenceReviewCaseDetailPage.tsx";
import {
  decodeEvidenceReviewCaseDetailResponse,
  type EvidenceFactReviewRoundFinalizeCall,
  type EvidenceFactReviewRoundFinalizeRequest,
  type EvidenceFactReviewRoundFinalizeResult,
  type EvidenceReviewCorrectionPublishCall,
  type EvidenceReviewDetailSafeError,
  finalizeEvidenceFactReviewRound,
  loadEvidenceReviewCaseDetail,
  loadEvidenceReviewPreview,
  publishEvidenceReviewCorrection,
} from "./evidenceReviewDetailClient.ts";
import {
  createEvidenceReviewPreviewSession,
  EvidenceReviewPreviewPane,
  type EvidenceReviewPreviewState,
} from "./EvidenceReviewPreviewPane.tsx";
import { loadEvidenceReviewCaseDetailOnce } from "./useEvidenceReviewCaseDetail.ts";
import {
  buildEvidenceFactReviewFinalizeRequest,
  canAcceptEvidenceFactReviewSubject,
  initializeEvidenceFactReviewDraft,
  isEvidenceFactCorrectionValid,
  isEvidenceFactReviewDraftComplete,
  isEvidenceFactReviewSubjectActionable,
  reduceEvidenceFactReviewDraft,
  selectEvidenceFactReviewFinalizeAttempt,
  submitEvidenceFactReviewRound,
} from "./useEvidenceFactReviewDraft.ts";
import {
  canPublishEvidenceCorrection,
  createEvidenceCorrectionPublishSession,
  INFORMATION_REQUEST_CORRECTION_BLOCK_MESSAGE,
  isEvidenceCorrectionBlockedByInformationRequest,
  type EvidenceCorrectionPublishState,
} from "./useEvidenceCorrectionPublish.ts";
import {
  buildEvidenceReviewDetailRoute,
  parseEvidenceReviewDetailRoute,
} from "./evidenceReviewRoutes.ts";
import { evidenceReviewFactStatusPresentation } from "./evidenceReviewStatusPresentation.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

function last<T>(values: readonly T[]): T | undefined {
  return values[values.length - 1];
}

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));
const CASE_REF = "CASE-7E4CC75CD19F";
const ENERGY_VERSION = "e8000000-0000-4000-8000-000000000001";
const INSTALLATION_VERSION = "e8000000-0000-4000-8000-000000000002";
const noop = () => undefined;
const noFinalize: EvidenceFactReviewRoundFinalizeCall = async () => ({
  ok: false,
  kind: "ordinary",
});
const noPublish: EvidenceReviewCorrectionPublishCall = async () => ({
  ok: false,
  kind: "ordinary",
});

function evidence(
  evidenceVersionRef: string,
  kind: string,
  facts: EvidenceReviewEvidenceV1["canonicalFacts"],
): EvidenceReviewEvidenceV1 {
  return {
    evidenceRef: crypto.randomUUID(),
    evidenceVersionRef,
    kind,
    mime: "application/pdf",
    uploadedAt: "2026-08-18T10:00:00.000Z",
    integrityAvailable: true,
    reviewStatus: "PENDING",
    canonicalFacts: facts,
  };
}

const FIXTURE: EvidenceReviewCaseDetailResponseV1 = {
  schemaVersion: "evidence-review-case-detail-v6",
  asOf: "2026-08-18T12:00:00.000Z",
  case: {
    caseRef: CASE_REF,
    lifecycle: "submitted_for_review",
    canDecide: true,
    canPublishCorrection: false,
    partyDisplayName: "Pilotnaam",
    partyDisplayNameTruth: "DECLARED",
    deliveryAddress: "Pilotadres",
    deliveryAddressTruth: "DECLARED",
  },
  evidence: [
    evidence(ENERGY_VERSION, "energy_bill_or_contract", [
      {
        category: "EAN",
        value: "871234567890123456",
        truthClass: "REVIEW_REQUIRED",
        reviewReason: "USER_OVERRIDE",
        reviewReasonAuthority: "CUSTOMER_SIGNED_RESOLUTION",
      },
      {
        category: "ENERGY_SUPPLIER",
        value: "Leverancier",
        truthClass: "CUSTOMER_CONFIRMED",
      },
    ]),
    evidence(INSTALLATION_VERSION, "installation_invoice", [
      {
        category: "CHARGER_BRAND",
        value: "Merk",
        truthClass: "CUSTOMER_CONFIRMED",
      },
      {
        category: "MID",
        value: "MID-verklaard",
        truthClass: "REVIEW_REQUIRED",
        reviewReason: "GENERIC_REVIEW_REQUIRED",
      },
    ]),
  ],
  reviewManifestVersion: "fact-review-manifest-v1",
  reviewManifestHash: "a".repeat(64),
  reviewSubjects: [
    {
      subjectRef: `FRS-${"1".repeat(64)}`,
      subjectKind: "FACT",
      evidenceVersionRef: ENERGY_VERSION,
      evidenceKind: "energy_bill_or_contract",
      factKey: "electricityEan",
      factCategory: "EAN",
      factLabel: "EAN",
      scopeRef: `FRSCOPE-${"2".repeat(64)}`,
      value: "871234567890123456",
      valueStatus: "PRESENT",
      required: true,
      truthClass: "REVIEW_REQUIRED",
      reviewReason: "USER_OVERRIDE",
      reviewReasonAuthority: "CUSTOMER_SIGNED_RESOLUTION",
      reviewerSuggestion: "NONE",
    },
    {
      subjectRef: `FRS-${"3".repeat(64)}`,
      subjectKind: "FACT",
      evidenceVersionRef: INSTALLATION_VERSION,
      evidenceKind: "installation_invoice",
      factKey: "chargerBrand",
      factCategory: "CHARGER_BRAND",
      factLabel: "Merk",
      scopeRef: `FRSCOPE-${"4".repeat(64)}`,
      value: "Merk",
      valueStatus: "PRESENT",
      required: true,
      truthClass: "CUSTOMER_CONFIRMED",
      reviewerSuggestion: "ACCEPT",
    },
  ],
  currentReviewRound: null,
  overallReviewStatus: "TO_REVIEW",
  informationRequest: { canManage: true, request: null, history: [] },
};

const previewSuccess = async () => ({
  ok: true as const,
  blob: new Blob(["%PDF-proof"], { type: "application/pdf" }),
  filename: "proof.pdf",
  expiresAt: "2026-08-18T12:02:00.000Z",
});

function detailHtml(
  state:
    | { status: "loading"; value: null; error: null }
    | {
      status: "ready";
      value: EvidenceReviewCaseDetailResponseV1;
      error: null;
    }
    | { status: "error"; value: null; error: EvidenceReviewDetailSafeError },
): string {
  return renderToStaticMarkup(
    <EvidenceReviewCaseDetailContent
      accessToken="proof-token"
      caseRef={CASE_REF}
      finalizeReview={noFinalize}
      loadPreview={previewSuccess}
      onBack={noop}
      onRefresh={noop}
      publishCorrection={noPublish}
      state={state}
    />,
  );
}

function factRowHtml(html: string, label: string): string {
  const marker = `<span data-label="Gegeven" role="cell">${label}</span>`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return "";
  const rowStart = html.lastIndexOf(
    '<div class="fact-table__row" role="row">',
    markerIndex,
  );
  const rowEnd = html.indexOf("</div>", markerIndex);
  return rowStart < 0 || rowEnd < 0
    ? ""
    : html.slice(rowStart, rowEnd + "</div>".length);
}

const detailRoute = buildEvidenceReviewDetailRoute(CASE_REF);
assert(
  detailRoute === `/beheer/dossiers/${CASE_REF}` &&
    parseEvidenceReviewDetailRoute(detailRoute) === CASE_REF,
  "Q01_valid_detail_route_rejected",
);
for (
  const invalid of [
    "/intern/dossiers/CASE-NOT-HEX",
    `/intern/dossiers/${CASE_REF}/extra`,
    `/intern/dossiers/${CASE_REF}?tenant=other`,
    "/intern/dossiers/../compliance",
    `https://attacker.invalid/intern/dossiers/${CASE_REF}`,
    `//attacker.invalid/intern/dossiers/${CASE_REF}`,
  ]
) {
  assert(
    parseEvidenceReviewDetailRoute(invalid) === null,
    `Q02_invalid_route:${invalid}`,
  );
}

const loadingHtml = detailHtml({ status: "loading", value: null, error: null });
assert(
  loadingHtml.includes("Dossier laden") &&
    loadingHtml.includes('role="status"') &&
    loadingHtml.includes("Terug naar dossiers"),
  "Q03_loading_or_back_state_invalid",
);

const readyHtml = detailHtml({ status: "ready", value: FIXTURE, error: null });
const openPreviewHtml = renderToStaticMarkup(
  <EvidenceReviewPreviewPane
    onRetry={noop}
    state={{
      status: "ready",
      selection: {
        evidenceVersionRef: ENERGY_VERSION,
        label: "Energiedocument",
      },
      blobUrl: "blob:proof-document",
      filename: "proof.pdf",
    }}
  />,
);
const unavailablePreviewHtml = renderToStaticMarkup(
  <EvidenceReviewPreviewPane
    onRetry={noop}
    state={{
      status: "error",
      selection: {
        evidenceVersionRef: ENERGY_VERSION,
        label: "Energiedocument",
      },
      message: "Het document is niet beschikbaar.",
    }}
  />,
);
assert(
  readyHtml.includes(CASE_REF) &&
    readyHtml.includes("ENVAL beoordelen") &&
    readyHtml.includes("Ingediend voor beoordeling") &&
    readyHtml.split("Document bekijken").length - 1 === 2 &&
    !readyHtml.includes(">PENDING<") &&
    !readyHtml.includes(">ACCEPTED<") &&
    !readyHtml.includes(">CORRECTION_REQUIRED<") &&
    readyHtml.split('role="columnheader"').length - 1 === 10 &&
    !readyHtml.includes("Aangegeven dossiercontext") &&
    !readyHtml.includes(">Bewijsstukken<") &&
    !readyHtml.includes("Actuele gegevens uit het geautoriseerde dossier.") &&
    !readyHtml.includes("evidence-review-section__body--open") &&
    !readyHtml.includes("Documentweergave") &&
    !readyHtml.includes("Pilotnaam") && !readyHtml.includes("Pilotadres"),
  "Q04_pilot_detail_or_two_evidence_cards_invalid",
);
assert(
  openPreviewHtml.includes("evidence-review-preview-pane") &&
    openPreviewHtml.includes("evidence-review-preview-frame") &&
    openPreviewHtml.includes("blob:proof-document") &&
    unavailablePreviewHtml.includes('role="alert"') &&
    unavailablePreviewHtml.includes("Document niet beschikbaar") &&
    unavailablePreviewHtml.includes("Het document is niet beschikbaar.") &&
    unavailablePreviewHtml.includes("Opnieuw proberen"),
  "Q04a_open_or_unavailable_preview_presentation_invalid",
);
assert(
  readyHtml.includes("EAN") && readyHtml.includes("871234567890123456") &&
    readyHtml.includes("Energieleverancier") &&
    readyHtml.includes("Door klant bevestigd") &&
    readyHtml.includes("Beoordeling nodig") &&
    readyHtml.includes("Door klant aangepast") &&
    readyHtml.includes("Historisch niet vastgelegd") &&
    !readyHtml.includes("Reden beoordeling:") &&
    !/(workforce accepted|door medewerker geaccepteerd|parserhistorie|parser history)/i
      .test(readyHtml),
  "Q05_fact_truth_presentation_invalid",
);
assert(
  readyHtml.split(">Accepteren<").length - 1 === 1 &&
    readyHtml.split(">Correctie nodig<").length - 1 === 1 &&
    !readyHtml.includes('aria-pressed="true"') &&
    readyHtml.includes("Review afronden") && readyHtml.includes("disabled") &&
    !/(Beoordeling opslaan|Check uitvoeren)/i.test(readyHtml),
  "Q06_fact_review_defaults_or_controls_invalid",
);

const viewOnlyHtml = detailHtml({
  status: "ready",
  value: { ...FIXTURE, case: { ...FIXTURE.case, canDecide: false } },
  error: null,
});
const finalizedFixture: EvidenceReviewCaseDetailResponseV1 = {
  ...FIXTURE,
  overallReviewStatus: "CORRECTION_REQUIRED",
  currentReviewRound: {
    roundRef: "a8000000-0000-4000-8000-000000000010",
    manifestVersion: FIXTURE.reviewManifestVersion,
    manifestHash: FIXTURE.reviewManifestHash,
    outcome: "CORRECTIONS_REQUIRED",
    finalizedAt: "2026-08-18T12:10:00.000Z",
    decisions: [
      {
        subjectRef: FIXTURE.reviewSubjects[0].subjectRef,
        disposition: "CORRECTION_REQUIRED",
        correctionReason: "INCORRECT_INFORMATION",
        correctionInstruction: "Controleer de EAN en pas deze aan.",
      },
      {
        subjectRef: FIXTURE.reviewSubjects[1].subjectRef,
        disposition: "ACCEPTED",
      },
    ],
  },
};
const finalizedHtml = detailHtml({
  status: "ready",
  value: finalizedFixture,
  error: null,
});
const publishEligibleFixture: EvidenceReviewCaseDetailResponseV1 = {
  ...finalizedFixture,
  case: { ...finalizedFixture.case, canPublishCorrection: true },
};
const publishEligibleHtml = detailHtml({
  status: "ready",
  value: publishEligibleFixture,
  error: null,
});
const blockedPublishFixture: EvidenceReviewCaseDetailResponseV1 = {
  ...publishEligibleFixture,
  informationRequest: {
    canManage: true,
    history: [],
    request: {
      requestRef: "IRQ-0123456789ABCDEF",
      state: "OPEN",
      question: "Welke toelichting kunt u geven?",
      answer: null,
      askedAt: "2026-08-19T12:00:00.000Z",
      answeredAt: null,
      terminalAt: null,
    },
  },
};
const blockedPublishHtml = detailHtml({
  status: "ready",
  value: blockedPublishFixture,
  error: null,
});
const waitingHtml = detailHtml({
  status: "ready",
  value: { ...publishEligibleFixture, overallReviewStatus: "WAITING_CUSTOMER" },
  error: null,
});
const acceptedReviewRequiredPresentation = evidenceReviewFactStatusPresentation(
  { truthClass: "REVIEW_REQUIRED" },
  { disposition: "ACCEPTED" },
);
const correctedReviewRequiredPresentation =
  evidenceReviewFactStatusPresentation(
    { truthClass: "REVIEW_REQUIRED" },
    { disposition: "CORRECTION_REQUIRED" },
  );
const completeHtml = detailHtml({
  status: "ready",
  value: {
    ...publishEligibleFixture,
    overallReviewStatus: "REVIEW_COMPLETE",
    currentReviewRound: {
      ...publishEligibleFixture.currentReviewRound!,
      outcome: "ALL_FACTS_ACCEPTED",
      decisions: publishEligibleFixture.currentReviewRound!.decisions.map(
        (decision) => ({
          subjectRef: decision.subjectRef,
          disposition: "ACCEPTED" as const,
        }),
      ),
    },
  },
  error: null,
});
const finalizedAcceptedEanRowHtml = factRowHtml(completeHtml, "EAN");
const unmatchedLegacyMidRowHtml = factRowHtml(completeHtml, "MID");
assert(
  !viewOnlyHtml.includes(">Accepteren<") &&
    !viewOnlyHtml.includes(">Correctie nodig<") &&
    !viewOnlyHtml.includes("Review afronden") &&
    !finalizedHtml.includes(">Accepteren<") &&
    !finalizedHtml.includes('aria-pressed="') &&
    finalizedHtml.includes("Geaccepteerd") &&
    finalizedHtml.includes("Correctie nodig") &&
    finalizedHtml.includes("Gegeven onjuist") &&
    finalizedHtml.includes("Controleer de EAN en pas deze aan.") &&
    finalizedHtml.includes("Correctie nodig") &&
    !finalizedHtml.includes("Correcties nodig"),
  "Q06a_view_only_or_finalized_rendering_invalid",
);
assert(
  finalizedAcceptedEanRowHtml.includes(">--<") &&
    finalizedAcceptedEanRowHtml.includes("Geaccepteerd") &&
    !finalizedAcceptedEanRowHtml.includes("Historisch niet vastgelegd"),
  "Q06ab_accepted_decision_reason_not_neutral",
);
assert(
  unmatchedLegacyMidRowHtml.includes("Historisch niet vastgelegd") &&
    !unmatchedLegacyMidRowHtml.includes(">--<"),
  "Q06ac_unmatched_legacy_reason_not_preserved",
);
assert(
  acceptedReviewRequiredPresentation.label === "Geaccepteerd" &&
    acceptedReviewRequiredPresentation.className === "status-pill-ok" &&
    correctedReviewRequiredPresentation.label === "Correctie nodig" &&
    correctedReviewRequiredPresentation.className === "status-pill-danger",
  "Q06aa_finalized_decision_did_not_override_pending_source_presentation",
);
assert(
  publishEligibleHtml.includes(">Naar klant sturen<") &&
    blockedPublishHtml.includes(INFORMATION_REQUEST_CORRECTION_BLOCK_MESSAGE) &&
    !blockedPublishHtml.includes(">Naar klant sturen<") &&
    !finalizedHtml.includes(">Naar klant sturen<") &&
    !waitingHtml.includes(">Naar klant sturen<") &&
    waitingHtml.includes("Wacht op klant") &&
    !completeHtml.includes(">Naar klant sturen<") &&
    !readyHtml.includes(">Naar klant sturen<") &&
    canPublishEvidenceCorrection(publishEligibleFixture) &&
    !canPublishEvidenceCorrection(blockedPublishFixture) &&
    isEvidenceCorrectionBlockedByInformationRequest(blockedPublishFixture) &&
    !canPublishEvidenceCorrection(finalizedFixture) &&
    !canPublishEvidenceCorrection({
      ...publishEligibleFixture,
      overallReviewStatus: "WAITING_CUSTOMER",
    }) &&
    !canPublishEvidenceCorrection({
      ...publishEligibleFixture,
      overallReviewStatus: "REVIEW_COMPLETE",
    }) &&
    !canPublishEvidenceCorrection(FIXTURE),
  "Q06b_publish_affordance_or_status_visibility_invalid",
);

const unauthorizedHtml = detailHtml({
  status: "error",
  value: null,
  error: {
    code: "unauthorized",
    message: "Log opnieuw in om dit dossier te bekijken.",
  },
});
const inaccessibleHtml = detailHtml({
  status: "error",
  value: null,
  error: {
    code: "not_found_or_forbidden",
    message:
      "Dit dossier is niet beschikbaar binnen uw toegewezen dossierscope.",
  },
});
const invalidHtml = detailHtml({
  status: "error",
  value: null,
  error: { code: "invalid_case", message: "De dossierroute is ongeldig." },
});
const serverErrorHtml = detailHtml({
  status: "error",
  value: null,
  error: {
    code: "service_unavailable",
    message: "Tijdelijk niet beschikbaar.",
  },
});
assert(
  unauthorizedHtml.includes("Inloggen vereist") &&
    inaccessibleHtml.includes("Dossier niet beschikbaar") &&
    invalidHtml.includes("Ongeldige dossierroute") &&
    serverErrorHtml.includes("Opnieuw laden") &&
    !inaccessibleHtml.includes("bestaat") &&
    !/(postgres|service[_ .-]?role|credential|workforce_identity)/i.test(
      unauthorizedHtml + inaccessibleHtml + invalidHtml + serverErrorHtml,
    ),
  "Q07_safe_error_states_invalid",
);

let detailFetches = 0;
let detailUrl = "";
let detailInit: RequestInit | undefined;
const detailResult = await loadEvidenceReviewCaseDetail({
  accessToken: "proof-access-token",
  caseRef: CASE_REF,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: async (input, init) => {
    detailFetches += 1;
    detailUrl = String(input);
    detailInit = init;
    return new Response(JSON.stringify(FIXTURE), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
const detailHeaders = new Headers(detailInit?.headers);
const prematureWaiting = decodeEvidenceReviewCaseDetailResponse({
  ...FIXTURE,
  overallReviewStatus: "WAITING_CUSTOMER",
});
assert(
  detailResult.ok && detailFetches === 1 &&
    !prematureWaiting.ok &&
    detailResult.value.case.canDecide === true &&
    detailUrl ===
      `https://local-proof.invalid/functions/v1/api-app-evidence-review-case-detail?caseRef=${CASE_REF}` &&
    detailInit?.method === "GET" && !detailInit.body &&
    detailHeaders.get("authorization") === "Bearer proof-access-token" &&
    detailHeaders.get("apikey") === "proof-anon-key",
  "Q08_exact_single_detail_get_invalid",
);

let publishPosts = 0;
let publishUrl = "";
let publishInit: RequestInit | undefined;
const publishResult = await publishEvidenceReviewCorrection({
  accessToken: "proof-access-token",
  idempotencyKey: "review20-publish-attempt",
  request: {
    caseRef: CASE_REF,
    coverMessage: "Controleer en corrigeer de onderstaande gegevens.",
    roundRef: publishEligibleFixture.currentReviewRound!.roundRef,
  },
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: async (input, init) => {
    publishPosts += 1;
    publishUrl = String(input);
    publishInit = init;
    return new Response(
      JSON.stringify({
        schemaVersion: "evidence-review-correction-publish-v2",
        result: "PUBLISHED",
        caseRef: CASE_REF,
        roundRef: publishEligibleFixture.currentReviewRound!.roundRef,
        handoffRef: "CRH-0123456789ABCDEF",
        publishedAt: "2026-08-19T12:00:00.000Z",
      }),
      { status: 201 },
    );
  },
});
const publishHeaders = new Headers(publishInit?.headers);
const publishBody = JSON.parse(String(publishInit?.body));
assert(
  publishResult.ok && publishResult.result === "PUBLISHED" &&
    publishPosts === 1 &&
    publishUrl.endsWith("/api-app-evidence-review-correction-publish") &&
    publishInit?.method === "POST" &&
    publishHeaders.get("authorization") === "Bearer proof-access-token" &&
    publishHeaders.get("apikey") === "proof-anon-key" &&
    publishHeaders.get("idempotency-key") === "review20-publish-attempt" &&
    Object.keys(publishBody).sort().join("|") ===
      "caseRef|coverMessage|roundRef" &&
    publishBody.caseRef === CASE_REF &&
    publishBody.coverMessage ===
      "Controleer en corrigeer de onderstaande gegevens." &&
    publishBody.roundRef ===
      publishEligibleFixture.currentReviewRound!.roundRef,
  "Q08c_publish_client_contract_invalid",
);
const publishFailureConfig = {
  accessToken: "proof-access-token",
  idempotencyKey: "review20-publish-failure",
  request: {
    caseRef: CASE_REF,
    coverMessage: "Controleer en corrigeer de onderstaande gegevens.",
    roundRef: publishEligibleFixture.currentReviewRound!.roundRef,
  },
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
};
const staleClientResult = await publishEvidenceReviewCorrection({
  ...publishFailureConfig,
  fetchImpl: async () =>
    new Response(JSON.stringify({ code: "stale_review_round" }), {
      status: 409,
    }),
});
const ordinaryConflictResult = await publishEvidenceReviewCorrection({
  ...publishFailureConfig,
  fetchImpl: async () =>
    new Response(JSON.stringify({ code: "customer_context_unavailable" }), {
      status: 409,
    }),
});
const informationRequestConflictResult = await publishEvidenceReviewCorrection({
  ...publishFailureConfig,
  fetchImpl: async () =>
    new Response(JSON.stringify({ code: "information_request_active" }), {
      status: 409,
    }),
});
assert(
  !staleClientResult.ok && staleClientResult.kind === "stale" &&
    !informationRequestConflictResult.ok &&
    informationRequestConflictResult.kind === "information_request_active" &&
    !ordinaryConflictResult.ok && ordinaryConflictResult.kind === "ordinary",
  "Q08c_publish_conflict_classification_invalid",
);

let releasePublish: (
  result: Awaited<ReturnType<EvidenceReviewCorrectionPublishCall>>,
) => void = () => {
  throw new ProofFailure("publish_release_not_initialized");
};
let sessionPosts = 0;
let refreshes = 0;
let createdKeys = 0;
let sentRequest: unknown = null;
const sessionStates: EvidenceCorrectionPublishState[] = [];
const publishSession = createEvidenceCorrectionPublishSession({
  send: async (input) => {
    sessionPosts += 1;
    sentRequest = input;
    return await new Promise((resolve) => {
      releasePublish = resolve;
    });
  },
  refresh: () => refreshes += 1,
  publish: (state) => sessionStates.push(state),
  createIdempotencyKey: () => {
    createdKeys += 1;
    return "review20-memory-only-key";
  },
});
publishSession.updateDetail(publishEligibleFixture);
publishSession.openConfirmation();
assert(
  sessionPosts === 0 && last(sessionStates)?.confirmationOpen === true,
  "Q08d_first_click_wrote_or_confirmation_missing",
);
publishSession.cancelConfirmation();
assert(
  sessionPosts === 0 && last(sessionStates)?.confirmationOpen === false,
  "Q08e_cancel_wrote_or_did_not_close",
);
publishSession.openConfirmation();
publishSession.setCoverMessage(
  "Controleer en corrigeer de onderstaande gegevens.",
);
const firstPublish = publishSession.confirm();
const duplicatePublish = publishSession.confirm();
await Promise.resolve();
assert(
  Number(sessionPosts) === 1 && Number(createdKeys) === 1 &&
    last(sessionStates)?.submitting === true,
  "Q08f_double_submit_not_blocked",
);
releasePublish({ ok: true, result: "PUBLISHED" });
await Promise.all([firstPublish, duplicatePublish]);
assert(
  Number(refreshes) === 1 && Number(sessionPosts) === 1 &&
    JSON.stringify(sentRequest) === JSON.stringify({
        request: {
          caseRef: CASE_REF,
          coverMessage: "Controleer en corrigeer de onderstaande gegevens.",
          roundRef: publishEligibleFixture.currentReviewRound!.roundRef,
        },
        idempotencyKey: "review20-memory-only-key",
      }) &&
    !JSON.stringify(sentRequest).match(
      /customer|reviewer|capability|correctionReason|correctionInstruction|tenant|timestamp/,
    ),
  "Q08g_publish_session_payload_or_refresh_invalid",
);
publishSession.dispose();

let ordinaryRefreshes = 0;
const ordinaryKeys: string[] = [];
const ordinaryStates: EvidenceCorrectionPublishState[] = [];
const ordinarySession = createEvidenceCorrectionPublishSession({
  send: async (input) => {
    ordinaryKeys.push(input.idempotencyKey);
    return { ok: false, kind: "ordinary" };
  },
  refresh: () => ordinaryRefreshes += 1,
  publish: (state) => ordinaryStates.push(state),
  createIdempotencyKey: () => "review20-retry-key",
});
ordinarySession.updateDetail(publishEligibleFixture);
ordinarySession.openConfirmation();
ordinarySession.setCoverMessage("Corrigeer de onderstaande gegevens.");
await ordinarySession.confirm();
await ordinarySession.confirm();
assert(
  Number(ordinaryRefreshes) === 0 && ordinaryKeys.join("|") ===
      "review20-retry-key|review20-retry-key" &&
    last(ordinaryStates)?.confirmationOpen === true &&
    last(ordinaryStates)?.submitting === false &&
    last(ordinaryStates)?.error ===
      "Naar klant sturen is niet gelukt. Probeer het opnieuw.",
  "Q08h_ordinary_failure_or_retry_identity_invalid",
);
ordinarySession.dispose();

let staleRefreshes = 0;
const stalePublishStates: EvidenceCorrectionPublishState[] = [];
const stalePublishSession = createEvidenceCorrectionPublishSession({
  send: async () => ({ ok: false, kind: "stale" }),
  refresh: () => staleRefreshes += 1,
  publish: (state) => stalePublishStates.push(state),
});
stalePublishSession.updateDetail(publishEligibleFixture);
stalePublishSession.openConfirmation();
stalePublishSession.setCoverMessage("Corrigeer de onderstaande gegevens.");
await stalePublishSession.confirm();
assert(
  Number(staleRefreshes) === 1 &&
    last(stalePublishStates)?.notice ===
      "Dossier is gewijzigd. Controleer opnieuw." &&
    last(stalePublishStates)?.confirmationOpen === false,
  "Q08i_stale_publish_recovery_invalid",
);
stalePublishSession.dispose();

let informationRequestRefreshes = 0;
const informationRequestStates: EvidenceCorrectionPublishState[] = [];
const informationRequestSession = createEvidenceCorrectionPublishSession({
  send: async () => ({ ok: false, kind: "information_request_active" }),
  refresh: () => informationRequestRefreshes += 1,
  publish: (state) => informationRequestStates.push(state),
});
informationRequestSession.updateDetail(publishEligibleFixture);
informationRequestSession.openConfirmation();
informationRequestSession.setCoverMessage(
  "Corrigeer de onderstaande gegevens.",
);
await informationRequestSession.confirm();
assert(
  informationRequestRefreshes === 1 &&
    last(informationRequestStates)?.error ===
      INFORMATION_REQUEST_CORRECTION_BLOCK_MESSAGE &&
    last(informationRequestStates)?.confirmationOpen === false,
  "Q08ia_information_request_race_not_safely_recovered",
);
informationRequestSession.dispose();

let dedupedFetches = 0;
let releaseDedupedFetch: () => void = () => {
  throw new ProofFailure("dedupe_release_not_initialized");
};
const dedupedFetchImpl: typeof fetch = async () => {
  dedupedFetches += 1;
  await new Promise<void>((resolve) => {
    releaseDedupedFetch = resolve;
  });
  return new Response(JSON.stringify(FIXTURE), { status: 200 });
};
const dedupeConfig = {
  accessToken: "strict-mode-proof-token",
  caseRef: CASE_REF,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: dedupedFetchImpl,
};
const firstStrictModeRead = loadEvidenceReviewCaseDetailOnce(dedupeConfig);
const secondStrictModeRead = loadEvidenceReviewCaseDetailOnce(dedupeConfig);
await Promise.resolve();
assert(
  firstStrictModeRead === secondStrictModeRead && dedupedFetches === 1 &&
    typeof releaseDedupedFetch === "function",
  "Q08b_strict_mode_initial_read_not_deduplicated",
);
releaseDedupedFetch();
assert(
  (await firstStrictModeRead).ok && (await secondStrictModeRead).ok,
  "Q08c_deduped_read_failed",
);
await loadEvidenceReviewCaseDetailOnce({
  ...dedupeConfig,
  fetchImpl: async () => {
    dedupedFetches += 1;
    return new Response(JSON.stringify(FIXTURE), { status: 200 });
  },
});
assert((dedupedFetches as number) === 2, "Q08d_explicit_later_read_not_fresh");

const energyRows = buildEvidenceFactReviewRows(
  FIXTURE.evidence[0],
  FIXTURE.reviewSubjects,
);
const installationRows = buildEvidenceFactReviewRows(
  FIXTURE.evidence[1],
  FIXTURE.reviewSubjects,
);
assert(
  energyRows.find((row) => row.label === "EAN")?.subject?.subjectRef ===
      FIXTURE.reviewSubjects[0].subjectRef &&
    energyRows.find((row) => row.label === "Energieleverancier")?.subject ===
      null &&
    installationRows.find((row) => row.label === "Merk")?.subject
        ?.subjectRef === FIXTURE.reviewSubjects[1].subjectRef &&
    installationRows.find((row) => row.label === "MID")?.subject === null,
  "Q08e_subject_mapping_not_server_identifier_based",
);

const initialDraft = initializeEvidenceFactReviewDraft(
  FIXTURE.reviewSubjects,
  true,
);
const missingRequiredSubject = Object.freeze({
  ...FIXTURE.reviewSubjects[0],
  subjectRef: `FRS-${"5".repeat(64)}`,
  factKey: "deliveryAddress",
  factCategory: "ADDRESS" as const,
  factLabel: "Adres",
  scopeRef: `FRSCOPE-${"6".repeat(64)}`,
  value: null,
  valueStatus: "REQUIRED_MISSING" as const,
  required: true,
  reviewReason: "REQUIRED_INFORMATION_MISSING" as const,
  reviewReasonAuthority: "SERVER_REQUIRED_SLOT" as const,
  reviewerSuggestion: "NONE" as const,
});
const missingRequiredFixture: EvidenceReviewCaseDetailResponseV1 = {
  ...FIXTURE,
  reviewSubjects: [...FIXTURE.reviewSubjects, missingRequiredSubject],
};
const missingRequiredHtml = detailHtml({
  status: "ready",
  value: missingRequiredFixture,
  error: null,
});
const missingRequiredRowHtml = factRowHtml(missingRequiredHtml, "Adres");
const missingRequiredDraft = initializeEvidenceFactReviewDraft(
  missingRequiredFixture.reviewSubjects,
  true,
);
const rejectedMissingAccept = reduceEvidenceFactReviewDraft(
  missingRequiredDraft,
  { type: "accept", subjectRef: missingRequiredSubject.subjectRef },
);
assert(
  !canAcceptEvidenceFactReviewSubject(missingRequiredSubject) &&
    canAcceptEvidenceFactReviewSubject(FIXTURE.reviewSubjects[0]) &&
    missingRequiredRowHtml.includes(">Correctie nodig<") &&
    !missingRequiredRowHtml.includes(">Accepteren<") &&
    rejectedMissingAccept === missingRequiredDraft &&
    !isEvidenceFactReviewDraftComplete(
      missingRequiredFixture.reviewSubjects,
      rejectedMissingAccept,
    ),
  "Q08fa_required_missing_acceptance_guard_invalid",
);
const eanSubjectRef = FIXTURE.reviewSubjects[0].subjectRef;
const brandSubjectRef = FIXTURE.reviewSubjects[1].subjectRef;
const unchangedCustomerConfirmedDraft = reduceEvidenceFactReviewDraft(
  initialDraft,
  { type: "correct", subjectRef: brandSubjectRef },
);
assert(
  initialDraft.decisions[eanSubjectRef].disposition === "UNANSWERED" &&
    initialDraft.decisions[brandSubjectRef].disposition === "ACCEPTED" &&
    initialDraft.decisions[eanSubjectRef].actionable &&
    !initialDraft.decisions[brandSubjectRef].actionable &&
    isEvidenceFactReviewSubjectActionable(FIXTURE.reviewSubjects[0]) &&
    !isEvidenceFactReviewSubjectActionable(FIXTURE.reviewSubjects[1]) &&
    unchangedCustomerConfirmedDraft === initialDraft &&
    !isEvidenceFactReviewDraftComplete(FIXTURE.reviewSubjects, initialDraft) &&
    buildEvidenceFactReviewFinalizeRequest(FIXTURE, initialDraft) === null,
  "Q08f_draft_defaults_or_unanswered_completeness_invalid",
);

let correctionDraft = reduceEvidenceFactReviewDraft(initialDraft, {
  type: "correct",
  subjectRef: eanSubjectRef,
});
correctionDraft = reduceEvidenceFactReviewDraft(correctionDraft, {
  type: "reason",
  subjectRef: eanSubjectRef,
  value: "INCORRECT_INFORMATION",
});
assert(
  !isEvidenceFactCorrectionValid(correctionDraft.decisions[eanSubjectRef]) &&
    correctionDraft.decisions[brandSubjectRef] ===
      initialDraft.decisions[brandSubjectRef] &&
    EVIDENCE_FACT_CORRECTION_REASON_OPTIONS.length === 4 &&
    new Set(EVIDENCE_FACT_CORRECTION_REASON_OPTIONS.map((item) => item.value))
        .size === 4 &&
    EVIDENCE_FACT_CORRECTION_REASON_LABELS.MISSING_INFORMATION ===
      "Gegeven ontbreekt" &&
    EVIDENCE_FACT_CORRECTION_REASON_LABELS.INCORRECT_INFORMATION ===
      "Gegeven onjuist" &&
    EVIDENCE_FACT_CORRECTION_REASON_LABELS.INCONSISTENT_INFORMATION ===
      "Gegevens komen niet overeen" &&
    EVIDENCE_FACT_CORRECTION_REASON_LABELS.OTHER === "Anders" &&
    !("UNREADABLE_DOCUMENT" in EVIDENCE_FACT_CORRECTION_REASON_LABELS) &&
    !("WRONG_DOCUMENT" in EVIDENCE_FACT_CORRECTION_REASON_LABELS),
  "Q08g_independent_correction_or_closed_reason_set_invalid",
);
correctionDraft = reduceEvidenceFactReviewDraft(correctionDraft, {
  type: "instruction",
  subjectRef: eanSubjectRef,
  value: "   ",
});
assert(
  !isEvidenceFactCorrectionValid(correctionDraft.decisions[eanSubjectRef]),
  "Q08h_whitespace_correction_accepted",
);
correctionDraft = reduceEvidenceFactReviewDraft(correctionDraft, {
  type: "instruction",
  subjectRef: eanSubjectRef,
  value: "a".repeat(1_001),
});
assert(
  !isEvidenceFactCorrectionValid(correctionDraft.decisions[eanSubjectRef]),
  "Q08i_oversize_correction_accepted",
);
correctionDraft = reduceEvidenceFactReviewDraft(correctionDraft, {
  type: "instruction",
  subjectRef: eanSubjectRef,
  value: "  Controleer de EAN en pas deze aan.  ",
});
assert(
  isEvidenceFactCorrectionValid(correctionDraft.decisions[eanSubjectRef]) &&
    isEvidenceFactReviewDraftComplete(FIXTURE.reviewSubjects, correctionDraft),
  "Q08j_valid_complete_round_rejected",
);
const clearedDraft = reduceEvidenceFactReviewDraft(correctionDraft, {
  type: "accept",
  subjectRef: eanSubjectRef,
});
assert(
  clearedDraft.decisions[eanSubjectRef].disposition === "ACCEPTED" &&
    clearedDraft.decisions[eanSubjectRef].correctionReason === "" &&
    clearedDraft.decisions[eanSubjectRef].correctionInstruction === "" &&
    clearedDraft.decisions[brandSubjectRef] ===
      correctionDraft.decisions[brandSubjectRef],
  "Q08k_correction_to_accept_did_not_clear_exact_fact",
);

let postCount = 0;
const confirmationDraft = reduceEvidenceFactReviewDraft(correctionDraft, {
  type: "open_confirmation",
});
const cancelledDraft = reduceEvidenceFactReviewDraft(confirmationDraft, {
  type: "cancel_confirmation",
});
assert(
  postCount === 0 && confirmationDraft.confirmationOpen &&
    !cancelledDraft.confirmationOpen &&
    cancelledDraft.decisions === confirmationDraft.decisions,
  "Q08l_first_click_or_cancel_wrote_or_lost_draft",
);
const finalizeRequest = buildEvidenceFactReviewFinalizeRequest(
  FIXTURE,
  confirmationDraft,
);
assert(finalizeRequest !== null, "Q08m_complete_finalize_payload_missing");
const firstAttempt = selectEvidenceFactReviewFinalizeAttempt(
  null,
  finalizeRequest,
  () => "fact-round-attempt-1",
);
const retryAttempt = selectEvidenceFactReviewFinalizeAttempt(
  firstAttempt,
  finalizeRequest,
  () => "must-not-be-used",
);
const changedRequest: EvidenceFactReviewRoundFinalizeRequest = {
  ...finalizeRequest,
  decisions: finalizeRequest.decisions.map((decision) =>
    decision.subjectRef === eanSubjectRef
      ? { subjectRef: eanSubjectRef, disposition: "ACCEPTED" as const }
      : decision
  ),
};
const changedAttempt = selectEvidenceFactReviewFinalizeAttempt(
  retryAttempt,
  changedRequest,
  () => "fact-round-attempt-2",
);
assert(
  firstAttempt === retryAttempt &&
    changedAttempt.idempotencyKey === "fact-round-attempt-2" &&
    Object.keys(finalizeRequest).sort().join("|") ===
      "caseRef|decisions|manifestHash|manifestVersion" &&
    finalizeRequest.decisions.length === FIXTURE.reviewSubjects.length &&
    !JSON.stringify(finalizeRequest).match(
      /reviewer|workforce|tenant|capability|timestamp/i,
    ),
  "Q08n_idempotency_or_authority_free_payload_invalid",
);

const finalizeCalls: Array<{ url: string; init?: RequestInit }> = [];
const finalizeResult = await finalizeEvidenceFactReviewRound({
  accessToken: "proof-access-token",
  idempotencyKey: firstAttempt.idempotencyKey,
  request: finalizeRequest,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: async (input, init) => {
    postCount += 1;
    finalizeCalls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        schemaVersion: "evidence-fact-review-round-finalization-v1",
        caseRef: CASE_REF,
        roundRef: "a8000000-0000-4000-8000-000000000011",
        manifestVersion: FIXTURE.reviewManifestVersion,
        manifestHash: FIXTURE.reviewManifestHash,
        outcome: "CORRECTIONS_REQUIRED",
        finalizedAt: "2026-08-18T12:10:00.000Z",
        result: "FINALIZED",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  },
});
const finalizeHeaders = new Headers(finalizeCalls[0]?.init?.headers);
assert(
  finalizeResult.ok && Number(postCount) === 1 && finalizeCalls.length === 1 &&
    finalizeCalls[0].url.endsWith(
      "/api-app-evidence-review-round-finalize",
    ) && finalizeCalls[0].init?.method === "POST" &&
    finalizeHeaders.get("authorization") === "Bearer proof-access-token" &&
    finalizeHeaders.get("apikey") === "proof-anon-key" &&
    finalizeHeaders.get("idempotency-key") === "fact-round-attempt-1" &&
    JSON.stringify(JSON.parse(String(finalizeCalls[0].init?.body))) ===
      JSON.stringify(finalizeRequest),
  "Q08o_final_confirm_not_exactly_one_post_or_payload_invalid",
);
const staleResult = await finalizeEvidenceFactReviewRound({
  accessToken: "proof-access-token",
  idempotencyKey: "stale-attempt",
  request: finalizeRequest,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: async () => new Response("{}", { status: 409 }),
});
const submittedDraft = reduceEvidenceFactReviewDraft(confirmationDraft, {
  type: "submitting",
});
const failedDraft = reduceEvidenceFactReviewDraft(submittedDraft, {
  type: "ordinary_failure",
  message: "Review afronden is niet gelukt. Probeer het opnieuw.",
});
const staleDraft = reduceEvidenceFactReviewDraft(submittedDraft, {
  type: "discard_stale",
});
assert(
  !staleResult.ok && staleResult.kind === "stale" &&
    failedDraft.decisions === submittedDraft.decisions &&
    failedDraft.confirmationOpen && !failedDraft.submitting &&
    Object.keys(staleDraft.decisions).length === 0 &&
    staleDraft.notice === "Dossier is gewijzigd. Controleer opnieuw.",
  "Q08p_stale_or_ordinary_failure_recovery_invalid",
);

let releaseFinalize: (
  value: EvidenceFactReviewRoundFinalizeResult,
) => void = () => undefined;
let concurrentFinalizeCalls = 0;
let successfulRefreshes = 0;
let successfulInvalidations = 0;
const successfulActions: unknown[] = [];
const successfulRuntime = {
  attempt: { current: null },
  submitting: { current: false },
  dispatch: (action: unknown) => successfulActions.push(action),
  finalizeReview: () => {
    concurrentFinalizeCalls += 1;
    return new Promise<EvidenceFactReviewRoundFinalizeResult>((resolve) => {
      releaseFinalize = resolve;
    });
  },
  invalidateIdentity: () => {
    successfulInvalidations += 1;
  },
  onRefresh: () => {
    successfulRefreshes += 1;
  },
};
const firstConcurrentSubmit = submitEvidenceFactReviewRound(
  FIXTURE,
  true,
  confirmationDraft,
  successfulRuntime,
);
await Promise.resolve();
const duplicateConcurrentSubmit = submitEvidenceFactReviewRound(
  FIXTURE,
  true,
  confirmationDraft,
  successfulRuntime,
);
assert(
  concurrentFinalizeCalls === 1 && successfulRuntime.submitting.current &&
    successfulActions.some((action) =>
      (action as { type?: string }).type === "submitting"
    ),
  "Q08q_concurrent_submit_not_locked",
);
releaseFinalize({
  ok: true,
  result: "FINALIZED",
  outcome: "CORRECTIONS_REQUIRED",
});
await Promise.all([firstConcurrentSubmit, duplicateConcurrentSubmit]);
assert(
  concurrentFinalizeCalls === 1 && successfulRefreshes === 1 &&
    successfulInvalidations === 1,
  "Q08r_success_did_not_refresh_authoritative_readmodel_once",
);

const failureActions: unknown[] = [];
let failureRefreshes = 0;
const failureRuntime = {
  attempt: { current: null },
  submitting: { current: false },
  dispatch: (action: unknown) => failureActions.push(action),
  finalizeReview: () => Promise.reject(new Error("proof failure")),
  invalidateIdentity: noop,
  onRefresh: () => {
    failureRefreshes += 1;
  },
};
await submitEvidenceFactReviewRound(
  FIXTURE,
  true,
  confirmationDraft,
  failureRuntime,
);
assert(
  !failureRuntime.submitting.current && failureRefreshes === 0 &&
    failureActions.some((action) =>
      (action as { type?: string }).type === "ordinary_failure"
    ),
  "Q08s_thrown_failure_not_recoverable",
);

const staleActions: unknown[] = [];
let staleSubmitRefreshes = 0;
const staleRuntime = {
  attempt: { current: null },
  submitting: { current: false },
  dispatch: (action: unknown) => staleActions.push(action),
  finalizeReview: async () => ({ ok: false as const, kind: "stale" as const }),
  invalidateIdentity: noop,
  onRefresh: () => {
    staleSubmitRefreshes += 1;
  },
};
await submitEvidenceFactReviewRound(
  FIXTURE,
  true,
  confirmationDraft,
  staleRuntime,
);
assert(
  !staleRuntime.submitting.current && staleSubmitRefreshes === 1 &&
    staleActions.some((action) =>
      (action as { type?: string }).type === "discard_stale"
    ),
  "Q08t_stale_submit_did_not_discard_and_refresh",
);

const previewRequests: Array<{ url: string; init?: RequestInit }> = [];
assert(previewRequests.length === 0, "Q09_eager_preview_request_present");
const previewResult = await loadEvidenceReviewPreview({
  accessToken: "proof-access-token",
  caseRef: CASE_REF,
  evidenceVersionRef: ENERGY_VERSION,
  runtimeConfig: {
    anonKey: "proof-anon-key",
    apiBaseUrl: "https://local-proof.invalid/functions/v1",
  },
  fetchImpl: async (input, init) => {
    const url = String(input);
    previewRequests.push({ url, init });
    if (url.includes("/storage/v1/object/sign/")) {
      return new Response(
        new Blob(["%PDF-proof"], {
          type: "application/pdf",
        }),
        {
          status: 200,
          headers: { "content-type": "application/pdf" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        schemaVersion: "evidence-review-preview-v1",
        evidenceVersionRef: ENERGY_VERSION,
        filename: "energy.pdf",
        mimeType: "application/pdf",
        signedUrl:
          "https://local-proof.invalid/storage/v1/object/sign/private/file.pdf?token=secret",
        expiresAt: "2026-08-18T12:02:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});
assert(
  previewResult.ok && Number(previewRequests.length) === 2 &&
    previewRequests[0].url ===
      `https://local-proof.invalid/functions/v1/api-app-evidence-review-preview?caseRef=${CASE_REF}&evidenceVersionRef=${ENERGY_VERSION}` &&
    previewRequests[1].url.startsWith(
      "https://local-proof.invalid/storage/v1/object/sign/",
    ) &&
    previewRequests[0].init?.cache === "no-store" &&
    previewRequests[1].init?.cache === "no-store" &&
    previewResult.blob.type === "application/pdf" &&
    previewResult.blob.size > 0 &&
    !("signedUrl" in previewResult),
  "Q10_on_demand_memory_preview_invalid",
);

const previewStates: EvidenceReviewPreviewState[] = [];
const createdUrls: string[] = [];
const revokedUrls: string[] = [];
let previewLoads = 0;
const session = createEvidenceReviewPreviewSession({
  load: async (evidenceVersionRef) => {
    previewLoads += 1;
    return {
      ok: true,
      blob: new Blob([`%PDF-${evidenceVersionRef}`], {
        type: "application/pdf",
      }),
      filename: `${evidenceVersionRef}.pdf`,
      expiresAt: "2026-08-18T12:02:00.000Z",
    };
  },
  publish: (state) => previewStates.push(state),
  createObjectUrl: () => {
    const url = `blob:proof-${createdUrls.length + 1}`;
    createdUrls.push(url);
    return url;
  },
  revokeObjectUrl: (url) => revokedUrls.push(url),
});
await session.select({
  evidenceVersionRef: ENERGY_VERSION,
  label: "Energiedocument",
});
session.close();
await session.select({
  evidenceVersionRef: ENERGY_VERSION,
  label: "Energiedocument",
});
session.dispose();
assert(
  previewLoads === 2 &&
    createdUrls.join("|") === "blob:proof-1|blob:proof-2" &&
    revokedUrls.join("|") === "blob:proof-1|blob:proof-2" &&
    previewStates.filter((state) => state.status === "ready").length === 2 &&
    previewStates.some((state) => state.status === "idle"),
  "Q11_close_reopen_or_disposal_invalid",
);

const energyStates: EvidenceReviewPreviewState[] = [];
const installationStates: EvidenceReviewPreviewState[] = [];
const independentRevocations: string[] = [];
const energySession = createEvidenceReviewPreviewSession({
  load: previewSuccess,
  publish: (state) => energyStates.push(state),
  createObjectUrl: () => "blob:energy",
  revokeObjectUrl: (url) => independentRevocations.push(url),
});
const installationSession = createEvidenceReviewPreviewSession({
  load: previewSuccess,
  publish: (state) => installationStates.push(state),
  createObjectUrl: () => "blob:installation",
  revokeObjectUrl: (url) => independentRevocations.push(url),
});
await energySession.select({
  evidenceVersionRef: ENERGY_VERSION,
  label: "Energiedocument",
});
assert(
  energyStates[energyStates.length - 1]?.status === "ready" &&
    installationStates.length === 0,
  "Q11a_energy_preview_changed_installation_section",
);
await installationSession.select({
  evidenceVersionRef: INSTALLATION_VERSION,
  label: "Installatiefactuur",
});
energySession.close();
assert(
  energyStates[energyStates.length - 1]?.status === "idle" &&
    installationStates[installationStates.length - 1]?.status === "ready" &&
    independentRevocations.join("|") === "blob:energy",
  "Q11b_independent_preview_state_invalid",
);
energySession.dispose();
installationSession.dispose();
assert(
  independentRevocations.join("|") === "blob:energy|blob:installation",
  "Q11c_independent_unmount_cleanup_invalid",
);

let failPreview = true;
const recoveryStates: EvidenceReviewPreviewState[] = [];
const recoverySession = createEvidenceReviewPreviewSession({
  load: async () =>
    failPreview
      ? {
        ok: false,
        error: { code: "service_unavailable", message: "Preview mislukt." },
      }
      : await previewSuccess(),
  publish: (state) => recoveryStates.push(state),
  createObjectUrl: () => "blob:recovered",
  revokeObjectUrl: noop,
});
await recoverySession.select({
  evidenceVersionRef: ENERGY_VERSION,
  label: "Energiedocument",
});
failPreview = false;
await recoverySession.retry();
recoverySession.dispose();
assert(
  recoveryStates.some((state) => state.status === "error") &&
    recoveryStates[recoveryStates.length - 1]?.status === "ready",
  "Q11d_preview_error_recovery_invalid",
);

let releaseStaleLoad: () => void = noop;
const staleSignals: AbortSignal[] = [];
const staleStates: EvidenceReviewPreviewState[] = [];
const staleCreatedUrls: string[] = [];
const staleSession = createEvidenceReviewPreviewSession({
  load: async (_evidenceVersionRef, signal) => {
    staleSignals.push(signal);
    await new Promise<void>((resolve) => {
      releaseStaleLoad = resolve;
    });
    return await previewSuccess();
  },
  publish: (state) => staleStates.push(state),
  createObjectUrl: () => {
    staleCreatedUrls.push("blob:stale");
    return "blob:stale";
  },
  revokeObjectUrl: noop,
});
const staleSelection = staleSession.select({
  evidenceVersionRef: ENERGY_VERSION,
  label: "Energiedocument",
});
await Promise.resolve();
staleSession.close();
releaseStaleLoad();
await staleSelection;
staleSession.dispose();
assert(
  staleSignals[0]?.aborted === true &&
    staleStates[staleStates.length - 1]?.status === "idle" &&
    !staleStates.some((state) => state.status === "ready") &&
    staleCreatedUrls.length === 0,
  "Q11e_inflight_close_not_aborted_or_stale_response_published",
);

for (const status of [403, 404]) {
  const result = await loadEvidenceReviewCaseDetail({
    accessToken: "proof-access-token",
    caseRef: CASE_REF,
    runtimeConfig: {
      anonKey: "proof-anon-key",
      apiBaseUrl: "https://local-proof.invalid/functions/v1",
    },
    fetchImpl: async () => new Response("{}", { status }),
  });
  assert(
    !result.ok && result.error.code === "not_found_or_forbidden" &&
      result.error.message ===
        "Dit dossier is niet beschikbaar binnen uw toegewezen dossierscope.",
    `Q12_inaccessible_status_not_collapsed:${status}`,
  );
}

assert(
  !decodeEvidenceReviewCaseDetailResponse({
    ...FIXTURE,
    storagePath: "private/path",
  }).ok &&
    !decodeEvidenceReviewCaseDetailResponse({
      ...FIXTURE,
      case: { ...FIXTURE.case, canDecide: "true" },
    }).ok &&
    !decodeEvidenceReviewCaseDetailResponse({
      ...FIXTURE,
      case: { ...FIXTURE.case, canPublishCorrection: "true" },
    }).ok &&
    !decodeEvidenceReviewCaseDetailResponse({
      ...FIXTURE,
      evidence: [{ ...FIXTURE.evidence[0], reviewStatus: "APPROVED" }],
    }).ok &&
    !decodeEvidenceReviewCaseDetailResponse({
      ...FIXTURE,
      evidence: [{
        ...FIXTURE.evidence[0],
        canonicalFacts: [{
          category: "EAN",
          value: "871234567890123456",
          truthClass: "REVIEW_REQUIRED",
          reviewReason: "SERVER_CONFIRMED_CONFLICT",
        }],
      }],
    }).ok &&
    !decodeEvidenceReviewCaseDetailResponse({
      ...FIXTURE,
      evidence: [{
        ...FIXTURE.evidence[0],
        canonicalFacts: [{
          category: "EAN",
          value: "871234567890123456",
          truthClass: "REVIEW_REQUIRED",
          reviewReason: "USER_OVERRIDE",
        }],
      }],
    }).ok,
  "Q13_detail_decoder_not_fail_closed",
);

const [
  appSource,
  routeSource,
  navigationSource,
  guardSource,
  worklistSource,
  detailClientSource,
  detailHookSource,
  factDraftSource,
  correctionPublishHookSource,
  detailSource,
  statusSource,
  previewPaneSource,
  pageSource,
  downloadSource,
  layoutCss,
  componentsCss,
  detailEndpointSource,
  previewEndpointSource,
  finalizeEndpointSource,
  publishEndpointSource,
  customerHandoffEndpointSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/evidence-review/evidenceReviewRoutes.ts"),
  source("app/src/features/auth/postLoginNavigation.ts"),
  source("app/src/features/operator/OperatorRouteGuard.tsx"),
  source("app/src/features/evidence-review/EvidenceReviewWorklistPage.tsx"),
  source("app/src/features/evidence-review/evidenceReviewDetailClient.ts"),
  source("app/src/features/evidence-review/useEvidenceReviewCaseDetail.ts"),
  source("app/src/features/evidence-review/useEvidenceFactReviewDraft.ts"),
  source("app/src/features/evidence-review/useEvidenceCorrectionPublish.ts"),
  source("app/src/features/evidence-review/EvidenceReviewCaseDetailPage.tsx"),
  source(
    "app/src/features/evidence-review/evidenceReviewStatusPresentation.ts",
  ),
  source("app/src/features/evidence-review/EvidenceReviewPreviewPane.tsx"),
  source("app/src/pages/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/features/documents/documentDownloadClient.ts"),
  source("app/src/styles/layout.css"),
  source("app/src/styles/components.css"),
  source("supabase/functions/api-app-evidence-review-case-detail/index.ts"),
  source("supabase/functions/api-app-evidence-review-preview/index.ts"),
  source("supabase/functions/api-app-evidence-review-round-finalize/index.ts"),
  source(
    "supabase/functions/api-app-evidence-review-correction-publish/index.ts",
  ),
  source("supabase/functions/api-app-customer-correction-handoff/index.ts"),
]);
assert(
  appSource.includes("parseEvidenceReviewDetailRoute(path)") &&
    appSource.includes("EvidenceReviewCaseDetailPage") &&
    routeSource.includes("DETAIL_ROUTE_RE") &&
    pageSource.includes("OperatorRouteGuard") &&
    pageSource.includes('surface="tenant_operator"') &&
    pageSource.includes("returnTo={currentPath}") &&
    guardSource.includes("buildInternalLoginRoute(returnTo)") &&
    navigationSource.includes("parseEvidenceReviewDetailRoute(value)"),
  "Q14_route_auth_return_or_refresh_boundary_invalid",
);
assert(
  worklistSource.includes("buildEvidenceReviewDetailRoute") &&
    worklistSource.includes("Dossier openen") &&
    detailClientSource.includes("api-app-evidence-review-case-detail") &&
    detailClientSource.includes("api-app-evidence-review-preview") &&
    detailClientSource.includes("api-app-evidence-review-round-finalize") &&
    detailClientSource.includes(
      "api-app-evidence-review-correction-publish",
    ) &&
    detailHookSource.split("loadEvidenceReviewCaseDetail(config)").length -
          1 === 1 &&
    detailHookSource.includes("IN_FLIGHT_DETAIL_READS") &&
    detailHookSource.includes("loadEvidenceReviewCaseDetailOnce") &&
    !detailHookSource.includes("setInterval") &&
    !detailHookSource.includes("setTimeout") &&
    !correctionPublishHookSource.includes("setInterval") &&
    !correctionPublishHookSource.includes("setTimeout"),
  "Q15_one_load_no_polling_or_navigation_invalid",
);
assert(
  detailSource.includes("function EvidenceReviewSection") &&
    detailSource.includes("useEvidenceReviewPreviewSession") &&
    detailSource.includes("key={evidence.evidenceVersionRef}") &&
    detailSource.includes("preview.close()") &&
    detailSource.includes('open ? "Document sluiten" : "Document bekijken"') &&
    detailSource.includes("evidence-review-section__body--open") &&
    !detailSource.includes("evidence-review-workspace") &&
    !detailSource.includes("Aangegeven dossiercontext") &&
    !detailSource.includes(
      "Actuele gegevens uit het geautoriseerde dossier.",
    ) &&
    previewPaneSource.includes("URL.createObjectURL") &&
    previewPaneSource.includes("URL.revokeObjectURL") &&
    previewPaneSource.includes("new AbortController()") &&
    previewPaneSource.includes("close: () => void") &&
    previewPaneSource.includes("activeRequest?.abort()") &&
    previewPaneSource.includes("<iframe") &&
    detailClientSource.includes("normalizeSignedDownloadUrlForBrowser") &&
    downloadSource.includes("normalizeSignedDownloadUrlForBrowser") &&
    detailClientSource.includes('cache: "no-store"') &&
    detailClientSource.includes("documentResponse.blob()") &&
    !detailClientSource.includes("openBrowserUrlInNewTab") &&
    !detailClientSource.includes("window.open") &&
    !previewPaneSource.includes("window.open") &&
    !/(localStorage|sessionStorage|indexedDB|caches\.open|CacheStorage)/.test(
      detailSource + detailClientSource + factDraftSource + previewPaneSource,
    ),
  "Q16_per_evidence_memory_preview_lifecycle_invalid",
);
assert(
  [
    detailClientSource,
    detailHookSource,
    factDraftSource,
    correctionPublishHookSource,
    detailSource,
    pageSource,
  ].every((
    value,
  ) =>
    !/(role\s*===|email\s*===|caseOwner|case_owner|workforceId|workforce_id|tenantId|tenant_id)/
      .test(value)
  ) &&
    detailEndpointSource.includes("app_evidence_review_case_detail_read_v7") &&
    finalizeEndpointSource.includes("app_evidence_review_round_finalize_v1") &&
    publishEndpointSource.includes(
      "app_evidence_review_correction_publish_v2",
    ) &&
    previewEndpointSource.includes(
      "app_evidence_review_preview_source_read_v1",
    ) &&
    previewEndpointSource.includes("createSignedUrl"),
  "Q17_client_authority_or_backend_reuse_invalid",
);
assert(
  detailSource.includes("portal-content-stack") &&
    detailSource.includes("portal-card-compact") &&
    detailSource.includes("evidence-review-section-list") &&
    detailSource.includes("fact-table--evidence-review") &&
    detailSource.includes('<span role="columnheader">Reden</span>') &&
    detailSource.includes('<span role="columnheader">Beoordeling</span>') &&
    detailSource.includes("status-pill") &&
    detailSource.includes("button button-secondary button-compact") &&
    layoutCss.includes("@media (max-width: 620px)") &&
    componentsCss.includes(".fact-table--evidence-review") &&
    componentsCss.includes(".portal-card-compact") &&
    componentsCss.includes(".evidence-review-section__body--open") &&
    componentsCss.includes("grid-template-columns: minmax(0, 1fr)") &&
    !componentsCss.includes(
      "grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.92fr)",
    ) &&
    detailSource.indexOf("<EvidenceReviewPreviewPane") <
      detailSource.indexOf("<EvidenceFacts") &&
    componentsCss.includes(
      ".evidence-review-section__body--open .status-pill",
    ) &&
    componentsCss.includes("white-space: normal") &&
    componentsCss.includes("overflow-wrap: anywhere") &&
    componentsCss.includes(".evidence-review-preview-frame") &&
    componentsCss.includes(".fact-review-choice--selected") &&
    componentsCss.includes(".fact-review-correction-row") &&
    componentsCss.includes(".evidence-review-final-action") &&
    !detailSource.includes("style={{") &&
    !previewPaneSource.includes("style={{"),
  "Q18_shared_css_or_responsive_boundary_invalid",
);
assert(
  !detailSource.includes("evidence.review.decide") &&
    !detailSource.includes("evidence.review.correction.publish") &&
    !correctionPublishHookSource.includes(
      "evidence.review.correction.publish",
    ) &&
    !correctionPublishHookSource.includes("canDecide") &&
    !correctionPublishHookSource.includes("email") &&
    !previewPaneSource.includes("evidence.review.decide") &&
    !detailSource.includes("CheckExecution") &&
    !detailSource.includes("parser") &&
    !detailClientSource.includes("storagePath") &&
    !detailClientSource.includes("storage_path") &&
    !detailClientSource.includes("bucket") &&
    detailSource.includes('href="/beheer/dossiers"') &&
    Object.keys(EVIDENCE_REVIEW_REASON_LABELS).length === 6 &&
    EVIDENCE_REVIEW_REASON_LABELS.GENERIC_REVIEW_REQUIRED ===
      "Historisch niet vastgelegd",
  "Q19_scope_or_storage_privacy_invalid",
);

assert(
  detailSource.includes("buildEvidenceFactReviewRows") &&
    detailSource.includes(
      "subject.evidenceVersionRef === evidence.evidenceVersionRef",
    ) &&
    detailSource.includes("subject.factCategory === fact.category") &&
    !detailSource.includes("FRS-") &&
    detailSource.includes("maxLength={1000}") &&
    detailSource.includes("Kies een reden") &&
    detailSource.includes("Alles akkoord. Review afronden?") &&
    detailSource.includes("Ja, afronden") &&
    detailSource.includes("Annuleren") &&
    detailSource.includes("currentReviewRound") &&
    detailSource.includes("overallReviewStatus") &&
    detailSource.includes(
      "evidenceReviewFactStatusPresentation(row, finalized)",
    ) &&
    detailSource.includes("Dossierfase:") &&
    statusSource.includes("ENVAL beoordelen") &&
    statusSource.includes("Correctie nodig") &&
    statusSource.includes("Wacht op klant") &&
    statusSource.includes("Afgerond") &&
    detailSource.includes("Naar klant sturen") &&
    detailSource.includes("Correcties naar klant sturen?") &&
    detailSource.includes("Bericht aan klant") &&
    detailSource.includes("Ja, sturen") &&
    !detailSource.includes("{evidence.reviewStatus}") &&
    !detailSource.includes("Correcties nodig") &&
    factDraftSource.includes('reviewerSuggestion === "ACCEPT"') &&
    factDraftSource.includes("Dossier is gewijzigd. Controleer opnieuw.") &&
    factDraftSource.includes("attempt.current") &&
    factDraftSource.includes("onRefresh()") &&
    detailSource.includes('review.state.submitting ? "Bezig…"') &&
    !factDraftSource.includes("fetch(") &&
    !factDraftSource.includes("setInterval") &&
    !factDraftSource.includes("setTimeout") &&
    correctionPublishHookSource.includes("canPublishCorrection") &&
    correctionPublishHookSource.includes(
      "Dossier is gewijzigd. Controleer opnieuw.",
    ) &&
    correctionPublishHookSource.includes("idempotencyKey") &&
    correctionPublishHookSource.includes("dependencies.refresh()") &&
    !correctionPublishHookSource.includes("fetch(") &&
    !correctionPublishHookSource.includes("localStorage") &&
    !correctionPublishHookSource.includes("sessionStorage") &&
    !detailClientSource.includes("api-app-customer-correction-handoff") &&
    customerHandoffEndpointSource.includes(
      "app_customer_correction_handoff_read_v6",
    ) &&
    !detailClientSource.includes("api-app-evidence-review-decision") &&
    !detailSource.includes("api-app-evidence-review-decision") &&
    !factDraftSource.includes("api-app-evidence-review-decision"),
  "Q20_fact_round_ui_network_or_authority_boundary_invalid",
);

console.log("EVIDENCE_REVIEW_CASE_DETAIL_UI_Q01_Q20=PASS");
Deno.exit(0);
