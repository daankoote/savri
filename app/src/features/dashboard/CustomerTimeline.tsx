import type { DashboardTimelineEvent } from "./dashboardTypes";
import type {
  CustomerInformationRequestHistoryEntryV1,
  CustomerInformationRequestV1,
} from "../../../../supabase/functions/_shared/app_customer_information_request.ts";

type CustomerTimelineProps = {
  events: readonly DashboardTimelineEvent[];
  informationRequest: CustomerInformationRequestV1 | null;
  informationRequestHistory:
    readonly CustomerInformationRequestHistoryEntryV1[];
};

export type CustomerTimelineItem = Readonly<{
  identity: string;
  occurredAt: string;
  title: string;
  text: string | null;
}>;

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function buildCustomerTimelineItems({
  events,
  informationRequest,
  informationRequestHistory,
}: CustomerTimelineProps): readonly CustomerTimelineItem[] {
  const items: Array<CustomerTimelineItem & { tieBreak: string }> = events.map(
    (event, index) => ({
      identity: `dossier:${event.event_id}`,
      occurredAt: event.occurred_at,
      title: event.title,
      text: event.text,
      tieBreak: `0:${String(index).padStart(3, "0")}`,
    }),
  );

  if (informationRequest) {
    items.push({
      identity:
        `information-request:active:${informationRequest.requestRef}:asked`,
      occurredAt: informationRequest.askedAt,
      title: "Vraag gesteld",
      text: informationRequest.question,
      tieBreak: `1:active:${informationRequest.requestRef}:2`,
    });
    if (
      informationRequest.state === "ANSWERED" &&
      informationRequest.answeredAt && informationRequest.answer
    ) {
      items.push({
        identity:
          `information-request:active:${informationRequest.requestRef}:answered`,
        occurredAt: informationRequest.answeredAt,
        title: "Antwoord verstuurd",
        text: informationRequest.answer,
        tieBreak: `1:active:${informationRequest.requestRef}:1`,
      });
    }
  }

  informationRequestHistory.forEach((entry, index) => {
    const conversation = String(index).padStart(2, "0");
    items.push({
      identity: `information-request:history:${conversation}:asked`,
      occurredAt: entry.askedAt,
      title: "Vraag gesteld",
      text: entry.question,
      tieBreak: `1:history:${conversation}:2`,
    });
    if (entry.status === "Afgerond") {
      items.push({
        identity: `information-request:history:${conversation}:answered`,
        occurredAt: entry.answeredAt,
        title: "Antwoord verstuurd",
        text: entry.answer,
        tieBreak: `1:history:${conversation}:1`,
      });
    }
    items.push({
      identity: `information-request:history:${conversation}:terminal`,
      occurredAt: entry.terminalAt,
      title: entry.status === "Afgerond"
        ? "Vraag afgerond"
        : "Vraag ingetrokken",
      text: null,
      tieBreak: `1:history:${conversation}:0`,
    });
  });

  return Object.freeze(
    items.sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      left.tieBreak.localeCompare(right.tieBreak)
    ).map(({ tieBreak: _tieBreak, ...item }) => Object.freeze(item)),
  );
}

export function CustomerTimeline(props: CustomerTimelineProps) {
  const items = buildCustomerTimelineItems(props);
  return (
    <section className="portal-card-compact" aria-labelledby="timeline-title">
      <h2 id="timeline-title">Tijdlijn</h2>
      {items.length
        ? (
          <ol className="portal-timeline">
            {items.map((item) => (
              <li key={item.identity}>
                <time dateTime={item.occurredAt}>
                  {dateTimeFormatter.format(new Date(item.occurredAt))}
                </time>
                <div>
                  <strong>{item.title}</strong>
                  {item.text ? <p>{item.text}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )
        : <p>Voor dit dossier is nog geen tijdlijn beschikbaar.</p>}
    </section>
  );
}
