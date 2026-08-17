import { DashboardRouteGuard } from "../features/auth/DashboardRouteGuard.tsx";
import { EvidenceReviewWorklistPageContent } from "../features/evidence-review/EvidenceReviewWorklistPage.tsx";
import type { RoutedPageProps } from "../routes/types.ts";
import { AppHeader } from "../shared/components/AppHeader.tsx";

export function EvidenceReviewWorklistPage({
  currentPath,
  navigate,
}: RoutedPageProps) {
  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <DashboardRouteGuard navigate={navigate}>
        <main className="page-shell">
          <section className="section">
            <div className="container">
              <EvidenceReviewWorklistPageContent />
            </div>
          </section>
        </main>
      </DashboardRouteGuard>
    </div>
  );
}
