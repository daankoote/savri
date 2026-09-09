import type {
  EvidenceReviewAttentionReason,
  EvidenceReviewWorklistCaseV4,
} from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import type { EvidenceReviewOperationalStatus } from "../../../../supabase/functions/_shared/app_evidence_review_overall_status.ts";
import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider.tsx";
import type { EvidenceReviewWorklistSafeError } from "./evidenceReviewWorklistClient.ts";
import {
  type EvidenceReviewWorklistReadState,
  useEvidenceReviewWorklist,
} from "./useEvidenceReviewWorklist.ts";
import type { AppNavigate } from "../../routes/types.ts";
import {
  buildEvidenceReviewDetailRoute,
  EVIDENCE_REVIEW_WORKLIST_GROUP_ANCHORS,
  type EvidenceReviewWorklistGroup,
} from "./evidenceReviewRoutes.ts";
import { EVIDENCE_REVIEW_STATUS_PRESENTATION } from "./evidenceReviewStatusPresentation.ts";

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

const STATUS_GROUP: Readonly<
  Record<EvidenceReviewOperationalStatus, EvidenceReviewWorklistGroup>
> = Object.freeze({
  TO_REVIEW: "toReview",
  CORRECTION_REQUIRED: "otherActive",
  WAITING_CUSTOMER: "waitingCustomer",
  REVIEW_COMPLETE: "complete",
  REVIEW_MODEL_UNAVAILABLE: "otherActive",
});

const WORKLIST_GROUPS = Object.freeze(
  [
    { key: "toReview", title: "Interne beoordeling" },
    { key: "waitingCustomer", title: "Wacht op klant" },
    { key: "complete", title: "Afgerond" },
    { key: "otherActive", title: "Overige actieve dossiers" },
  ] as const,
);

function formatServerDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function unresolvedFactLabel(
  item: EvidenceReviewWorklistCaseV4,
): string | null {
  if (item.overallReviewStatus === "REVIEW_MODEL_UNAVAILABLE") {
    return "Aantal te beoordelen gegevens niet beschikbaar";
  }
  if (item.overallReviewStatus !== "TO_REVIEW") return null;
  return `${item.unresolvedFactCount} ${
    item.unresolvedFactCount === 1 ? "gegeven vraagt" : "gegevens vragen"
  } beoordeling`;
}

export function EvidenceReviewCaseRow({
  item,
  onOpenCase,
}: Readonly<{
  item: EvidenceReviewWorklistCaseV4;
  onOpenCase: (caseRef: string) => void;
}>) {
  const detailRoute = buildEvidenceReviewDetailRoute(item.caseRef);
  const unresolvedLabel = unresolvedFactLabel(item);
  const status = EVIDENCE_REVIEW_STATUS_PRESENTATION[item.overallReviewStatus];
  return (
    <li className="portal-row">
      <div>
        <h3>{item.caseRef}</h3>
        {unresolvedLabel
          ? (
            <p>
              <strong>{unresolvedLabel}</strong>
            </p>
          )
          : null}
        <p>
          Laatst bijgewerkt: {formatServerDateTime(item.latestReviewActivityAt)}
        </p>
      </div>
      <div
        className="portal-row-actions"
        aria-label="Dossieracties en redenen voor aandacht"
      >
        <span className={`status-pill ${status.className}`}>
          {item.reviewAttentionReasons.length === 1
            ? REASON_PRESENTATION[item.reviewAttentionReasons[0]].label
            : status.label}
        </span>
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
            <h1>Dossiers</h1>
            <p>Interne, alleen-lezen dossierlijst</p>
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
            <h1>Dossiers</h1>
            <p>Interne, alleen-lezen dossierlijst</p>
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
          <h1>Dossiers</h1>
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
          <h2 id="review-cases-title">Dossiergroepen</h2>
          <p>
            Dossiers uit uw server-bepaalde dossierscope.
          </p>
        </div>
        <div className="portal-content-stack">
          {WORKLIST_GROUPS.map((group) => {
            const cases = value.cases.filter((item) =>
              STATUS_GROUP[item.overallReviewStatus] === group.key
            );
            const titleId = `${group.key}-group-title`;
            return (
              <section
                aria-labelledby={titleId}
                className="portal-section-stack"
                id={EVIDENCE_REVIEW_WORKLIST_GROUP_ANCHORS[group.key]}
                key={group.key}
              >
                <h3 id={titleId}>{group.title}</h3>
                {cases.length > 0
                  ? (
                    <ul
                      className="portal-row-list"
                      aria-label={`${group.title} dossiers`}
                    >
                      {cases.map((item) => (
                        <EvidenceReviewCaseRow
                          item={item}
                          key={item.caseRef}
                          onOpenCase={onOpenCase}
                        />
                      ))}
                    </ul>
                  )
                  : (
                    <div
                      className="review-panel review-panel-ok"
                      role="status"
                    >
                      <p>Geen dossiers in deze groep.</p>
                    </div>
                  )}
              </section>
            );
          })}
        </div>
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

  useEffect(() => {
    if (worklist.state.status !== "ready" || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: "start" });
  }, [worklist.state.status]);

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
