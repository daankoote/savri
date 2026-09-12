import type {
  CustomerInformationRequestHistoryEntryV1,
} from "../../../../supabase/functions/_shared/app_customer_information_request.ts";

type Props = Readonly<{
  entries: readonly CustomerInformationRequestHistoryEntryV1[];
}>;

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function CustomerInformationRequestHistory({ entries }: Props) {
  if (!entries.length) return null;

  return (
    <section
      className="portal-card-compact"
      aria-labelledby="information-request-history-title"
    >
      <h2 id="information-request-history-title">
        Eerdere vragen en antwoorden
      </h2>
      <ol className="portal-timeline">
        {entries.map((entry, index) => (
          <li key={`${entry.askedAt}-${index}`}>
            <time dateTime={entry.askedAt}>
              {dateTimeFormatter.format(new Date(entry.askedAt))}
            </time>
            <div>
              <strong>{entry.status}</strong>
              <p>{entry.question}</p>
              {entry.status === "Afgerond"
                ? (
                  <>
                    <p>
                      Antwoord op {dateTimeFormatter.format(
                        new Date(entry.answeredAt),
                      )}
                    </p>
                    <p>{entry.answer}</p>
                  </>
                )
                : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
