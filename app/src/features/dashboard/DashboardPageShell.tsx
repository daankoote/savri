import { useState } from "react";
import { ActivePrivateDashboard } from "./ActivePrivateDashboard";
import { ContactChoicePanel } from "./ContactChoicePanel";
import { DashboardSidebar } from "./DashboardSidebar";
import { TodoPlaceholderPanel } from "./TodoPlaceholderPanel";

type PortalSection = "active" | "history" | "contact";

export function DashboardPageShell() {
  const [activeSection, setActiveSection] = useState<PortalSection>("active");

  return (
    <main className="portal-shell">
      <DashboardSidebar activeSection={activeSection} onSelectSection={setActiveSection} />
      <section className="portal-main" aria-live="polite">
        {activeSection === "active" ? <ActivePrivateDashboard /> : null}
        {activeSection === "history" ? (
          <TodoPlaceholderPanel title="History" note="Afgeronde jaren en eerdere dossiers komen later hier." />
        ) : null}
        {activeSection === "contact" ? <ContactChoicePanel /> : null}
      </section>
    </main>
  );
}
