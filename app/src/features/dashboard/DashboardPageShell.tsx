import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ActivePrivateDashboard } from "./ActivePrivateDashboard";
import { ContactChoicePanel } from "./ContactChoicePanel";
import { DashboardSidebar } from "./DashboardSidebar";
import { TodoPlaceholderPanel } from "./TodoPlaceholderPanel";
import { useDashboardRead } from "./useDashboardRead";
import type { AppNavigate } from "../../routes/types";

type PortalSection = "active" | "history" | "contact";

export function DashboardPageShell({ navigate }: { navigate: AppNavigate }) {
  const auth = useAuth();
  const [activeSection, setActiveSection] = useState<PortalSection>("active");
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const authDossiers = auth.summary?.dossiers ?? [];
  const selectedDossierExists = authDossiers.some((dossier) => dossier.dossier_id === selectedDossierId);
  const effectiveDossierId = selectedDossierExists ? selectedDossierId : authDossiers[0]?.dossier_id ?? null;
  const cacheScope = auth.session && auth.summary ? `${auth.session.user.id}:${auth.summary.customer_id}` : null;
  const dashboardRead = useDashboardRead(auth.session?.access_token ?? null, cacheScope, effectiveDossierId);

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
            dashboardRead={dashboardRead}
            dossierOptions={dossierOptions}
            onSelectDossier={setSelectedDossierId}
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
