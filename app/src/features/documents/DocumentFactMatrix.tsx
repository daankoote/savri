import type { ReactNode } from "react";
import {
  CustomerDocumentFactInteraction,
  type CustomerDocumentFactInteractionModel,
  type CustomerDocumentFactSourceChoice,
} from "./CustomerDocumentFactInteraction";

export type DocumentFactMatrixColumns = Readonly<{
  label?: string;
  value?: string;
  sources?: string | null;
  actions?: string | null;
  status?: string | null;
}>;

export type DocumentFactMatrixRow = Readonly<{
  id: string;
  label: ReactNode;
  value: ReactNode;
  sources?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  hidden?: boolean;
}>;

export const CUSTOMER_DOCUMENT_FACT_MATRIX_COLUMNS = Object.freeze({
  given: "Gegeven",
  source: "Bron",
  sourceInfo: "Info uit bron",
  customer: "Klant",
  enval: "ENVAL",
  reason: "Reden",
  instruction: "Toelichting",
});

export type CustomerDocumentFactMatrixRow = Readonly<{
  id: string;
  given: ReactNode;
  correctionDetails?: readonly Readonly<{
    id: string;
    reason: ReactNode;
    instruction: ReactNode;
  }>[];
  sources: readonly CustomerDocumentFactSourceChoice[];
  customer: CustomerDocumentFactInteractionModel;
  enval:
    | "Nog te beoordelen"
    | "Wacht op klant"
    | "Akkoord"
    | "Correctie nodig"
    | "Klant bevestigd"
    | "ENVAL checken";
  hidden?: boolean;
}>;

type DocumentFactMatrixProps = Readonly<{
  rows: readonly (DocumentFactMatrixRow | CustomerDocumentFactMatrixRow)[];
  variant: "customer" | "review" | "document";
  columns?: DocumentFactMatrixColumns;
}>;

export function DocumentFactMatrix({
  columns = {},
  rows,
  variant,
}: DocumentFactMatrixProps) {
  if (variant === "customer") {
    const visibleRows = (rows as readonly CustomerDocumentFactMatrixRow[])
      .filter((row) => !row.hidden);
    if (visibleRows.length === 0) return null;
    return (
      <div className="fact-table fact-table--customer" role="table">
        <div className="fact-table__header" role="row">
          {Object.values(CUSTOMER_DOCUMENT_FACT_MATRIX_COLUMNS).map((label) => (
            <span key={label} role="columnheader">{label}</span>
          ))}
        </div>
        {visibleRows.map((row) => {
          const givenCellId = `customer-fact-given-${row.id}`;
          const correctionDetails = row.correctionDetails || [];
          return (
            <div
              aria-labelledby={givenCellId}
              className="fact-table__row-group"
              key={row.id}
              role="rowgroup"
            >
              <div className="fact-table__row" role="row">
                <span data-label="Gegeven" id={givenCellId} role="cell">
                  {row.given}
                </span>
                <span
                  aria-colspan={2}
                  className="fact-table__source-pairs"
                  role="cell"
                >
                  {row.sources.length === 0
                    ? (
                      <span
                        aria-label="Geen document gekozen: gegeven ontbreekt"
                        className="fact-table__source-pair"
                        role="group"
                      >
                        <span className="fact-table__source" data-label="Bron">
                          Geen document gekozen
                        </span>
                        <span
                          className="fact-table__source-info"
                          data-label="Info uit bron"
                        >
                          Gegeven ontbreekt
                        </span>
                      </span>
                    )
                    : row.sources.map((source) => (
                      <span
                        aria-label={`${source.documentLabel}: ${
                          source.value || "Gegeven ontbreekt"
                        }`}
                        className="fact-table__source-pair"
                        key={source.id}
                        role="group"
                      >
                        <span
                          className="fact-table__source fact-table__ellipsis"
                          data-label="Bron"
                          title={source.documentLabel}
                        >
                          {source.documentLabel}
                        </span>
                        <span
                          className={source.selected
                            ? "fact-table__source-info fact-table__ellipsis customer-fact-confirmed-value"
                            : "fact-table__source-info fact-table__ellipsis"}
                          data-label="Info uit bron"
                          title={source.value || "Gegeven ontbreekt"}
                        >
                          {source.value || "Gegeven ontbreekt"}
                        </span>
                      </span>
                    ))}
                </span>
                <span
                  className="fact-table__customer"
                  data-label="Klant"
                  role="cell"
                >
                  <CustomerDocumentFactInteraction
                    model={row.customer}
                    sourceChoices={row.sources}
                  />
                </span>
                <span
                  className="fact-table__enval"
                  data-label="ENVAL"
                  role="cell"
                >
                  <span
                    className={row.enval === "Wacht op klant"
                      ? "status-pill"
                      : row.enval === "Correctie nodig"
                      ? "status-pill status-pill-danger"
                      : row.enval === "Akkoord" ||
                          row.enval === "Klant bevestigd"
                      ? "status-pill status-pill-ok"
                      : "status-pill status-pill-warning"}
                  >
                    {row.enval}
                  </span>
                </span>
                <span
                  className="fact-table__correction-reason"
                  data-label="Reden"
                  role="cell"
                >
                  {correctionDetails.length > 0
                    ? (
                      <span className="fact-review-assessment">
                        {correctionDetails.map((detail) => (
                          <span key={detail.id}>{detail.reason}</span>
                        ))}
                      </span>
                    )
                    : "—"}
                </span>
                <span
                  className="fact-table__correction-instruction"
                  data-label="Toelichting"
                  role="cell"
                >
                  {correctionDetails.length > 0
                    ? (
                      <span className="fact-review-assessment">
                        {correctionDetails.map((detail) => (
                          <span key={detail.id}>{detail.instruction}</span>
                        ))}
                      </span>
                    )
                    : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  const headers = {
    label: columns.label || "Gegeven",
    value: columns.value || "Waarde",
    sources: columns.sources === undefined ? "Bronnen" : columns.sources,
    actions: columns.actions === undefined
      ? "Bevestiging / correctie"
      : columns.actions,
    status: columns.status === undefined ? "Oordeel" : columns.status,
  };
  const visibleRows = (rows as readonly DocumentFactMatrixRow[]).filter((row) =>
    !row.hidden
  );
  if (visibleRows.length === 0) return null;
  const showSources = headers.sources !== null;
  const showActions = headers.actions !== null;
  const showStatus = headers.status !== null;
  const visibleColumnCount = 2 + Number(showSources) + Number(showActions) +
    Number(showStatus);
  const columnClass = visibleColumnCount === 5
    ? " fact-table--five-columns"
    : visibleColumnCount === 3
    ? " fact-table--three-columns"
    : visibleColumnCount === 2
    ? " fact-table--two-columns"
    : "";

  return (
    <div
      className={`fact-table fact-table--${variant}${columnClass}`}
      role="table"
    >
      <div className="fact-table__header" role="row">
        <span role="columnheader">{headers.label}</span>
        <span role="columnheader">{headers.value}</span>
        {showSources
          ? <span role="columnheader">{headers.sources}</span>
          : null}
        {showActions
          ? <span role="columnheader">{headers.actions}</span>
          : null}
        {showStatus ? <span role="columnheader">{headers.status}</span> : null}
      </div>
      {visibleRows.map((row) => (
        <div className="fact-table__row" key={row.id} role="row">
          <span data-label={headers.label} role="cell">{row.label}</span>
          <span
            className="fact-table__value"
            data-label={headers.value}
            role="cell"
          >
            {row.value}
          </span>
          {showSources
            ? (
              <span
                className="fact-table__sources"
                data-label={headers.sources || "Bronnen"}
                role="cell"
              >
                {row.sources ?? "—"}
              </span>
            )
            : null}
          {showActions
            ? (
              <span
                className="fact-table__action-cell"
                data-label={headers.actions || "Bevestiging / correctie"}
                role="cell"
              >
                {row.actions ?? "—"}
              </span>
            )
            : null}
          {showStatus
            ? (
              <span
                className="fact-table__judgment"
                data-label={headers.status || "Oordeel"}
                role="cell"
              >
                {row.status ?? null}
              </span>
            )
            : null}
        </div>
      ))}
    </div>
  );
}
