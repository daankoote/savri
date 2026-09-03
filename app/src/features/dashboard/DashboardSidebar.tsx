import { useAuth } from "../auth/AuthProvider";
import type { AppNavigate } from "../../routes/types";
import { clearDashboardReadCache } from "./dashboardReadCache";
import { clearSignupIntakeSession } from "../signup/signupIntakeCapabilityStore";
import { clearSignupSubmissionReceipt } from "../signup/signupSubmissionReceiptStore";
import { usePresentationBrand } from "../../shared/presentation/PresentationBrandProvider";
import type { SurfaceNavigationItem } from "../../shared/surfaces/surfaceModel";

type DashboardSidebarProps = {
  activeSection: "active" | "contact";
  collapsed?: boolean;
  id?: string;
  navigate: AppNavigate;
  onToggle?: () => void;
  onSelectSection: (section: "active" | "contact") => void;
  showToggle?: boolean;
};

export function DashboardSidebar({
  activeSection,
  collapsed = false,
  id,
  navigate,
  onToggle,
  onSelectSection,
  showToggle = false,
}: DashboardSidebarProps) {
  const auth = useAuth();
  const presentation = usePresentationBrand();
  const navigation = [
    {
      active: activeSection === "active",
      label: "Overzicht",
      onSelect: () => onSelectSection("active"),
    },
  ] satisfies readonly SurfaceNavigationItem[];

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
    <aside
      aria-label="Dashboard navigatie"
      className={collapsed
        ? "portal-sidebar portal-sidebar--collapsed"
        : "portal-sidebar"}
      id={id}
    >
      <div className="portal-sidebar-brand">
        <span className="brand-symbol" aria-hidden="true">
          {presentation.shortMark}
        </span>
        {!collapsed
          ? (
            <div>
              <strong>{presentation.displayName}</strong>
              <small>{presentation.productLabel}</small>
            </div>
          )
          : null}
      </div>

      {showToggle && onToggle
        ? (
          <button
            aria-controls={id}
            aria-expanded={!collapsed}
            aria-label={collapsed
              ? "Dashboardnavigatie openen"
              : "Dashboardnavigatie sluiten"}
            className="button button-secondary button-compact portal-sidebar-toggle"
            onClick={onToggle}
            title={collapsed ? "Navigatie openen" : "Navigatie sluiten"}
            type="button"
          >
            <span aria-hidden="true">☰</span>
            {!collapsed ? <span>Navigatie sluiten</span> : null}
          </button>
        )
        : null}

      {!collapsed
        ? (
          <>
            <div className="portal-user-block">
              <strong>{presentation.productLabel}</strong>
              <span>
                {auth.summary
                  ? `${auth.summary.dossiers.length} dossier${
                    auth.summary.dossiers.length === 1 ? "" : "s"
                  }`
                  : "Account"}
              </span>
            </div>

            <nav className="portal-nav" aria-label="Portaal menu">
              <button
                className="button button-primary portal-primary-action"
                onClick={handleNewApplication}
                type="button"
              >
                Nieuwe aanvraag
              </button>
              {navigation.map((item) => (
                <button
                  className={item.active
                    ? "portal-nav-item portal-nav-item-active"
                    : "portal-nav-item"}
                  key={item.label}
                  onClick={item.onSelect}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="portal-sidebar-divider" />

            <button
              className={activeSection === "contact"
                ? "portal-nav-item portal-nav-item-active"
                : "portal-nav-item"}
              onClick={() => onSelectSection("contact")}
              type="button"
            >
              Contact ENVAL
            </button>

            <div className="portal-sidebar-divider" />

            <div className="portal-sidebar-bottom">
              <button
                className="portal-nav-item"
                onClick={() => navigate("/")}
                type="button"
              >
                Naar website
              </button>
              <button
                className="portal-nav-item"
                onClick={handleLogout}
                type="button"
              >
                Uitloggen
              </button>
            </div>
          </>
        )
        : null}
    </aside>
  );
}
