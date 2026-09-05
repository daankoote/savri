import { useAuth } from "../auth/AuthProvider.tsx";
import { EvidenceReviewCaseRow } from "../evidence-review/EvidenceReviewWorklistPage.tsx";
import { buildEvidenceReviewDetailRoute } from "../evidence-review/evidenceReviewRoutes.ts";
import {
  type EvidenceReviewWorklistReadState,
  useEvidenceReviewWorklist,
} from "../evidence-review/useEvidenceReviewWorklist.ts";
import type { AppNavigate } from "../../routes/types.ts";

const PREVIEW_LIMIT = 3;

type OperatorOverviewContentProps = Readonly<{
  evidenceState: EvidenceReviewWorklistReadState;
  onOpenCase: (caseRef: string) => void;
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
  onRefresh,
}: Readonly<{
  state: EvidenceReviewWorklistReadState;
  onOpenCase: (caseRef: string) => void;
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

  return (
    <>
      <section
        className="portal-card-compact"
        aria-labelledby="to-review-title"
      >
        <div>
          <h2 id="to-review-title">Te beoordelen</h2>
        </div>
        {toReview.length > 0
          ? (
            <ul className="portal-row-list" aria-label="Te beoordelen dossiers">
              {toReview.map((item) => (
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
              <h3>Geen dossiers te beoordelen</h3>
            </div>
          )}
      </section>

      <section
        className="portal-card-compact"
        aria-labelledby="waiting-customer-title"
      >
        <div>
          <h2 id="waiting-customer-title">Wacht op klant</h2>
        </div>
        {waitingCustomer.length > 0
          ? (
            <ul
              className="portal-row-list"
              aria-label="Dossiers die wachten op klant"
            >
              {waitingCustomer.map((item) => (
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
              <h3>Geen dossiers wachten op klant</h3>
            </div>
          )}
      </section>
    </>
  );
}

export function OperatorOverviewContent({
  evidenceState,
  onOpenCase,
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
      onRefreshEvidence={evidence.refresh}
    />
  );
}
