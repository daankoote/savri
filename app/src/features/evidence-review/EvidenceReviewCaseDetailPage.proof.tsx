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
  finalizeEvidenceFactReviewRound,
  type EvidenceReviewDetailSafeError,
  loadEvidenceReviewCaseDetail,
  loadEvidenceReviewPreview,
} from "./evidenceReviewDetailClient.ts";
import {
  createEvidenceReviewPreviewSession,
  type EvidenceReviewPreviewState,
} from "./EvidenceReviewPreviewPane.tsx";
import { loadEvidenceReviewCaseDetailOnce } from "./useEvidenceReviewCaseDetail.ts";
import {
  buildEvidenceFactReviewFinalizeRequest,
  initializeEvidenceFactReviewDraft,
  isEvidenceFactCorrectionValid,
  isEvidenceFactReviewDraftComplete,
  reduceEvidenceFactReviewDraft,
  selectEvidenceFactReviewFinalizeAttempt,
} from "./useEvidenceFactReviewDraft.ts";
import {
  buildEvidenceReviewDetailRoute,
  parseEvidenceReviewDetailRoute,
} from "./evidenceReviewRoutes.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
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
  schemaVersion: "evidence-review-case-detail-v3",
  asOf: "2026-08-18T12:00:00.000Z",
  case: {
    caseRef: CASE_REF,
    lifecycle: "submitted_for_review",
    canDecide: true,
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
      caseRef={CASE_REF}
      finalizeReview={noFinalize}
      loadPreview={previewSuccess}
      onBack={noop}
      onRefresh={noop}
      state={state}
    />,
  );
}

const detailRoute = buildEvidenceReviewDetailRoute(CASE_REF);
assert(
  detailRoute === `/intern/dossiers/${CASE_REF}` &&
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
assert(
  readyHtml.includes(CASE_REF) &&
    readyHtml.includes("Ingediend voor beoordeling") &&
    readyHtml.split("Document bekijken").length - 1 === 2 &&
    readyHtml.split(">PENDING<").length - 1 === 2 &&
    readyHtml.split('role="columnheader"').length - 1 === 10 &&
    !readyHtml.includes("Aangegeven dossiercontext") &&
    !readyHtml.includes(">Bewijsstukken<") &&
    !readyHtml.includes("Actuele gegevens uit het geautoriseerde dossier.") &&
    !readyHtml.includes("Documentweergave") &&
    !readyHtml.includes("Pilotnaam") && !readyHtml.includes("Pilotadres"),
  "Q04_pilot_detail_or_two_evidence_cards_invalid",
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
  readyHtml.split(">Accepteren<").length - 1 === 2 &&
    readyHtml.split(">Correctie<").length - 1 === 2 &&
    readyHtml.includes('aria-pressed="true"') &&
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
assert(
  !viewOnlyHtml.includes(">Accepteren<") &&
    !viewOnlyHtml.includes(">Correctie<") &&
    !viewOnlyHtml.includes("Review afronden") &&
    !finalizedHtml.includes(">Accepteren<") &&
    !finalizedHtml.includes(">Correctie<") &&
    finalizedHtml.includes("Geaccepteerd") &&
    finalizedHtml.includes("Correctie nodig") &&
    finalizedHtml.includes("Gegeven onjuist") &&
    finalizedHtml.includes("Controleer de EAN en pas deze aan.") &&
    finalizedHtml.includes("Correcties nodig"),
  "Q06a_view_only_or_finalized_rendering_invalid",
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
assert(
  detailResult.ok && detailFetches === 1 &&
    detailResult.value.case.canDecide === true &&
    detailUrl ===
      `https://local-proof.invalid/functions/v1/api-app-evidence-review-case-detail?caseRef=${CASE_REF}` &&
    detailInit?.method === "GET" && !detailInit.body &&
    detailHeaders.get("authorization") === "Bearer proof-access-token" &&
    detailHeaders.get("apikey") === "proof-anon-key",
  "Q08_exact_single_detail_get_invalid",
);

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
const eanSubjectRef = FIXTURE.reviewSubjects[0].subjectRef;
const brandSubjectRef = FIXTURE.reviewSubjects[1].subjectRef;
assert(
  initialDraft.decisions[eanSubjectRef].disposition === "UNANSWERED" &&
    initialDraft.decisions[brandSubjectRef].disposition === "ACCEPTED" &&
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
    return new Response(JSON.stringify({
      schemaVersion: "evidence-fact-review-round-finalization-v1",
      caseRef: CASE_REF,
      roundRef: "a8000000-0000-4000-8000-000000000011",
      manifestVersion: FIXTURE.reviewManifestVersion,
      manifestHash: FIXTURE.reviewManifestHash,
      outcome: "CORRECTIONS_REQUIRED",
      finalizedAt: "2026-08-18T12:10:00.000Z",
      result: "FINALIZED",
    }), { status: 201, headers: { "content-type": "application/json" } });
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
  detailSource,
  previewPaneSource,
  pageSource,
  downloadSource,
  layoutCss,
  componentsCss,
  detailEndpointSource,
  previewEndpointSource,
  finalizeEndpointSource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/evidence-review/evidenceReviewRoutes.ts"),
  source("app/src/features/auth/postLoginNavigation.ts"),
  source("app/src/features/auth/DashboardRouteGuard.tsx"),
  source("app/src/features/evidence-review/EvidenceReviewWorklistPage.tsx"),
  source("app/src/features/evidence-review/evidenceReviewDetailClient.ts"),
  source("app/src/features/evidence-review/useEvidenceReviewCaseDetail.ts"),
  source("app/src/features/evidence-review/useEvidenceFactReviewDraft.ts"),
  source("app/src/features/evidence-review/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/features/evidence-review/EvidenceReviewPreviewPane.tsx"),
  source("app/src/pages/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/features/documents/documentDownloadClient.ts"),
  source("app/src/styles/layout.css"),
  source("app/src/styles/components.css"),
  source("supabase/functions/api-app-evidence-review-case-detail/index.ts"),
  source("supabase/functions/api-app-evidence-review-preview/index.ts"),
  source("supabase/functions/api-app-evidence-review-round-finalize/index.ts"),
]);
assert(
  appSource.includes("parseEvidenceReviewDetailRoute(path)") &&
    appSource.includes("EvidenceReviewCaseDetailPage") &&
    routeSource.includes("DETAIL_ROUTE_RE") &&
    pageSource.includes("DashboardRouteGuard") &&
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
    detailHookSource.split("loadEvidenceReviewCaseDetail(config)").length -
          1 === 1 &&
    detailHookSource.includes("IN_FLIGHT_DETAIL_READS") &&
    detailHookSource.includes("loadEvidenceReviewCaseDetailOnce") &&
    !detailHookSource.includes("setInterval") &&
    !detailHookSource.includes("setTimeout"),
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
  [detailClientSource, detailHookSource, factDraftSource, detailSource, pageSource].every((
    value,
  ) =>
    !/(role\s*===|email\s*===|caseOwner|case_owner|workforceId|workforce_id|tenantId|tenant_id)/
      .test(value)
  ) &&
    detailEndpointSource.includes("app_evidence_review_case_detail_read_v5") &&
    finalizeEndpointSource.includes("app_evidence_review_round_finalize_v1") &&
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
    !previewPaneSource.includes("evidence.review.decide") &&
    !detailSource.includes("CheckExecution") &&
    !detailSource.includes("parser") &&
    !detailClientSource.includes("storagePath") &&
    !detailClientSource.includes("storage_path") &&
    !detailClientSource.includes("bucket") &&
    detailSource.includes('href="/intern/dossiers"') &&
    Object.keys(EVIDENCE_REVIEW_REASON_LABELS).length === 6 &&
    EVIDENCE_REVIEW_REASON_LABELS.GENERIC_REVIEW_REQUIRED ===
      "Historisch niet vastgelegd",
  "Q19_scope_or_storage_privacy_invalid",
);

assert(
  detailSource.includes("buildEvidenceFactReviewRows") &&
    detailSource.includes("subject.evidenceVersionRef === evidence.evidenceVersionRef") &&
    detailSource.includes("subject.factCategory === fact.category") &&
    !detailSource.includes("FRS-") &&
    detailSource.includes("maxLength={1000}") &&
    detailSource.includes("Kies een reden") &&
    detailSource.includes("Alles akkoord. Review afronden?") &&
    detailSource.includes("Ja, afronden") &&
    detailSource.includes("Annuleren") &&
    detailSource.includes("currentReviewRound") &&
    factDraftSource.includes("reviewerSuggestion === \"ACCEPT\"") &&
    factDraftSource.includes("Dossier is gewijzigd. Controleer opnieuw.") &&
    factDraftSource.includes("attempt.current") &&
    factDraftSource.includes("onRefresh()") &&
    !factDraftSource.includes("fetch(") &&
    !factDraftSource.includes("setInterval") &&
    !factDraftSource.includes("setTimeout") &&
    !detailClientSource.includes("api-app-evidence-review-decision") &&
    !detailSource.includes("api-app-evidence-review-decision") &&
    !factDraftSource.includes("api-app-evidence-review-decision"),
  "Q20_fact_round_ui_network_or_authority_boundary_invalid",
);

console.log("EVIDENCE_REVIEW_CASE_DETAIL_UI_Q01_Q20=PASS");
Deno.exit(0);
