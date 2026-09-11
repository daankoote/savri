import type { MouseEvent } from "react";
import type { AppNavigate } from "../../routes/types";
import type { DashboardDossierSummary } from "./dashboardTypes";
import { buildDashboardApplicationRoute } from "./dashboardRoutes";

export function CustomerApplicationList({
  applications,
  navigate,
}: {
  applications: DashboardDossierSummary[];
  navigate: AppNavigate;
}) {
  return (
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <h1>Aanvragen</h1>
      </header>
      <section className="portal-card-compact" aria-label="Aanvragen">
        {applications.length
          ? (
            <nav className="portal-nav" aria-label="Beschikbare aanvragen">
              {applications.map((application) => (
                <a
                  className="portal-nav-item"
                  href={buildDashboardApplicationRoute(
                    application.case_reference,
                  )}
                  key={application.case_reference}
                  onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                    event.preventDefault();
                    navigate(
                      buildDashboardApplicationRoute(
                        application.case_reference,
                      ),
                    );
                  }}
                >
                  <span>{application.application_label}</span>
                  <small>{accountTypeLabel(application.account_type)}</small>
                </a>
              ))}
            </nav>
          )
          : <p>Er zijn geen aanvragen beschikbaar.</p>}
      </section>
    </div>
  );
}

function accountTypeLabel(
  accountType: DashboardDossierSummary["account_type"],
): string {
  if (accountType === "zakelijk") return "Zakelijk";
  if (accountType === "vve") return "VvE";
  return "Particulier";
}
