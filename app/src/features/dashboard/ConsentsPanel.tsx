import type { DashboardConsent } from "./dashboardTypes";

type ConsentsPanelProps = {
  consents: DashboardConsent[];
};

export function ConsentsPanel({ consents }: ConsentsPanelProps) {
  return (
    <div className="dashboard-section-card">
      <h3>Toestemmingen</h3>
      <div className="readable-check-list">
        {consents.map((consent) => (
          <div className="readable-check" key={consent.id}>
            <span>{consent.title}</span>
            <strong>{consent.status} — {consent.version}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
