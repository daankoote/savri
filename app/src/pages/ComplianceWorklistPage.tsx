import { ComplianceWorklistPageContent } from "../features/compliance/ComplianceWorklistPage.tsx";
import { DashboardRouteGuard } from "../features/auth/DashboardRouteGuard.tsx";
import type { RoutedPageProps } from "../routes/types.ts";
import { AppHeader } from "../shared/components/AppHeader.tsx";

export function ComplianceWorklistPage({ currentPath, navigate }: RoutedPageProps) {
  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <DashboardRouteGuard navigate={navigate}>
        <main className="page-shell">
          <section className="section">
            <div className="container">
              <ComplianceWorklistPageContent />
            </div>
          </section>
        </main>
      </DashboardRouteGuard>
    </div>
  );
}
