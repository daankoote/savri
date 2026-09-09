import { useAuth } from "../auth/AuthProvider.tsx";
import { EvidenceReviewCaseRow } from "../evidence-review/EvidenceReviewWorklistPage.tsx";
import {
  buildEvidenceReviewDetailRoute,
  buildEvidenceReviewWorklistGroupRoute,
  type EvidenceReviewWorklistGroup,
} from "../evidence-review/evidenceReviewRoutes.ts";
import {
  type EvidenceReviewWorklistReadState,
  useEvidenceReviewWorklist,
} from "../evidence-review/useEvidenceReviewWorklist.ts";
import type { AppNavigate } from "../../routes/types.ts";

const PREVIEW_LIMIT = 3;

type OperatorOverviewContentProps = Readonly<{
  evidenceState: EvidenceReviewWorklistReadState;
  onOpenCase: (caseRef: string) => void;
  onOpenDossiers: (group: EvidenceReviewWorklistGroup) => void;
  onRefreshEvidence: () => void;
}>;

function mayRetry(code: string): boolean {
  return !["unauthorized", "forbidden"].includes(code);
}

function ReadError({
  message,
  onRefresh,
  retry,
}: Readonly<{
  message: string;
  onRefresh: () => void;
  retry: boolean;
}>) {
  return (
    <div className="review-panel" role="alert">
      <h3>Niet beschikbaar</h3>
      <p>{message}</p>
      {retry
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
  );
}

function EvidencePreview({
  state,
  onOpenCase,
  onOpenDossiers,
  onRefresh,
}: Readonly<{
  state: EvidenceReviewWorklistReadState;
  onOpenCase: (caseRef: string) => void;
  onOpenDossiers: (group: EvidenceReviewWorklistGroup) => void;
  onRefresh: () => void;
}>) {
  if (state.status === "loading") {
    return (
      <section
        className="portal-card-compact"
        aria-labelledby="dossier-preview-title"
      >
        <div>
          <h2 id="dossier-preview-title">Dossiers</h2>
        </div>
        <div className="review-panel" role="status" aria-live="polite">
          <h3>Dossiers laden</h3>
          <p>De actuele dossiers worden opgehaald.</p>
        </div>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section
        className="portal-card-compact"
        aria-labelledby="dossier-preview-title"
      >
        <div>
          <h2 id="dossier-preview-title">Dossiers</h2>
        </div>
        <ReadError
          message={state.error.message}
          onRefresh={onRefresh}
          retry={mayRetry(state.error.code)}
        />
      </section>
    );
  }

  const toReview = state.value.cases.filter((item) =>
    item.overallReviewStatus === "TO_REVIEW"
  ).slice(0, PREVIEW_LIMIT);
  const waitingCustomer = state.value.cases.filter((item) =>
    item.overallReviewStatus === "WAITING_CUSTOMER"
  ).slice(0, PREVIEW_LIMIT);
  const complete = state.value.cases.filter((item) =>
    item.overallReviewStatus === "REVIEW_COMPLETE"
  ).slice(0, PREVIEW_LIMIT);

  const groups = [
    {
      emptyTitle: "Geen dossiers te beoordelen",
      group: "toReview",
      items: toReview,
      title: "Te beoordelen",
    },
    {
      emptyTitle: "Geen dossiers wachten op klant",
      group: "waitingCustomer",
      items: waitingCustomer,
      title: "Wacht op klant",
    },
    {
      emptyTitle: "Geen afgeronde dossiers",
      group: "complete",
      items: complete,
      title: "Afgerond",
    },
  ] as const;

  return (
    <>
      {groups.map((group) => {
        const titleId = `${group.group}-title`;
        const route = buildEvidenceReviewWorklistGroupRoute(group.group);
        return (
          <section
            className="portal-card-compact"
            aria-labelledby={titleId}
            key={group.group}
          >
            <div>
              <h2 id={titleId}>{group.title}</h2>
            </div>
            {group.items.length > 0
              ? (
                <ul
                  className="portal-row-list"
                  aria-label={`${group.title} dossiers`}
                >
                  {group.items.map((item) => (
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
                  <h3>{group.emptyTitle}</h3>
                </div>
              )}
            <div className="section-actions">
              <a
                aria-label={`Alle dossiers: ${group.title}`}
                className="button button-secondary"
                href={route}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenDossiers(group.group);
                }}
              >
                Alle dossiers
              </a>
            </div>
          </section>
        );
      })}
    </>
  );
}

export function OperatorOverviewContent({
  evidenceState,
  onOpenCase,
  onOpenDossiers,
  onRefreshEvidence,
}: OperatorOverviewContentProps) {
  return (
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <div>
          <h1>Overzicht</h1>
        </div>
      </header>

      <EvidencePreview
        onOpenCase={onOpenCase}
        onOpenDossiers={onOpenDossiers}
        onRefresh={onRefreshEvidence}
        state={evidenceState}
      />
    </div>
  );
}

export function OperatorOverviewPageContent({
  navigate,
}: Readonly<{ navigate: AppNavigate }>) {
  const auth = useAuth();
  const accessToken = auth.session?.access_token ?? null;
  const evidence = useEvidenceReviewWorklist(accessToken);
  return (
    <OperatorOverviewContent
      evidenceState={evidence.state}
      onOpenCase={(caseRef) => {
        const route = buildEvidenceReviewDetailRoute(caseRef);
        if (route) navigate(route);
      }}
      onOpenDossiers={(group) => {
        navigate(buildEvidenceReviewWorklistGroupRoute(group));
      }}
      onRefreshEvidence={evidence.refresh}
    />
  );
}
