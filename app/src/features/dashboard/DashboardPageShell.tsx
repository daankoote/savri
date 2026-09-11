import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  ActivePrivateDashboard,
  DashboardNotice,
} from "./ActivePrivateDashboard";
import { ContactChoicePanel } from "./ContactChoicePanel";
import { CustomerApplicationList } from "./CustomerApplicationList";
import { DashboardSidebar } from "./DashboardSidebar";
import { useDashboardApplications, useDashboardRead } from "./useDashboardRead";
import { useCustomerCorrectionHandoff } from "./useCustomerCorrectionHandoff";
import type { AppNavigate } from "../../routes/types";
import { SurfaceShell } from "../../shared/components/SurfaceShell";
import { parseDashboardApplicationsRoute } from "./dashboardRoutes";

type PortalSection = "active" | "contact";

export function DashboardPageShell({
  currentPath,
  navigate,
}: {
  currentPath: string;
  navigate: AppNavigate;
}) {
  const auth = useAuth();
  const [activeSection, setActiveSection] = useState<PortalSection>("active");
  const cacheScope = auth.session && auth.summary ? auth.session.user.id : null;
  const applicationsRead = useDashboardApplications(
    auth.session?.access_token ?? null,
    cacheScope,
  );
  const applications = applicationsRead.model?.applications ?? [];
  const route = parseDashboardApplicationsRoute(currentPath);
  const selectedApplication = route?.kind === "detail"
    ? applications.find((application) =>
      application.case_reference === route.caseReference
    ) ?? null
    : null;
  const effectiveDossierId = selectedApplication?.dossier_id ?? null;
  const dashboardRead = useDashboardRead(
    auth.session?.access_token ?? null,
    cacheScope,
    effectiveDossierId,
  );
  const selectedCaseRef = activeSection === "active"
    ? selectedApplication?.case_reference ?? null
    : null;
  const correctionHandoff = useCustomerCorrectionHandoff(
    auth.session?.access_token ?? null,
    cacheScope,
    selectedCaseRef,
  );
  const actionableDocumentWorkflow = activeSection === "active" &&
    correctionHandoff.status === "ready" &&
    correctionHandoff.model.handoff !== null;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const previousActionableWorkflow = useRef(false);

  useEffect(() => {
    if (
      actionableDocumentWorkflow && !previousActionableWorkflow.current
    ) {
      setSidebarOpen(false);
    } else if (
      !actionableDocumentWorkflow && previousActionableWorkflow.current
    ) {
      setSidebarOpen(true);
    }
    previousActionableWorkflow.current = actionableDocumentWorkflow;
  }, [actionableDocumentWorkflow]);

  return (
    <SurfaceShell
      as="main"
      className={sidebarOpen
        ? "portal-shell"
        : "portal-shell portal-shell--sidebar-collapsed"}
      navigation={
        <DashboardSidebar
          activeSection={activeSection}
          applications={applications}
          collapsed={!sidebarOpen}
          currentCaseReference={selectedCaseRef}
          id="portal-dashboard-sidebar"
          navigate={navigate}
          onToggle={() => setSidebarOpen((current) => !current)}
          onSelectSection={setActiveSection}
          showToggle={actionableDocumentWorkflow}
        />
      }
      platformAttribution
      surface="tenant_customer"
    >
      <section className="portal-main" aria-live="polite">
        {activeSection === "active" &&
            (applicationsRead.status === "loading" ||
              applicationsRead.status === "retrying")
          ? (
            <DashboardNotice
              note="Even geduld."
              title="Aanvragen laden"
            />
          )
          : null}
        {activeSection === "active" && applicationsRead.status === "error"
          ? (
            <DashboardNotice
              action={
                <button
                  className="button button-secondary button-compact"
                  onClick={applicationsRead.retry}
                  type="button"
                >
                  Opnieuw proberen
                </button>
              }
              note={applicationsRead.error.message}
              title="Aanvragen niet beschikbaar"
            />
          )
          : null}
        {activeSection === "active" && applicationsRead.status === "ready" &&
            route?.kind === "index"
          ? (
            <CustomerApplicationList
              applications={applications}
              navigate={navigate}
            />
          )
          : null}
        {activeSection === "active" && applicationsRead.status === "ready" &&
            (route?.kind === "unknown" ||
              (route?.kind === "detail" && !selectedApplication))
          ? (
            <DashboardNotice
              note="Deze aanvraag is niet beschikbaar voor dit account."
              title="Aanvraag niet gevonden"
            />
          )
          : null}
        {activeSection === "active" && selectedApplication
          ? (
            <ActivePrivateDashboard
              accessToken={auth.session?.access_token ?? null}
              application={selectedApplication}
              correctionHandoff={correctionHandoff}
              dashboardRead={dashboardRead}
              onRefreshSelectedDossier={dashboardRead.refreshSelectedDossier}
              selectedDossierId={effectiveDossierId}
            />
          )
          : null}
        {activeSection === "contact" ? <ContactChoicePanel /> : null}
      </section>
    </SurfaceShell>
  );
}
