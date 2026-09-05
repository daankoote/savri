import { Fragment, useCallback } from "react";
import type {
  EvidenceFactReviewCorrectionReason,
  EvidenceFactReviewFinalizedDecisionV1,
  EvidenceFactReviewSubjectV1,
  EvidenceReviewCanonicalFactV1,
  EvidenceReviewEvidenceV1,
  EvidenceReviewReason,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import {
  type EvidenceFactReviewRoundFinalizeCall,
  type EvidenceReviewCorrectionPublishCall,
  finalizeEvidenceFactReviewRound,
  type EvidenceReviewDetailSafeError,
  loadEvidenceReviewPreview,
  publishEvidenceReviewCorrection,
} from "./evidenceReviewDetailClient.ts";
import {
  type EvidenceReviewPreviewLoader,
  EvidenceReviewPreviewPane,
  type EvidenceReviewPreviewSelection,
  useEvidenceReviewPreviewSession,
} from "./EvidenceReviewPreviewPane.tsx";
import type { EvidenceReviewCaseDetailReadState } from "./useEvidenceReviewCaseDetail.ts";
import { useEvidenceReviewCaseDetail } from "./useEvidenceReviewCaseDetail.ts";
import {
  type EvidenceFactReviewDraftDecision,
  useEvidenceFactReviewDraft,
} from "./useEvidenceFactReviewDraft.ts";
import { useEvidenceCorrectionPublish } from "./useEvidenceCorrectionPublish.ts";
import {
  EVIDENCE_REVIEW_STATUS_PRESENTATION,
  evidenceReviewFactStatusPresentation,
} from "./evidenceReviewStatusPresentation.ts";

type EvidenceReviewCaseDetailContentProps = Readonly<{
  caseRef: string;
  state: EvidenceReviewCaseDetailReadState;
  onBack: () => void;
  loadPreview: EvidenceReviewPreviewLoader;
  finalizeReview: EvidenceFactReviewRoundFinalizeCall;
  publishCorrection: EvidenceReviewCorrectionPublishCall;
  onRefresh: () => void;
}>;

const EVIDENCE_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  energy_bill_or_contract: "Energiedocument",
  installation_invoice: "Installatiefactuur",
});

const FACT_LABELS: Readonly<
  Record<EvidenceReviewCanonicalFactV1["category"], string>
> = Object.freeze({
  PARTY_NAME: "Naam",
  ADDRESS: "Adres",
  EAN: "EAN",
  ENERGY_SUPPLIER: "Energieleverancier",
  CHARGER_BRAND: "Merk",
  CHARGER_MODEL: "Model",
  MID: "MID",
  SERIAL: "Serienummer",
});

export const EVIDENCE_REVIEW_REASON_LABELS: Readonly<
  Record<EvidenceReviewReason, string>
> = Object.freeze({
  USER_OVERRIDE: "Door klant aangepast",
  USER_SUPPLIED_WITHOUT_DOCUMENT: "Door klant zelf ingevuld",
  DOCUMENT_CONFLICT_RESOLVED: "Verschillende documentwaarden",
  PROBABLE_IDENTITY_MATCH: "Naam komt waarschijnlijk overeen",
  PROBABLE_ADDRESS_MATCH: "Adres komt waarschijnlijk overeen",
  GENERIC_REVIEW_REQUIRED: "Historisch niet vastgelegd",
});

export const EVIDENCE_FACT_CORRECTION_REASON_LABELS: Readonly<
  Record<EvidenceFactReviewCorrectionReason, string>
> = Object.freeze({
  MISSING_INFORMATION: "Gegeven ontbreekt",
  INCORRECT_INFORMATION: "Gegeven onjuist",
  INCONSISTENT_INFORMATION: "Gegevens komen niet overeen",
  OTHER: "Anders",
});

export const EVIDENCE_FACT_CORRECTION_REASON_OPTIONS = Object.freeze(
  Object.entries(EVIDENCE_FACT_CORRECTION_REASON_LABELS).map(
    ([value, label]) => Object.freeze({
      value: value as EvidenceFactReviewCorrectionReason,
      label,
    }),
  ),
);

function formatServerDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function lifecycleLabel(value: string): string {
  return value === "submitted_for_review"
    ? "Ingediend voor beoordeling"
    : value;
}

type EvidenceFactReviewRow = Readonly<{
  key: string;
  label: string;
  value: string | null;
  truthClass: EvidenceReviewCanonicalFactV1["truthClass"];
  reviewReason?: EvidenceFactReviewSubjectV1["reviewReason"];
  subject: EvidenceFactReviewSubjectV1 | null;
}>;

export function buildEvidenceFactReviewRows(
  evidence: EvidenceReviewEvidenceV1,
  subjects: readonly EvidenceFactReviewSubjectV1[],
): readonly EvidenceFactReviewRow[] {
  const candidates = subjects.filter((subject) =>
    subject.evidenceVersionRef === evidence.evidenceVersionRef
  );
  const used = new Set<string>();
  const rows: EvidenceFactReviewRow[] = evidence.canonicalFacts.map((fact) => {
    const matching = candidates.filter((subject) =>
      subject.factCategory === fact.category
    );
    const subject = matching.length === 1 ? matching[0] : null;
    if (subject) used.add(subject.subjectRef);
    return Object.freeze({
      key: subject?.subjectRef ??
        `read-only:${evidence.evidenceVersionRef}:${fact.category}`,
      label: FACT_LABELS[fact.category],
      value: fact.value,
      truthClass: fact.truthClass,
      ...(fact.truthClass === "REVIEW_REQUIRED"
        ? { reviewReason: fact.reviewReason }
        : {}),
      subject,
    });
  });
  for (const subject of candidates) {
    if (used.has(subject.subjectRef)) continue;
    rows.push(Object.freeze({
      key: subject.subjectRef,
      label: subject.factLabel,
      value: subject.value,
      truthClass: subject.truthClass,
      ...(subject.reviewReason ? { reviewReason: subject.reviewReason } : {}),
      subject,
    }));
  }
  return Object.freeze(rows);
}

function reviewReasonLabel(
  reason: EvidenceFactReviewSubjectV1["reviewReason"],
): string {
  return reason === "REQUIRED_INFORMATION_MISSING"
    ? "Verplicht gegeven ontbreekt"
    : reason
    ? EVIDENCE_REVIEW_REASON_LABELS[reason]
    : "";
}

function BackToWorklist({ onBack }: { onBack: () => void }) {
  return (
    <a
      className="button button-secondary button-compact"
      href="/beheer/dossiers"
      onClick={(event) => {
        event.preventDefault();
        onBack();
      }}
    >
      Terug naar dossiers
    </a>
  );
}

type EvidenceFactsProps = Readonly<{
  evidence: EvidenceReviewEvidenceV1;
  subjects: readonly EvidenceFactReviewSubjectV1[];
  draft: Readonly<Record<string, EvidenceFactReviewDraftDecision>>;
  editable: boolean;
  finalizedDecisions: ReadonlyMap<string, EvidenceFactReviewFinalizedDecisionV1>;
  onAccept: (subjectRef: string) => void;
  onCorrect: (subjectRef: string) => void;
  onReason: (
    subjectRef: string,
    value: EvidenceFactReviewCorrectionReason | "",
  ) => void;
  onInstruction: (subjectRef: string, value: string) => void;
}>;

function EvidenceFacts(props: EvidenceFactsProps) {
  const rows = buildEvidenceFactReviewRows(props.evidence, props.subjects);
  if (rows.length === 0) return null;
  return (
    <div
      className="fact-table fact-table--document fact-table--evidence-review"
      role="table"
    >
      <div className="fact-table__header" role="row">
        <span role="columnheader">Gegeven</span>
        <span role="columnheader">Waarde</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Reden</span>
        <span role="columnheader">Beoordeling</span>
      </div>
      {rows.map((row) => {
        const subjectRef = row.subject?.subjectRef ?? null;
        const draft = subjectRef ? props.draft[subjectRef] : undefined;
        const finalized = subjectRef
          ? props.finalizedDecisions.get(subjectRef)
          : undefined;
        const state = evidenceReviewFactStatusPresentation(row, finalized);
        return (
          <Fragment key={row.key}>
            <div className="fact-table__row" role="row">
              <span data-label="Gegeven" role="cell">{row.label}</span>
              <span
                className="fact-table__value"
                data-label="Waarde"
                role="cell"
              >
                <span className="fact-table__canonical-value">
                  {row.value ?? "Niet vastgelegd"}
                </span>
              </span>
              <span data-label="Status" role="cell">
                <span className={`status-pill ${state.className}`}>
                  {state.label}
                </span>
              </span>
              <span
                className="fact-review-reason"
                data-label="Reden"
                role="cell"
              >
                {row.truthClass === "REVIEW_REQUIRED"
                  ? reviewReasonLabel(row.reviewReason)
                  : null}
              </span>
              <span
                className="fact-review-assessment"
                data-label="Beoordeling"
                role="cell"
              >
                {finalized
                  ? finalized.disposition === "ACCEPTED"
                    ? <span>Geaccepteerd</span>
                    : (
                      <span className="fact-review-finalized-correction">
                        <strong>Correctie nodig</strong>
                        <span>
                          {EVIDENCE_FACT_CORRECTION_REASON_LABELS[
                            finalized.correctionReason
                          ]}
                        </span>
                        <span>{finalized.correctionInstruction}</span>
                      </span>
                    )
                  : props.editable && draft && subjectRef
                  ? (
                    <span className="fact-review-choices">
                      <button
                        aria-pressed={draft.disposition === "ACCEPTED"}
                        className={`button button-secondary button-compact fact-review-choice${
                          draft.disposition === "ACCEPTED"
                            ? " fact-review-choice--selected"
                            : ""
                        }`}
                        onClick={() => props.onAccept(subjectRef)}
                        type="button"
                      >
                        Accepteren
                      </button>
                      <button
                        aria-pressed={
                          draft.disposition === "CORRECTION_REQUIRED"
                        }
                        className={`button button-secondary button-compact fact-review-choice${
                          draft.disposition === "CORRECTION_REQUIRED"
                            ? " fact-review-choice--selected"
                            : ""
                        }`}
                        onClick={() => props.onCorrect(subjectRef)}
                        type="button"
                      >
                        Correctie
                      </button>
                    </span>
                  )
                  : <span aria-hidden="true">—</span>}
              </span>
            </div>
            {props.editable && subjectRef &&
                draft?.disposition === "CORRECTION_REQUIRED"
              ? (
                <div className="fact-review-correction-row" role="row">
                  <div className="fact-review-correction-fields" role="cell">
                    <label className="field">
                      <span>Reden</span>
                      <select
                        aria-label={`Reden correctie voor ${row.label}`}
                        onChange={(event) =>
                          props.onReason(
                            subjectRef,
                            event.currentTarget.value as
                              | EvidenceFactReviewCorrectionReason
                              | "",
                          )}
                        value={draft.correctionReason}
                      >
                        <option disabled value="">Kies een reden</option>
                        {EVIDENCE_FACT_CORRECTION_REASON_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Wat ontbreekt of moet worden aangepast?</span>
                      <textarea
                        aria-label={`Correctie voor ${row.label}`}
                        maxLength={1000}
                        onChange={(event) =>
                          props.onInstruction(
                            subjectRef,
                            event.currentTarget.value,
                          )}
                        required
                        value={draft.correctionInstruction}
                      />
                    </label>
                  </div>
                </div>
              )
              : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function EvidenceReviewSection({
  evidence,
  subjects,
  review,
  loadPreview,
}: Readonly<{
  evidence: EvidenceReviewEvidenceV1;
  subjects: readonly EvidenceFactReviewSubjectV1[];
  review: ReturnType<typeof useEvidenceFactReviewDraft>;
  loadPreview: EvidenceReviewPreviewLoader;
}>) {
  const label = EVIDENCE_KIND_LABELS[evidence.kind] ?? evidence.kind;
  const preview = useEvidenceReviewPreviewSession(loadPreview);
  const open = preview.state.status !== "idle";
  const selection: EvidenceReviewPreviewSelection = Object.freeze({
    evidenceVersionRef: evidence.evidenceVersionRef,
    label,
  });
  return (
    <article className="portal-card-compact evidence-review-section">
      <header className="portal-row evidence-review-section__header">
        <div>
          <h2>{label}</h2>
          <p>Geüpload op {formatServerDateTime(evidence.uploadedAt)}</p>
        </div>
        <div className="portal-row-actions">
          <button
            className="button button-secondary button-compact"
            aria-expanded={open}
            onClick={() => {
              if (open) {
                preview.close();
              } else {
                void preview.select(selection);
              }
            }}
            type="button"
          >
            {open ? "Document sluiten" : "Document bekijken"}
          </button>
        </div>
      </header>
      <div
        className={`evidence-review-section__body${
          open ? " evidence-review-section__body--open" : ""
        }`}
      >
        <EvidenceFacts
          draft={review.state.decisions}
          editable={review.editable}
          evidence={evidence}
          finalizedDecisions={review.finalizedDecisions}
          onAccept={review.accept}
          onCorrect={review.correct}
          onInstruction={review.setInstruction}
          onReason={review.setReason}
          subjects={subjects}
        />
        {open
          ? (
            <EvidenceReviewPreviewPane
              onRetry={() => void preview.retry()}
              state={preview.state}
            />
          )
          : null}
      </div>
    </article>
  );
}

function errorTitle(error: EvidenceReviewDetailSafeError): string {
  if (error.code === "unauthorized") return "Inloggen vereist";
  if (error.code === "invalid_case") return "Ongeldige dossierroute";
  if (error.code === "not_found_or_forbidden") {
    return "Dossier niet beschikbaar";
  }
  return "Dossierdetail niet beschikbaar";
}

export function EvidenceReviewCaseDetailContent({
  caseRef,
  finalizeReview,
  loadPreview,
  onBack,
  onRefresh,
  publishCorrection,
  state,
}: EvidenceReviewCaseDetailContentProps) {
  const detail = state.status === "ready" ? state.value : null;
  const review = useEvidenceFactReviewDraft(detail, finalizeReview, onRefresh);
  const correctionPublish = useEvidenceCorrectionPublish(
    detail,
    publishCorrection,
    onRefresh,
  );
  if (state.status === "loading") {
    return (
      <div className="portal-content-stack">
        <header className="portal-content-header">
          <div>
            <h1>{caseRef}</h1>
            <p>Alleen-lezen dossierdetail</p>
          </div>
          <BackToWorklist onBack={onBack} />
        </header>
        <div className="review-panel" role="status" aria-live="polite">
          <h3>Dossier laden</h3>
          <p>De actuele dossier- en bewijsgegevens worden opgehaald.</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    const mayRetry = !["unauthorized", "invalid_case", "not_found_or_forbidden"]
      .includes(state.error.code);
    return (
      <div className="portal-content-stack">
        <header className="portal-content-header">
          <div>
            <h1>{caseRef}</h1>
            <p>Alleen-lezen dossierdetail</p>
          </div>
          <BackToWorklist onBack={onBack} />
        </header>
        <div className="review-panel" role="alert">
          <h3>{errorTitle(state.error)}</h3>
          <p>{state.error.message}</p>
          {mayRetry
            ? (
              <div className="section-actions">
                <button
                  className="button button-secondary button-compact"
                  onClick={onRefresh}
                  type="button"
                >
                  Opnieuw laden
                </button>
              </div>
            )
            : null}
        </div>
      </div>
    );
  }

  const readyDetail = state.value;
  const overallStatus =
    EVIDENCE_REVIEW_STATUS_PRESENTATION[readyDetail.overallReviewStatus];
  return (
    <div className="portal-content-stack evidence-review-detail">
      <header className="portal-content-header">
        <div>
          <h1>
            {readyDetail.case.caseRef}{" "}
            <span className={`status-pill ${overallStatus.className}`}>
              {overallStatus.label}
            </span>
          </h1>
          <p>Dossierfase: {lifecycleLabel(readyDetail.case.lifecycle)}</p>
        </div>
        <BackToWorklist onBack={onBack} />
      </header>

      {readyDetail.evidence.length > 0
        ? (
          <div
            className="evidence-review-section-list"
            aria-label="Bewijsstukken"
          >
            {readyDetail.evidence.map((evidence) => (
              <EvidenceReviewSection
                evidence={evidence}
                key={evidence.evidenceVersionRef}
                loadPreview={loadPreview}
                review={review}
                subjects={readyDetail.reviewSubjects}
              />
            ))}
          </div>
        )
        : (
          <div className="review-panel" role="status">
            <h3>Geen bewijsstukken</h3>
            <p>
              Voor dit dossier zijn geen actuele bewijsstukken teruggegeven.
            </p>
          </div>
        )}
      {!readyDetail.currentReviewRound && review.editable
        ? (
          <div className="evidence-review-final-action">
            {review.state.notice
              ? <p role="status">{review.state.notice}</p>
              : null}
            {review.state.error
              ? <p className="field-message" role="alert">{review.state.error}</p>
              : null}
            {review.state.confirmationOpen
              ? (
                <div className="evidence-review-final-confirmation">
                  <p>
                    {review.correctionCount === 0
                      ? "Alles akkoord. Review afronden?"
                      : `Review afronden met ${review.correctionCount} correctie(s)?`}
                  </p>
                  <div className="section-actions">
                    <button
                      className="button button-primary button-compact"
                      disabled={review.state.submitting}
                      onClick={() => void review.confirm()}
                      type="button"
                    >
                      Ja, afronden
                    </button>
                    <button
                      className="button button-secondary button-compact"
                      disabled={review.state.submitting}
                      onClick={review.cancelConfirmation}
                      type="button"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              )
              : (
                <button
                  className="button button-primary"
                  disabled={!review.complete || review.state.submitting}
                  onClick={review.openConfirmation}
                  type="button"
                >
                  Review afronden
                </button>
              )}
          </div>
        )
        : null}
      {correctionPublish.eligible || correctionPublish.state.notice
        ? (
          <div className="evidence-review-final-action">
            {correctionPublish.state.notice
              ? <p role="status">{correctionPublish.state.notice}</p>
              : null}
            {correctionPublish.state.error
              ? (
                <p className="field-message" role="alert">
                  {correctionPublish.state.error}
                </p>
              )
              : null}
            {correctionPublish.eligible
              ? correctionPublish.state.confirmationOpen
                ? (
                  <div className="evidence-review-final-confirmation">
                    <p>Correcties naar klant sturen?</p>
                    <div className="section-actions">
                      <button
                        className="button button-primary button-compact"
                        disabled={correctionPublish.state.submitting}
                        onClick={() => void correctionPublish.confirm()}
                        type="button"
                      >
                        Ja, sturen
                      </button>
                      <button
                        className="button button-secondary button-compact"
                        disabled={correctionPublish.state.submitting}
                        onClick={correctionPublish.cancelConfirmation}
                        type="button"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                )
                : (
                  <button
                    className="button button-primary"
                    onClick={correctionPublish.openConfirmation}
                    type="button"
                  >
                    Naar klant sturen
                  </button>
                )
              : null}
          </div>
        )
        : null}
    </div>
  );
}

export function EvidenceReviewCaseDetailPageContent({
  caseRef,
  onBack,
}: Readonly<{ caseRef: string; onBack: () => void }>) {
  const auth = useAuth();
  const accessToken = auth.session?.access_token ?? null;
  const detail = useEvidenceReviewCaseDetail(accessToken, caseRef);
  const previewLoader = useCallback(
    (evidenceVersionRef: string, signal: AbortSignal) =>
      loadEvidenceReviewPreview({
        accessToken: accessToken ?? "",
        caseRef,
        evidenceVersionRef,
        signal,
      }),
    [accessToken, caseRef],
  );
  const finalizeReview = useCallback<EvidenceFactReviewRoundFinalizeCall>(
    ({ idempotencyKey, request }) =>
      finalizeEvidenceFactReviewRound({
        accessToken: accessToken ?? "",
        idempotencyKey,
        request,
      }),
    [accessToken],
  );
  const publishCorrection = useCallback<EvidenceReviewCorrectionPublishCall>(
    ({ idempotencyKey, request }) =>
      publishEvidenceReviewCorrection({
        accessToken: accessToken ?? "",
        idempotencyKey,
        request,
      }),
    [accessToken],
  );
  return (
    <EvidenceReviewCaseDetailContent
      caseRef={caseRef}
      finalizeReview={finalizeReview}
      loadPreview={previewLoader}
      onBack={onBack}
      onRefresh={detail.refresh}
      publishCorrection={publishCorrection}
      state={detail.state}
    />
  );
}
