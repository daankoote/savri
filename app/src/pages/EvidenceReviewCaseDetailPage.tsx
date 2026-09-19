import { EvidenceReviewCaseDetailPageContent } from "../features/evidence-review/EvidenceReviewCaseDetailPage.tsx";
import { OperatorRouteGuard } from "../features/operator/OperatorRouteGuard.tsx";
import { buildOperatorNavigation } from "../features/operator/operatorNavigation.ts";
import type { RoutedPageProps } from "../routes/types.ts";
import { AppHeader } from "../shared/components/AppHeader.tsx";
import { SurfaceShell } from "../shared/components/SurfaceShell.tsx";

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
    <OperatorRouteGuard
      navigate={navigate}
      requiredCapability="evidence.review.view"
      returnTo={currentPath}
    >
      {(context, logout, switchPortal) => (
        <SurfaceShell
          navigation={
            <AppHeader
              currentPath={currentPath}
              identitySurface="tenant_operator"
              navigate={navigate}
              navigation={buildOperatorNavigation(
                context,
                currentPath,
                switchPortal,
              )}
              onLogout={logout}
              surface="tenant_operator"
            />
          }
          platformAttribution
          surface="tenant_operator"
        >
          <main className="page-shell">
            <section className="section">
              <div className="container">
                <EvidenceReviewCaseDetailPageContent
                  caseRef={caseRef}
                  onBack={() => navigate("/beheer/dossiers")}
                />
              </div>
            </section>
          </main>
        </SurfaceShell>
      )}
    </OperatorRouteGuard>
  );
}
