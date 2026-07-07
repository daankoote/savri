import type { DashboardRequest } from "./dashboardTypes";

type OpenRequestsPanelProps = {
  requests: DashboardRequest[];
};

export function OpenRequestsPanel({ requests }: OpenRequestsPanelProps) {
  return (
    <section className="dashboard-card dashboard-panel" aria-labelledby="open-requests-title">
      <div className="dashboard-panel-header">
        <div>
          <p className="eyebrow">Acties</p>
          <h2 id="open-requests-title">Open verzoeken</h2>
        </div>
      </div>

      <div className="request-list">
        {requests.map((request) => (
          <article className="request-item" key={request.id}>
            <div>
              <h3>{request.title}</h3>
              <p>{request.scope} — {request.urgency}</p>
            </div>
            <span className="status-pill status-pill-warning">{request.status}</span>
            <button className="button button-secondary" type="button">
              {request.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
