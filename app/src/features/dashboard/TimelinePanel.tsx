import type { DashboardTimelineEvent } from "./dashboardTypes";

type TimelinePanelProps = {
  events: DashboardTimelineEvent[];
};

export function TimelinePanel({ events }: TimelinePanelProps) {
  return (
    <div className="dashboard-section-card">
      <h3>Tijdlijn</h3>
      <div className="timeline-list">
        {events.map((event) => (
          <div className="timeline-item" key={event.id}>
            <span className="timeline-dot" aria-hidden="true" />
            <div>
              <strong>{event.label}</strong>
              <p>{event.date} — {event.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
