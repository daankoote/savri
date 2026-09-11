import type { DashboardTimelineEvent } from "./dashboardTypes";

type CustomerTimelineProps = {
  events: DashboardTimelineEvent[];
};

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function CustomerTimeline({ events }: CustomerTimelineProps) {
  return (
    <section className="portal-card-compact" aria-labelledby="timeline-title">
      <h2 id="timeline-title">Tijdlijn</h2>
      {events.length
        ? (
          <ol className="portal-timeline">
            {events.map((event) => (
              <li key={event.event_id}>
                <time dateTime={event.occurred_at}>
                  {dateTimeFormatter.format(new Date(event.occurred_at))}
                </time>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )
        : <p>Voor dit dossier is nog geen tijdlijn beschikbaar.</p>}
    </section>
  );
}
