import { DashboardRouteGuard } from "../features/auth/DashboardRouteGuard.tsx";
import { EvidenceReviewCaseDetailPageContent } from "../features/evidence-review/EvidenceReviewCaseDetailPage.tsx";
import type { RoutedPageProps } from "../routes/types.ts";
import { AppHeader } from "../shared/components/AppHeader.tsx";

type EvidenceReviewCaseDetailPageProps =
  & RoutedPageProps
  & Readonly<{
    caseRef: string;
  }>;

export function EvidenceReviewCaseDetailPage({
  caseRef,
  currentPath,
  navigate,
}: EvidenceReviewCaseDetailPageProps) {
  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <DashboardRouteGuard navigate={navigate} returnTo={currentPath}>
        <main className="page-shell">
          <section className="section">
            <div className="container">
              <EvidenceReviewCaseDetailPageContent
                caseRef={caseRef}
                onBack={() => navigate("/intern/dossiers")}
              />
            </div>
          </section>
        </main>
      </DashboardRouteGuard>
    </div>
  );
}
