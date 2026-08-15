import { useAuth } from "../auth/AuthProvider";
import type { AppNavigate } from "../../routes/types";
import { clearDashboardReadCache } from "./dashboardReadCache";
import { clearSignupIntakeSession } from "../signup/signupIntakeCapabilityStore";
import { clearSignupSubmissionReceipt } from "../signup/signupSubmissionReceiptStore";

type DashboardSidebarProps = {
  activeSection: "active" | "history" | "contact";
  navigate: AppNavigate;
  onSelectSection: (section: "active" | "history" | "contact") => void;
};

export function DashboardSidebar({ activeSection, navigate, onSelectSection }: DashboardSidebarProps) {
  const auth = useAuth();

  function handleLogout() {
    clearDashboardReadCache();
    void auth.signOut().then(() => navigate("/account"));
  }

  function handleNewApplication() {
    clearSignupIntakeSession();
    clearSignupSubmissionReceipt();
    navigate("/aanmelden");
  }

  return (
    <aside className="portal-sidebar" aria-label="Dashboard navigatie">
      <div className="portal-sidebar-brand">
        <span className="brand-symbol" aria-hidden="true">E</span>
        <div>
          <strong>ENVAL</strong>
          <small>Klantportaal</small>
        </div>
      </div>

      <div className="portal-user-block">
        <strong>Klantportaal</strong>
        <span>{auth.summary ? `${auth.summary.dossiers.length} dossier${auth.summary.dossiers.length === 1 ? "" : "s"}` : "Account"}</span>
      </div>

      <nav className="portal-nav" aria-label="Portaal menu">
        <button
          className="button button-primary portal-primary-action"
          onClick={handleNewApplication}
          type="button"
        >
          Nieuwe aanvraag
        </button>
        <button
          className={activeSection === "active" ? "portal-nav-item portal-nav-item-active" : "portal-nav-item"}
          onClick={() => onSelectSection("active")}
          type="button"
        >
          Actief
        </button>
        <button
          className={activeSection === "history" ? "portal-nav-item portal-nav-item-active" : "portal-nav-item"}
          onClick={() => onSelectSection("history")}
          type="button"
        >
          History
        </button>
      </nav>

      <div className="portal-sidebar-divider" />

      <button
        className={activeSection === "contact" ? "portal-nav-item portal-nav-item-active" : "portal-nav-item"}
        onClick={() => onSelectSection("contact")}
        type="button"
      >
        Contact ENVAL
      </button>

      <div className="portal-sidebar-divider" />

      <div className="portal-sidebar-bottom">
        <button className="portal-nav-item" onClick={() => navigate("/")} type="button">Naar website</button>
        <button className="portal-nav-item" type="button">Settings</button>
        <button className="portal-nav-item" onClick={handleLogout} type="button">Uitloggen</button>
      </div>
    </aside>
  );
}
