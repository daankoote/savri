import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ActivePrivateDashboard } from "./ActivePrivateDashboard";
import { ContactChoicePanel } from "./ContactChoicePanel";
import { DashboardSidebar } from "./DashboardSidebar";
import { TodoPlaceholderPanel } from "./TodoPlaceholderPanel";
import { useDashboardRead } from "./useDashboardRead";
import type { AppNavigate } from "../../routes/types";
import { clearSignupIntakeSession } from "../signup/signupIntakeCapabilityStore";
import { clearSignupSubmissionReceipt } from "../signup/signupSubmissionReceiptStore";

type PortalSection = "active" | "history" | "contact";

export function DashboardPageShell({ navigate }: { navigate: AppNavigate }) {
  const auth = useAuth();
  const [activeSection, setActiveSection] = useState<PortalSection>("active");
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const authDossiers = auth.summary?.dossiers ?? [];
  const selectedDossierExists = authDossiers.some((dossier) => dossier.dossier_id === selectedDossierId);
  const effectiveDossierId = selectedDossierExists ? selectedDossierId : authDossiers[0]?.dossier_id ?? null;
  const cacheScope = auth.session && auth.summary ? auth.session.user.id : null;
  const dashboardRead = useDashboardRead(auth.session?.access_token ?? null, cacheScope, effectiveDossierId);

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

  const dossierOptions = useMemo(() => authDossiers, [authDossiers]);

  return (
    <main className="portal-shell">
      <DashboardSidebar activeSection={activeSection} navigate={navigate} onSelectSection={setActiveSection} />
      <section className="portal-main" aria-live="polite">
        {activeSection === "active" ? (
          <ActivePrivateDashboard
            accessToken={auth.session?.access_token ?? null}
            dashboardRead={dashboardRead}
            dossierOptions={dossierOptions}
            onSelectDossier={setSelectedDossierId}
            onRefreshSelectedDossier={dashboardRead.refreshSelectedDossier}
            onStartNewApplication={startNewApplication}
            selectedDossierId={effectiveDossierId}
          />
        ) : null}
        {activeSection === "history" ? (
          <TodoPlaceholderPanel title="History" note="Afgeronde jaren en eerdere dossiers komen later hier." />
        ) : null}
        {activeSection === "contact" ? <ContactChoicePanel /> : null}
      </section>
    </main>
  );
}
