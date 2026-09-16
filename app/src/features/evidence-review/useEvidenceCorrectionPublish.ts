import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceReviewCaseDetailResponseV1 } from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import {
  isCorrectionCoverMessage,
} from "../../../../supabase/functions/_shared/app_evidence_review_correction_handoff.ts";
import type {
  EvidenceReviewCorrectionPublishCall,
  EvidenceReviewCorrectionPublishRequest,
} from "./evidenceReviewDetailClient.ts";

export type EvidenceCorrectionPublishState = Readonly<{
  coverMessage: string;
  confirmationOpen: boolean;
  submitting: boolean;
  error: string | null;
  notice: string | null;
}>;

type EvidenceCorrectionPublishAttempt = Readonly<{
  fingerprint: string;
  idempotencyKey: string;
}>;

type EvidenceCorrectionPublishSessionDependencies = Readonly<{
  send: EvidenceReviewCorrectionPublishCall;
  refresh: () => void;
  publish: (state: EvidenceCorrectionPublishState) => void;
  createIdempotencyKey?: () => string;
}>;

export type EvidenceCorrectionPublishSession = Readonly<{
  updateDetail: (detail: EvidenceReviewCaseDetailResponseV1 | null) => void;
  openConfirmation: () => void;
  cancelConfirmation: () => void;
  setCoverMessage: (value: string) => void;
  confirm: () => Promise<void>;
  dispose: () => void;
}>;

export const EMPTY_EVIDENCE_CORRECTION_PUBLISH_STATE:
  EvidenceCorrectionPublishState = Object.freeze({
    coverMessage: "",
    confirmationOpen: false,
    submitting: false,
    error: null,
    notice: null,
  });

export const INFORMATION_REQUEST_CORRECTION_BLOCK_MESSAGE =
  "Er staat een vraag aan de klant open. Rond deze af of trek deze in voordat u correcties verstuurt.";

export function isEvidenceCorrectionBlockedByInformationRequest(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
): boolean {
  return Boolean(
    detail?.case.canPublishCorrection &&
      detail.overallReviewStatus === "CORRECTION_REQUIRED" &&
      detail.currentReviewRound?.outcome === "CORRECTIONS_REQUIRED" &&
      detail.informationRequest.request,
  );
}

export function canPublishEvidenceCorrection(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
): boolean {
  return Boolean(
    detail?.case.canPublishCorrection &&
      detail.overallReviewStatus === "CORRECTION_REQUIRED" &&
      detail.currentReviewRound?.outcome === "CORRECTIONS_REQUIRED" &&
      !detail.informationRequest.request,
  );
}

function requestForDetail(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
  coverMessage: string,
): EvidenceReviewCorrectionPublishRequest | null {
  if (
    !canPublishEvidenceCorrection(detail) || !detail?.currentReviewRound ||
    !isCorrectionCoverMessage(coverMessage)
  ) {
    return null;
  }
  return Object.freeze({
    caseRef: detail.case.caseRef,
    coverMessage,
    roundRef: detail.currentReviewRound.roundRef,
  });
}

function detailIdentity(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
): string {
  if (!detail) return "";
  return [
    detail.case.caseRef,
    detail.currentReviewRound?.roundRef ?? "none",
    detail.overallReviewStatus,
    detail.case.canPublishCorrection ? "publish" : "view",
    detail.informationRequest.request?.requestRef ?? "no-request",
    detail.informationRequest.request?.state ?? "no-request-state",
  ].join("|");
}

export function createEvidenceCorrectionPublishSession(
  dependencies: EvidenceCorrectionPublishSessionDependencies,
): EvidenceCorrectionPublishSession {
  const createIdempotencyKey = dependencies.createIdempotencyKey ??
    (() => crypto.randomUUID());
  let detail: EvidenceReviewCaseDetailResponseV1 | null = null;
  let identity = "";
  let state = EMPTY_EVIDENCE_CORRECTION_PUBLISH_STATE;
  let attempt: EvidenceCorrectionPublishAttempt | null = null;
  let submitting = false;
  let generation = 0;
  let disposed = false;

  const emit = (next: EvidenceCorrectionPublishState) => {
    if (disposed) return;
    state = Object.freeze(next);
    dependencies.publish(state);
  };

  return Object.freeze({
    updateDetail: (nextDetail) => {
      if (disposed || !nextDetail) return;
      const nextIdentity = detailIdentity(nextDetail);
      detail = nextDetail;
      if (identity === nextIdentity) return;
      identity = nextIdentity;
      generation += 1;
      submitting = false;
      attempt = null;
      emit({
        ...EMPTY_EVIDENCE_CORRECTION_PUBLISH_STATE,
        notice: state.notice,
      });
    },
    openConfirmation: () => {
      if (disposed || submitting || !canPublishEvidenceCorrection(detail)) {
        return;
      }
      emit({
        ...state,
        confirmationOpen: true,
        error: null,
      });
    },
    cancelConfirmation: () => {
      if (disposed || submitting) return;
      emit({
        ...EMPTY_EVIDENCE_CORRECTION_PUBLISH_STATE,
        notice: state.notice,
      });
    },
    setCoverMessage: (value) => {
      if (disposed || submitting || !state.confirmationOpen) return;
      attempt = null;
      emit({ ...state, coverMessage: value, error: null });
    },
    confirm: async () => {
      const request = requestForDetail(detail, state.coverMessage);
      if (
        disposed || submitting || !state.confirmationOpen || !request
      ) {
        if (!disposed && state.confirmationOpen) {
          emit({
            ...state,
            error: "Vul een geldig bericht van maximaal 1.000 tekens in.",
          });
        }
        return;
      }
      const fingerprint = JSON.stringify(request);
      if (attempt?.fingerprint !== fingerprint) {
        attempt = Object.freeze({
          fingerprint,
          idempotencyKey: createIdempotencyKey(),
        });
      }
      const currentAttempt = attempt;
      const requestGeneration = generation;
      submitting = true;
      emit({ ...state, submitting: true, error: null });
      const result = await dependencies.send({
        request,
        idempotencyKey: currentAttempt.idempotencyKey,
      });
      if (disposed || requestGeneration !== generation) return;
      if (result.ok) {
        dependencies.refresh();
        return;
      }
      submitting = false;
      if (result.kind === "stale") {
        attempt = null;
        emit({
          ...EMPTY_EVIDENCE_CORRECTION_PUBLISH_STATE,
          notice: "Dossier is gewijzigd. Controleer opnieuw.",
        });
        dependencies.refresh();
        return;
      }
      if (result.kind === "information_request_active") {
        attempt = null;
        emit({
          ...EMPTY_EVIDENCE_CORRECTION_PUBLISH_STATE,
          error: INFORMATION_REQUEST_CORRECTION_BLOCK_MESSAGE,
        });
        dependencies.refresh();
        return;
      }
      emit({
        ...state,
        submitting: false,
        confirmationOpen: true,
        error: "Naar klant sturen is niet gelukt. Probeer het opnieuw.",
      });
    },
    dispose: () => {
      disposed = true;
      generation += 1;
      detail = null;
      attempt = null;
      submitting = false;
    },
  });
}

export function useEvidenceCorrectionPublish(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
  send: EvidenceReviewCorrectionPublishCall,
  refresh: () => void,
) {
  const [state, setState] = useState<EvidenceCorrectionPublishState>(
    EMPTY_EVIDENCE_CORRECTION_PUBLISH_STATE,
  );
  const sessionRef = useRef<EvidenceCorrectionPublishSession | null>(null);

  useEffect(() => {
    const session = createEvidenceCorrectionPublishSession({
      send,
      refresh,
      publish: setState,
    });
    sessionRef.current = session;
    session.updateDetail(detail);
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [send, refresh]);

  useEffect(() => sessionRef.current?.updateDetail(detail), [detail]);

  return Object.freeze({
    state,
    eligible: canPublishEvidenceCorrection(detail),
    blockedByInformationRequest:
      isEvidenceCorrectionBlockedByInformationRequest(detail),
    openConfirmation: useCallback(
      () => sessionRef.current?.openConfirmation(),
      [],
    ),
    cancelConfirmation: useCallback(
      () => sessionRef.current?.cancelConfirmation(),
      [],
    ),
    setCoverMessage: useCallback(
      (value: string) => sessionRef.current?.setCoverMessage(value),
      [],
    ),
    coverMessageValid: isCorrectionCoverMessage(state.coverMessage),
    confirm: useCallback(
      () => sessionRef.current?.confirm() ?? Promise.resolve(),
      [],
    ),
  });
}
