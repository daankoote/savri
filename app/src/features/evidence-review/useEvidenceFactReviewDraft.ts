import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  EvidenceFactReviewCorrectionReason,
  EvidenceFactReviewSubjectV1,
  EvidenceReviewCaseDetailResponseV1,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import type {
  EvidenceFactReviewRoundFinalizeCall,
  EvidenceFactReviewRoundFinalizeRequest,
} from "./evidenceReviewDetailClient.ts";

export type EvidenceFactReviewDraftDisposition =
  | "UNANSWERED"
  | "ACCEPTED"
  | "CORRECTION_REQUIRED";

export type EvidenceFactReviewDraftDecision = Readonly<{
  subjectRef: string;
  actionable: boolean;
  acceptAllowed: boolean;
  disposition: EvidenceFactReviewDraftDisposition;
  correctionReason: EvidenceFactReviewCorrectionReason | "";
  correctionInstruction: string;
}>;

export type EvidenceFactReviewDraftState = Readonly<{
  decisions: Readonly<Record<string, EvidenceFactReviewDraftDecision>>;
  confirmationOpen: boolean;
  submitting: boolean;
  error: string | null;
  notice: string | null;
}>;

type DraftAction =
  | Readonly<{ type: "accept"; subjectRef: string }>
  | Readonly<{ type: "correct"; subjectRef: string }>
  | Readonly<{
    type: "reason";
    subjectRef: string;
    value: EvidenceFactReviewCorrectionReason | "";
  }>
  | Readonly<{ type: "instruction"; subjectRef: string; value: string }>
  | Readonly<{ type: "open_confirmation" }>
  | Readonly<{ type: "cancel_confirmation" }>
  | Readonly<{ type: "submitting" }>
  | Readonly<{ type: "ordinary_failure"; message: string }>
  | Readonly<{ type: "discard_stale" }>
  | Readonly<{
    type: "reset";
    value: EvidenceFactReviewDraftState;
    preserveNotice: boolean;
  }>;

export type EvidenceFactReviewFinalizeAttempt = Readonly<{
  fingerprint: string;
  idempotencyKey: string;
}>;

export function isEvidenceFactReviewSubjectActionable(
  subject: Pick<EvidenceFactReviewSubjectV1, "truthClass">,
): boolean {
  return subject.truthClass === "REVIEW_REQUIRED";
}

export function canAcceptEvidenceFactReviewSubject(
  subject: Pick<
    EvidenceFactReviewSubjectV1,
    "required" | "reviewReasonAuthority" | "valueStatus"
  >,
): boolean {
  return !(
    subject.required && subject.valueStatus === "REQUIRED_MISSING" &&
    subject.reviewReasonAuthority === "SERVER_REQUIRED_SLOT"
  );
}

const EMPTY_DRAFT: EvidenceFactReviewDraftState = Object.freeze({
  decisions: Object.freeze({}),
  confirmationOpen: false,
  submitting: false,
  error: null,
  notice: null,
});

export function initializeEvidenceFactReviewDraft(
  subjects: readonly EvidenceFactReviewSubjectV1[],
  editable: boolean,
): EvidenceFactReviewDraftState {
  if (!editable) return EMPTY_DRAFT;
  const decisions: Record<string, EvidenceFactReviewDraftDecision> = {};
  for (const subject of subjects) {
    decisions[subject.subjectRef] = Object.freeze({
      subjectRef: subject.subjectRef,
      actionable: isEvidenceFactReviewSubjectActionable(subject),
      acceptAllowed: canAcceptEvidenceFactReviewSubject(subject),
      disposition: subject.reviewerSuggestion === "ACCEPT"
        ? "ACCEPTED"
        : "UNANSWERED",
      correctionReason: "",
      correctionInstruction: "",
    });
  }
  return Object.freeze({
    ...EMPTY_DRAFT,
    decisions: Object.freeze(decisions),
  });
}

function replaceDecision(
  state: EvidenceFactReviewDraftState,
  subjectRef: string,
  update: (
    current: EvidenceFactReviewDraftDecision,
  ) => EvidenceFactReviewDraftDecision,
): EvidenceFactReviewDraftState {
  const current = state.decisions[subjectRef];
  if (!current || !current.actionable || state.submitting) return state;
  return Object.freeze({
    ...state,
    decisions: Object.freeze({
      ...state.decisions,
      [subjectRef]: Object.freeze(update(current)),
    }),
    confirmationOpen: false,
    error: null,
    notice: null,
  });
}

export function isEvidenceFactCorrectionValid(
  decision: EvidenceFactReviewDraftDecision,
): boolean {
  const instruction = decision.correctionInstruction.trim();
  return decision.disposition === "CORRECTION_REQUIRED" &&
    decision.correctionReason !== "" && instruction.length > 0 &&
    instruction.length <= 1_000 && /[\p{L}\p{N}]/u.test(instruction);
}

export function isEvidenceFactReviewDraftComplete(
  subjects: readonly EvidenceFactReviewSubjectV1[],
  state: EvidenceFactReviewDraftState,
): boolean {
  if (
    subjects.length === 0 ||
    Object.keys(state.decisions).length !== subjects.length
  ) {
    return false;
  }
  const expected = new Set(subjects.map((subject) => subject.subjectRef));
  return Object.values(state.decisions).every((decision) =>
    expected.has(decision.subjectRef) &&
    ((decision.acceptAllowed && decision.disposition === "ACCEPTED") ||
      isEvidenceFactCorrectionValid(decision))
  );
}

export function reduceEvidenceFactReviewDraft(
  state: EvidenceFactReviewDraftState,
  action: DraftAction,
): EvidenceFactReviewDraftState {
  if (action.type === "accept") {
    if (!state.decisions[action.subjectRef]?.acceptAllowed) return state;
    return replaceDecision(
      state,
      action.subjectRef,
      (current) => ({
        ...current,
        disposition: "ACCEPTED",
        correctionReason: "",
        correctionInstruction: "",
      }),
    );
  }
  if (action.type === "correct") {
    return replaceDecision(state, action.subjectRef, (current) => ({
      ...current,
      disposition: "CORRECTION_REQUIRED",
    }));
  }
  if (action.type === "reason") {
    return replaceDecision(
      state,
      action.subjectRef,
      (current) =>
        current.disposition === "CORRECTION_REQUIRED"
          ? { ...current, correctionReason: action.value }
          : current,
    );
  }
  if (action.type === "instruction") {
    return replaceDecision(
      state,
      action.subjectRef,
      (current) =>
        current.disposition === "CORRECTION_REQUIRED"
          ? { ...current, correctionInstruction: action.value }
          : current,
    );
  }
  if (action.type === "open_confirmation") {
    return state.submitting
      ? state
      : Object.freeze({ ...state, confirmationOpen: true, error: null });
  }
  if (action.type === "cancel_confirmation") {
    return state.submitting
      ? state
      : Object.freeze({ ...state, confirmationOpen: false });
  }
  if (action.type === "submitting") {
    return state.submitting
      ? state
      : Object.freeze({ ...state, submitting: true, error: null });
  }
  if (action.type === "ordinary_failure") {
    return Object.freeze({
      ...state,
      submitting: false,
      confirmationOpen: true,
      error: action.message,
    });
  }
  if (action.type === "discard_stale") {
    return Object.freeze({
      ...EMPTY_DRAFT,
      notice: "Dossier is gewijzigd. Controleer opnieuw.",
    });
  }
  return Object.freeze({
    ...action.value,
    notice: action.preserveNotice ? state.notice : action.value.notice,
  });
}

export function buildEvidenceFactReviewFinalizeRequest(
  detail: EvidenceReviewCaseDetailResponseV1,
  state: EvidenceFactReviewDraftState,
): EvidenceFactReviewRoundFinalizeRequest | null {
  if (!isEvidenceFactReviewDraftComplete(detail.reviewSubjects, state)) {
    return null;
  }
  const decisions = detail.reviewSubjects.map((subject) => {
    const decision = state.decisions[subject.subjectRef];
    return decision.disposition === "ACCEPTED"
      ? Object.freeze({
        subjectRef: subject.subjectRef,
        disposition: "ACCEPTED" as const,
      })
      : Object.freeze({
        subjectRef: subject.subjectRef,
        disposition: "CORRECTION_REQUIRED" as const,
        correctionReason: decision
          .correctionReason as EvidenceFactReviewCorrectionReason,
        correctionInstruction: decision.correctionInstruction.trim(),
      });
  });
  return Object.freeze({
    caseRef: detail.case.caseRef,
    manifestVersion: detail.reviewManifestVersion,
    manifestHash: detail.reviewManifestHash,
    decisions: Object.freeze(decisions),
  });
}

export function selectEvidenceFactReviewFinalizeAttempt(
  previous: EvidenceFactReviewFinalizeAttempt | null,
  request: EvidenceFactReviewRoundFinalizeRequest,
  createIdempotencyKey: () => string = () => crypto.randomUUID(),
): EvidenceFactReviewFinalizeAttempt {
  const fingerprint = JSON.stringify(request);
  if (previous?.fingerprint === fingerprint) return previous;
  return Object.freeze({ fingerprint, idempotencyKey: createIdempotencyKey() });
}

type EvidenceFactReviewFinalizeRuntime = Readonly<{
  attempt: { current: EvidenceFactReviewFinalizeAttempt | null };
  submitting: { current: boolean };
  dispatch: (action: DraftAction) => void;
  finalizeReview: EvidenceFactReviewRoundFinalizeCall;
  invalidateIdentity: () => void;
  onRefresh: () => void;
}>;

export async function submitEvidenceFactReviewRound(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
  editable: boolean,
  state: EvidenceFactReviewDraftState,
  runtime: EvidenceFactReviewFinalizeRuntime,
): Promise<void> {
  if (!detail || !editable || runtime.submitting.current) return;
  const request = buildEvidenceFactReviewFinalizeRequest(detail, state);
  if (!request || !state.confirmationOpen) return;
  const selectedAttempt = selectEvidenceFactReviewFinalizeAttempt(
    runtime.attempt.current,
    request,
  );
  runtime.attempt.current = selectedAttempt;
  runtime.submitting.current = true;
  runtime.dispatch({ type: "submitting" });

  const result = await runtime.finalizeReview({
    request,
    idempotencyKey: selectedAttempt.idempotencyKey,
  }).catch(() => ({ ok: false as const, kind: "ordinary" as const }));
  if (result.ok) {
    runtime.invalidateIdentity();
    runtime.onRefresh();
    return;
  }
  runtime.submitting.current = false;
  if (result.kind === "stale") {
    runtime.attempt.current = null;
    runtime.invalidateIdentity();
    runtime.dispatch({ type: "discard_stale" });
    runtime.onRefresh();
    return;
  }
  runtime.dispatch({
    type: "ordinary_failure",
    message: "Review afronden is niet gelukt. Probeer het opnieuw.",
  });
}

function detailIdentity(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
): string {
  if (!detail) return "";
  return [
    detail.case.caseRef,
    detail.reviewManifestHash,
    detail.currentReviewRound?.roundRef ?? "none",
    detail.case.canDecide ? "decide" : "view",
  ].join("|");
}

export function useEvidenceFactReviewDraft(
  detail: EvidenceReviewCaseDetailResponseV1 | null,
  finalizeReview: EvidenceFactReviewRoundFinalizeCall,
  onRefresh: () => void,
) {
  const editable = Boolean(
    detail?.case.canDecide && detail.currentReviewRound === null,
  );
  const [state, dispatch] = useReducer(
    reduceEvidenceFactReviewDraft,
    detail,
    (current) =>
      initializeEvidenceFactReviewDraft(
        current?.reviewSubjects ?? [],
        Boolean(current?.case.canDecide && current.currentReviewRound === null),
      ),
  );
  const currentIdentity = detailIdentity(detail);
  const appliedIdentity = useRef(currentIdentity);
  const attempt = useRef<EvidenceFactReviewFinalizeAttempt | null>(null);
  const submitting = useRef(false);
  const finalizedDecisions = useMemo(
    () =>
      new Map(
        detail?.currentReviewRound?.decisions.map((decision) => [
          decision.subjectRef,
          decision,
        ]) ?? [],
      ),
    [detail?.currentReviewRound],
  );

  useEffect(() => {
    if (!detail || currentIdentity === appliedIdentity.current) return;
    appliedIdentity.current = currentIdentity;
    attempt.current = null;
    submitting.current = false;
    dispatch({
      type: "reset",
      value: initializeEvidenceFactReviewDraft(detail.reviewSubjects, editable),
      preserveNotice: true,
    });
  }, [currentIdentity, detail, editable]);

  const confirm = useCallback(async () => {
    await submitEvidenceFactReviewRound(detail, editable, state, {
      attempt,
      submitting,
      dispatch,
      finalizeReview,
      invalidateIdentity: () => {
        appliedIdentity.current = "";
      },
      onRefresh,
    });
  }, [detail, editable, finalizeReview, onRefresh, state]);

  const complete = detail
    ? isEvidenceFactReviewDraftComplete(detail.reviewSubjects, state)
    : false;

  return Object.freeze({
    state,
    editable,
    complete,
    correctionCount: Object.values(state.decisions).filter((decision) =>
      decision.disposition === "CORRECTION_REQUIRED"
    ).length,
    finalizedDecisions,
    accept: (subjectRef: string) =>
      dispatch({ type: "accept", subjectRef }),
    correct: (subjectRef: string) => dispatch({ type: "correct", subjectRef }),
    setReason: (
      subjectRef: string,
      value: EvidenceFactReviewCorrectionReason | "",
    ) => dispatch({ type: "reason", subjectRef, value }),
    setInstruction: (subjectRef: string, value: string) =>
      dispatch({ type: "instruction", subjectRef, value }),
    openConfirmation: () => {
      if (complete) dispatch({ type: "open_confirmation" });
    },
    cancelConfirmation: () => dispatch({ type: "cancel_confirmation" }),
    confirm,
  });
}
