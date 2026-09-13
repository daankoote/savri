import { ComplianceWorklistPageContent } from "../features/compliance/ComplianceWorklistPage.tsx";
import { OperatorRouteGuard } from "../features/operator/OperatorRouteGuard.tsx";
import { buildOperatorNavigation } from "../features/operator/operatorNavigation.ts";
import type { RoutedPageProps } from "../routes/types.ts";
import { AppHeader } from "../shared/components/AppHeader.tsx";
import { SurfaceShell } from "../shared/components/SurfaceShell.tsx";

export function ComplianceWorklistPage(
  { currentPath, navigate }: RoutedPageProps,
) {
  return (
    <OperatorRouteGuard
      navigate={navigate}
      requiredCapability="compliance.delivery_year.view"
      returnTo={currentPath}
    >
      {(context) => (
        <SurfaceShell
          navigation={
            <AppHeader
              authenticatedIdentitySurface="tenant_operator"
              currentPath={currentPath}
              navigate={navigate}
              navigation={buildOperatorNavigation(context, currentPath)}
              surface="tenant_operator"
            />
          }
          platformAttribution
          surface="tenant_operator"
        >
          <main className="page-shell">
            <section className="section">
              <div className="container">
                <ComplianceWorklistPageContent />
              </div>
            </section>
          </main>
        </SurfaceShell>
      )}
    </OperatorRouteGuard>
  );
}
