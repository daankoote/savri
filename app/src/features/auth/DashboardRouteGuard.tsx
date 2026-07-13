import { useEffect, type ReactNode } from "react";
import type { AppNavigate } from "../../routes/types";
import { useAuth } from "./AuthProvider";

type DashboardRouteGuardProps = {
  children: ReactNode;
  navigate: AppNavigate;
};

export function DashboardRouteGuard({ children, navigate }: DashboardRouteGuardProps) {
  const auth = useAuth();

  useEffect(() => {
    if (auth.status === "signed_out") {
      navigate("/account");
    }
  }, [auth.status, navigate]);

  if (auth.status === "initializing" || auth.status === "authenticated_unbound" || auth.status === "bootstrapping") {
    return (
      <main className="page-shell">
        <section className="section">
          <div className="container">
            <div className="review-panel" role="status" aria-live="polite">
              <h3>Klantportaal laden</h3>
              <p>We controleren uw accountkoppeling.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (auth.status === "error") {
    return (
      <main className="page-shell">
        <section className="section">
          <div className="container">
            <div className="review-panel" role="alert">
              <h3>Inloggen niet gelukt</h3>
              <p>{auth.error?.message || "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw."}</p>
              <div className="section-actions">
                <button className="button button-primary" onClick={() => void auth.retryBootstrap()} type="button">
                  Opnieuw proberen
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    void auth.signOut().then(() => navigate("/account"));
                  }}
                  type="button"
                >
                  Uitloggen
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (auth.status !== "ready") {
    return null;
  }

  return <>{children}</>;
}
