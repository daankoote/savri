import { useCallback } from "react";
import type {
  EvidenceReviewCanonicalFactV1,
  EvidenceReviewEvidenceV1,
  EvidenceReviewReason,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import {
  type EvidenceReviewDetailSafeError,
  loadEvidenceReviewPreview,
} from "./evidenceReviewDetailClient.ts";
import {
  type EvidenceReviewPreviewLoader,
  EvidenceReviewPreviewPane,
  type EvidenceReviewPreviewSelection,
  useEvidenceReviewPreviewSession,
} from "./EvidenceReviewPreviewPane.tsx";
import type { EvidenceReviewCaseDetailReadState } from "./useEvidenceReviewCaseDetail.ts";
import { useEvidenceReviewCaseDetail } from "./useEvidenceReviewCaseDetail.ts";

type EvidenceReviewCaseDetailContentProps = Readonly<{
  caseRef: string;
  state: EvidenceReviewCaseDetailReadState;
  onBack: () => void;
  loadPreview: EvidenceReviewPreviewLoader;
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

function factState(fact: EvidenceReviewCanonicalFactV1): Readonly<{
  className: string;
  label: string;
}> {
  return fact.truthClass === "CUSTOMER_CONFIRMED"
    ? { className: "status-pill-ok", label: "Door klant bevestigd" }
    : { className: "status-pill-warning", label: "Beoordeling nodig" };
}

function BackToWorklist({ onBack }: { onBack: () => void }) {
  return (
    <a
      className="button button-secondary button-compact"
      href="/intern/dossiers"
      onClick={(event) => {
        event.preventDefault();
        onBack();
      }}
    >
      Terug naar dossiers
    </a>
  );
}

function EvidenceFacts(
  { facts }: { facts: readonly EvidenceReviewCanonicalFactV1[] },
) {
  if (facts.length === 0) return null;
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
      </div>
      {facts.map((fact) => {
        const state = factState(fact);
        return (
          <div
            className="fact-table__row"
            key={`${fact.category}:${fact.value}`}
            role="row"
          >
            <span data-label="Gegeven" role="cell">
              {FACT_LABELS[fact.category]}
            </span>
            <span className="fact-table__value" data-label="Waarde" role="cell">
              <span className="fact-table__canonical-value">{fact.value}</span>
            </span>
            <span data-label="Status" role="cell">
              <span className={`status-pill ${state.className}`}>
                {state.label}
              </span>
            </span>
            <span className="fact-review-reason" data-label="Reden" role="cell">
              {fact.truthClass === "REVIEW_REQUIRED" && fact.reviewReason
                ? EVIDENCE_REVIEW_REASON_LABELS[fact.reviewReason]
                : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceReviewSection({
  evidence,
  loadPreview,
}: Readonly<{
  evidence: EvidenceReviewEvidenceV1;
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
          <span className="status-pill status-pill-warning">
            {evidence.reviewStatus}
          </span>
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
        <EvidenceFacts facts={evidence.canonicalFacts} />
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
  loadPreview,
  onBack,
  onRefresh,
  state,
}: EvidenceReviewCaseDetailContentProps) {
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

  const detail = state.value;
  return (
    <div className="portal-content-stack evidence-review-detail">
      <header className="portal-content-header">
        <div>
          <h1>{detail.case.caseRef}</h1>
          <p>{lifecycleLabel(detail.case.lifecycle)}</p>
        </div>
        <BackToWorklist onBack={onBack} />
      </header>

      {detail.evidence.length > 0
        ? (
          <div
            className="evidence-review-section-list"
            aria-label="Bewijsstukken"
          >
            {detail.evidence.map((evidence) => (
              <EvidenceReviewSection
                evidence={evidence}
                key={evidence.evidenceVersionRef}
                loadPreview={loadPreview}
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
  return (
    <EvidenceReviewCaseDetailContent
      caseRef={caseRef}
      loadPreview={previewLoader}
      onBack={onBack}
      onRefresh={detail.refresh}
      state={detail.state}
    />
  );
}
