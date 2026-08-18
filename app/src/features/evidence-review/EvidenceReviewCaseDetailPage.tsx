import { useCallback, useState } from "react";
import type {
  EvidenceReviewCanonicalFactV1,
  EvidenceReviewEvidenceV1,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import {
  type EvidenceReviewDetailSafeError,
  type EvidenceReviewPreviewResult,
  openEvidenceReviewPreview,
} from "./evidenceReviewDetailClient.ts";
import type { EvidenceReviewCaseDetailReadState } from "./useEvidenceReviewCaseDetail.ts";
import { useEvidenceReviewCaseDetail } from "./useEvidenceReviewCaseDetail.ts";

type PreviewState =
  | Readonly<{ status: "idle"; message: null }>
  | Readonly<{ status: "loading"; message: null }>
  | Readonly<{ status: "error"; message: string }>;

type EvidenceReviewCaseDetailContentProps = Readonly<{
  caseRef: string;
  state: EvidenceReviewCaseDetailReadState;
  onBack: () => void;
  onPreview: (
    evidenceVersionRef: string,
  ) => Promise<EvidenceReviewPreviewResult>;
  onRefresh: () => void;
}>;

const IDLE_PREVIEW_STATE: PreviewState = Object.freeze({
  status: "idle",
  message: null,
});

export function beginEvidencePreview(): PreviewState {
  return Object.freeze({ status: "loading", message: null });
}

export function completeEvidencePreview(
  result: EvidenceReviewPreviewResult,
): PreviewState {
  return result.ok
    ? IDLE_PREVIEW_STATE
    : Object.freeze({ status: "error", message: result.error.message });
}

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
      className="fact-table fact-table--document fact-table--three-columns"
      role="table"
    >
      <div className="fact-table__header" role="row">
        <span role="columnheader">Gegeven</span>
        <span role="columnheader">Waarde</span>
        <span role="columnheader">Status</span>
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
          </div>
        );
      })}
    </div>
  );
}

function EvidenceCard({
  evidence,
  onPreview,
}: Readonly<{
  evidence: EvidenceReviewEvidenceV1;
  onPreview: (
    evidenceVersionRef: string,
  ) => Promise<EvidenceReviewPreviewResult>;
}>) {
  const [preview, setPreview] = useState<PreviewState>(IDLE_PREVIEW_STATE);
  const openPreview = async () => {
    if (preview.status === "loading") return;
    setPreview(beginEvidencePreview());
    const result = await onPreview(evidence.evidenceVersionRef);
    setPreview(completeEvidencePreview(result));
  };
  return (
    <li>
      <article className="portal-card-compact">
        <div className="portal-row">
          <div>
            <h2>{EVIDENCE_KIND_LABELS[evidence.kind] ?? evidence.kind}</h2>
            <p>Geüpload op {formatServerDateTime(evidence.uploadedAt)}</p>
          </div>
          <span className="status-pill status-pill-warning">
            {evidence.reviewStatus}
          </span>
        </div>
        <EvidenceFacts facts={evidence.canonicalFacts} />
        <div className="section-actions">
          <button
            className="button button-secondary button-compact"
            disabled={preview.status === "loading"}
            onClick={() => void openPreview()}
            type="button"
          >
            {preview.status === "loading"
              ? "Document openen..."
              : "Document bekijken"}
          </button>
        </div>
        {preview.status === "error"
          ? (
            <small className="field-message" role="alert">
              {preview.message}
            </small>
          )
          : null}
      </article>
    </li>
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
  onBack,
  onPreview,
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
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <div>
          <h1>{detail.case.caseRef}</h1>
          <p>{lifecycleLabel(detail.case.lifecycle)}</p>
        </div>
        <BackToWorklist onBack={onBack} />
      </header>

      {(detail.case.partyDisplayName || detail.case.deliveryAddress)
        ? (
          <section
            className="portal-card-compact"
            aria-labelledby="case-context-title"
          >
            <div>
              <h2 id="case-context-title">Aangegeven dossiercontext</h2>
              {detail.case.partyDisplayName
                ? (
                  <p>
                    <strong>Naam:</strong> {detail.case.partyDisplayName}{" "}
                    (aangegeven)
                  </p>
                )
                : null}
              {detail.case.deliveryAddress
                ? (
                  <p>
                    <strong>Adres:</strong> {detail.case.deliveryAddress}{" "}
                    (aangegeven)
                  </p>
                )
                : null}
            </div>
          </section>
        )
        : null}

      <section aria-labelledby="evidence-title">
        <div className="portal-content-header">
          <div>
            <h2 id="evidence-title">Bewijsstukken</h2>
            <p>Actuele gegevens uit het geautoriseerde dossier.</p>
          </div>
        </div>
        {detail.evidence.length > 0
          ? (
            <ul className="portal-row-list" aria-label="Bewijsstukken">
              {detail.evidence.map((evidence) => (
                <EvidenceCard
                  evidence={evidence}
                  key={evidence.evidenceVersionRef}
                  onPreview={onPreview}
                />
              ))}
            </ul>
          )
          : (
            <div className="review-panel" role="status">
              <h3>Geen bewijsstukken</h3>
              <p>
                Voor dit dossier zijn geen actuele bewijsstukken teruggegeven.
              </p>
            </div>
          )}
      </section>
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
  const preview = useCallback(
    (evidenceVersionRef: string) =>
      openEvidenceReviewPreview({
        accessToken: accessToken ?? "",
        caseRef,
        evidenceVersionRef,
      }),
    [accessToken, caseRef],
  );
  return (
    <EvidenceReviewCaseDetailContent
      caseRef={caseRef}
      onBack={onBack}
      onPreview={preview}
      onRefresh={detail.refresh}
      state={detail.state}
    />
  );
}
