import type {
  EvidenceReviewAttentionReason,
  EvidenceReviewWorklistCaseV3,
} from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import type { EvidenceReviewWorklistSafeError } from "./evidenceReviewWorklistClient.ts";
import {
  type EvidenceReviewWorklistReadState,
  useEvidenceReviewWorklist,
} from "./useEvidenceReviewWorklist.ts";
import type { AppNavigate } from "../../routes/types.ts";
import { buildEvidenceReviewDetailRoute } from "./evidenceReviewRoutes.ts";

type EvidenceReviewWorklistContentProps = Readonly<{
  state: EvidenceReviewWorklistReadState;
  onOpenCase: (caseRef: string) => void;
  onRefresh: () => void;
}>;

const REASON_PRESENTATION: Record<
  EvidenceReviewAttentionReason,
  Readonly<{ label: string; className: string }>
> = {
  FACT_REVIEW_REQUIRED: {
    label: "Factbeoordeling nodig",
    className: "status-pill-warning",
  },
  REVIEW_MODEL_UNAVAILABLE: {
    label: "Beoordelingsmodel niet beschikbaar",
    className: "status-pill-danger",
  },
};

function formatServerDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function unresolvedFactLabel(item: EvidenceReviewWorklistCaseV3): string {
  if (item.overallReviewStatus === "REVIEW_MODEL_UNAVAILABLE") {
    return "Aantal te beoordelen gegevens niet beschikbaar";
  }
  return `${item.unresolvedFactCount} ${
    item.unresolvedFactCount === 1 ? "gegeven vraagt" : "gegevens vragen"
  } beoordeling`;
}

function EvidenceReviewCaseRow({
  item,
  onOpenCase,
}: Readonly<{
  item: EvidenceReviewWorklistCaseV3;
  onOpenCase: (caseRef: string) => void;
}>) {
  const detailRoute = buildEvidenceReviewDetailRoute(item.caseRef);
  return (
    <li className="portal-row">
      <div>
        <h3>{item.caseRef}</h3>
        <p>Dossierstatus: ingediend voor beoordeling</p>
        <p>
          <strong>{unresolvedFactLabel(item)}</strong>
        </p>
        <p>
          Laatst bijgewerkt: {formatServerDateTime(item.latestReviewActivityAt)}
        </p>
      </div>
      <div
        className="portal-row-actions"
        aria-label="Dossieracties en redenen voor aandacht"
      >
        {item.reviewAttentionReasons.map((reason) => {
          const presentation = REASON_PRESENTATION[reason];
          return (
            <span
              className={`status-pill ${presentation.className}`}
              key={reason}
            >
              {presentation.label}
            </span>
          );
        })}
        {detailRoute
          ? (
            <a
              className="button button-secondary button-compact"
              href={detailRoute}
              onClick={(event) => {
                event.preventDefault();
                onOpenCase(item.caseRef);
              }}
            >
              Dossier openen
            </a>
          )
          : null}
      </div>
    </li>
  );
}

function errorTitle(error: EvidenceReviewWorklistSafeError): string {
  if (error.code === "unauthorized") return "Inloggen vereist";
  if (error.code === "forbidden") return "Geen toegang";
  return "Dossierwerklijst niet beschikbaar";
}

export function EvidenceReviewWorklistContent({
  onOpenCase,
  state,
  onRefresh,
}: EvidenceReviewWorklistContentProps) {
  if (state.status === "loading") {
    return (
      <div className="portal-content-stack">
        <header className="portal-content-header">
          <div>
            <h1>Dossiers voor bewijsbeoordeling</h1>
            <p>Interne, alleen-lezen werklijst</p>
          </div>
        </header>
        <div className="review-panel" role="status" aria-live="polite">
          <h3>Werklijst laden</h3>
          <p>De actuele toegewezen dossiers worden opgehaald.</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    const mayRetry = state.error.code !== "unauthorized" &&
      state.error.code !== "forbidden";
    return (
      <div className="portal-content-stack">
        <header className="portal-content-header">
          <div>
            <h1>Dossiers voor bewijsbeoordeling</h1>
            <p>Interne, alleen-lezen werklijst</p>
          </div>
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

  const { value } = state;
  return (
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <div>
          <h1>Dossiers voor bewijsbeoordeling</h1>
          <p>Bijgewerkt op {formatServerDateTime(value.asOf)}</p>
        </div>
        <button
          className="button button-secondary button-compact"
          onClick={onRefresh}
          type="button"
        >
          Verversen
        </button>
      </header>

      <section
        className="portal-card-compact"
        aria-labelledby="review-cases-title"
      >
        <div>
          <h2 id="review-cases-title">Toegewezen dossiers</h2>
          <p>
            Factbeoordeling afgeleid door de server voor uw exacte dossierscope.
          </p>
        </div>
        {value.cases.length > 0
          ? (
            <ul
              className="portal-row-list"
              aria-label="Dossiers met factbeoordeling"
            >
              {value.cases.map((item) => (
                <EvidenceReviewCaseRow
                  item={item}
                  key={item.caseRef}
                  onOpenCase={onOpenCase}
                />
              ))}
            </ul>
          )
          : (
            <div className="review-panel review-panel-ok" role="status">
              <h3>Geen toegewezen dossiers</h3>
              <p>
                Geen dossiers die op dit moment aan u zijn toegewezen voor
                bewijsbeoordeling.
              </p>
            </div>
          )}
      </section>
    </div>
  );
}

export function EvidenceReviewWorklistPageContent({
  navigate,
}: Readonly<{ navigate: AppNavigate }>) {
  const auth = useAuth();
  const worklist = useEvidenceReviewWorklist(
    auth.session?.access_token ?? null,
  );
  return (
    <EvidenceReviewWorklistContent
      onOpenCase={(caseRef) => {
        const route = buildEvidenceReviewDetailRoute(caseRef);
        if (route) navigate(route);
      }}
      onRefresh={worklist.refresh}
      state={worklist.state}
    />
  );
}
