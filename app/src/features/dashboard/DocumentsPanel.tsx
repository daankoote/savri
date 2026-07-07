import type { DashboardDocument } from "./dashboardTypes";

type DocumentsPanelProps = {
  documents: DashboardDocument[];
};

export function DocumentsPanel({ documents }: DocumentsPanelProps) {
  return (
    <div className="dashboard-section-card">
      <h3>Documenten</h3>
      <div className="readable-check-list">
        {documents.map((document) => (
          <div className="readable-check" key={document.id}>
            <span>{document.title}</span>
            <strong>{document.status}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
