import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ActivePrivateDashboard } from "./ActivePrivateDashboard";
import { ContactChoicePanel } from "./ContactChoicePanel";
import { DashboardSidebar } from "./DashboardSidebar";
import { useDashboardRead } from "./useDashboardRead";
import { useCustomerCorrectionHandoff } from "./useCustomerCorrectionHandoff";
import type { AppNavigate } from "../../routes/types";
import { clearSignupIntakeSession } from "../signup/signupIntakeCapabilityStore";
import { clearSignupSubmissionReceipt } from "../signup/signupSubmissionReceiptStore";
import { SurfaceShell } from "../../shared/components/SurfaceShell";

type PortalSection = "active" | "contact";

export function DashboardPageShell({ navigate }: { navigate: AppNavigate }) {
  const auth = useAuth();
  const [activeSection, setActiveSection] = useState<PortalSection>("active");
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(
    null,
  );
  const authDossiers = auth.summary?.dossiers ?? [];
  const selectedDossierExists = authDossiers.some((dossier) =>
    dossier.dossier_id === selectedDossierId
  );
  const effectiveDossierId = selectedDossierExists
    ? selectedDossierId
    : authDossiers[0]?.dossier_id ?? null;
  const cacheScope = auth.session && auth.summary ? auth.session.user.id : null;
  const dashboardRead = useDashboardRead(
    auth.session?.access_token ?? null,
    cacheScope,
    effectiveDossierId,
  );
  const selectedCaseRef = activeSection === "active"
    ? authDossiers.find((dossier) => dossier.dossier_id === effectiveDossierId)
      ?.case_reference ?? null
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

  function startNewApplication() {
    clearSignupIntakeSession();
    clearSignupSubmissionReceipt();
    navigate("/aanmelden");
  }

  useEffect(() => {
    if (!selectedDossierExists) {
      setSelectedDossierId(authDossiers[0]?.dossier_id ?? null);
    }
  }, [authDossiers, selectedDossierExists]);

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

  const dossierOptions = useMemo(() => authDossiers, [authDossiers]);

  return (
    <SurfaceShell
      as="main"
      className={sidebarOpen
        ? "portal-shell"
        : "portal-shell portal-shell--sidebar-collapsed"}
      navigation={
        <DashboardSidebar
          activeSection={activeSection}
          collapsed={!sidebarOpen}
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
        {activeSection === "active"
          ? (
            <ActivePrivateDashboard
              accessToken={auth.session?.access_token ?? null}
              correctionHandoff={correctionHandoff}
              dashboardRead={dashboardRead}
              dossierOptions={dossierOptions}
              onSelectDossier={setSelectedDossierId}
              onRefreshSelectedDossier={dashboardRead.refreshSelectedDossier}
              onStartNewApplication={startNewApplication}
              selectedDossierId={effectiveDossierId}
            />
          )
          : null}
        {activeSection === "contact" ? <ContactChoicePanel /> : null}
      </section>
    </SurfaceShell>
  );
}
