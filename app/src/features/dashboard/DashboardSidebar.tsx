import type { MouseEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { AppNavigate } from "../../routes/types";
import { clearDashboardReadCache } from "./dashboardReadCache";
import { clearSignupIntakeSession } from "../signup/signupIntakeCapabilityStore";
import { clearSignupSubmissionReceipt } from "../signup/signupSubmissionReceiptStore";
import {
  projectPresentationSurfaceIdentity,
  usePresentationBrand,
} from "../../shared/presentation/PresentationBrandProvider";
import { completeAuthLogout } from "../auth/authUxFlow";
import { AUTH_LOGIN_ROUTE } from "../auth/authUxFlow";
import { canSwitchAuthorizedPortal } from "../auth/postLoginNavigation";
import type { DashboardDossierSummary } from "./dashboardTypes";
import {
  buildDashboardApplicationRoute,
  DASHBOARD_APPLICATIONS_ROUTE,
} from "./dashboardRoutes";

type DashboardSidebarProps = {
  activeSection: "active" | "contact";
  applications: DashboardDossierSummary[];
  collapsed?: boolean;
  currentCaseReference: string | null;
  id?: string;
  navigate: AppNavigate;
  onToggle?: () => void;
  onSelectSection: (section: "active" | "contact") => void;
  showToggle?: boolean;
};

export function DashboardSidebar({
  activeSection,
  applications,
  collapsed = false,
  currentCaseReference,
  id,
  navigate,
  onToggle,
  onSelectSection,
  showToggle = false,
}: DashboardSidebarProps) {
  const auth = useAuth();
  const presentation = usePresentationBrand();
  const identity = projectPresentationSurfaceIdentity(
    presentation,
    "tenant_customer",
  );

  function handleLogout() {
    void completeAuthLogout({
      navigate,
      onSuccess: clearDashboardReadCache,
      signOut: auth.signOut,
    });
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
          {identity.shortMark}
        </span>
        {!collapsed
          ? (
            <div>
              <strong>{identity.organizationName}</strong>
              <small>{identity.contextLabel}</small>
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
              <span>
                {applications.length
                  ? `${applications.length} aanvraag${
                    applications.length === 1 ? "" : "en"
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
              <a
                className={activeSection === "active"
                  ? "portal-nav-item portal-nav-item-active"
                  : "portal-nav-item"}
                href={DASHBOARD_APPLICATIONS_ROUTE}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  event.preventDefault();
                  onSelectSection("active");
                  navigate(DASHBOARD_APPLICATIONS_ROUTE);
                }}
              >
                Aanvragen
              </a>
              {applications.map((application) => (
                <a
                  aria-current={currentCaseReference ===
                      application.case_reference
                    ? "page"
                    : undefined}
                  className={currentCaseReference ===
                      application.case_reference
                    ? "portal-nav-subitem portal-nav-item-active"
                    : "portal-nav-subitem"}
                  href={buildDashboardApplicationRoute(
                    application.case_reference,
                  )}
                  key={application.case_reference}
                  onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                    event.preventDefault();
                    onSelectSection("active");
                    navigate(
                      buildDashboardApplicationRoute(
                        application.case_reference,
                      ),
                    );
                  }}
                >
                  {application.application_label}
                </a>
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
              Contact {presentation.displayName}
            </button>

            <div className="portal-sidebar-divider" />

            <div className="portal-sidebar-bottom">
              <a
                className="portal-nav-item"
                href={presentation.identity.websiteUrl}
              >
                Naar website
              </a>
              {canSwitchAuthorizedPortal(auth.portalNavigation)
                ? (
                  <button
                    className="portal-nav-item"
                    onClick={() => navigate(AUTH_LOGIN_ROUTE)}
                    type="button"
                  >
                    Portaal wisselen
                  </button>
                )
                : null}
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
