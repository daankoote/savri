import { EvidenceReviewWorklistPageContent } from "../features/evidence-review/EvidenceReviewWorklistPage.tsx";
import { OperatorRouteGuard } from "../features/operator/OperatorRouteGuard.tsx";
import { buildOperatorNavigation } from "../features/operator/operatorNavigation.ts";
import type { RoutedPageProps } from "../routes/types.ts";
import { AppHeader } from "../shared/components/AppHeader.tsx";
import { SurfaceShell } from "../shared/components/SurfaceShell.tsx";

export function EvidenceReviewWorklistPage({
  currentPath,
  navigate,
}: RoutedPageProps) {
  return (
    <OperatorRouteGuard
      navigate={navigate}
      requiredCapability="evidence.review.view"
      returnTo={currentPath}
    >
      {(context) => (
        <SurfaceShell
          navigation={
            <AppHeader
              currentPath={currentPath}
              navigate={navigate}
              navigation={buildOperatorNavigation(context)}
              surface="tenant_operator"
            />
          }
          platformAttribution
          surface="tenant_operator"
        >
          <main className="page-shell">
            <section className="section">
              <div className="container">
                <EvidenceReviewWorklistPageContent navigate={navigate} />
              </div>
            </section>
          </main>
        </SurfaceShell>
      )}
    </OperatorRouteGuard>
  );
}
