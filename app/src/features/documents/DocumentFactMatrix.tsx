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
});

export type CustomerDocumentFactMatrixRow = Readonly<{
  id: string;
  given: ReactNode;
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

function StackedSourceRows({
  rows,
  value,
}: {
  rows: CustomerDocumentFactMatrixRow["sources"];
  value: "fileName" | "value";
}) {
  if (rows.length === 0) {
    return <>{value === "fileName" ? "—" : "-"}</>;
  }
  return (
    <span className="fact-table__source-stack">
      {rows.map((row) => {
        const text = value === "fileName"
          ? row.fileName
          : row.value || "-";
        return (
          <span
            className={row.selected && value === "value"
              ? "fact-table__source-line fact-table__ellipsis customer-fact-confirmed-value"
              : "fact-table__source-line fact-table__ellipsis"}
            key={`${row.id}:${value}`}
            title={text}
          >
            {text}
          </span>
        );
      })}
    </span>
  );
}

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
        {visibleRows.map((row) => (
          <div className="fact-table__row" key={row.id} role="row">
            <span data-label="Gegeven" role="cell">{row.given}</span>
            <span className="fact-table__source" data-label="Bron" role="cell">
              <StackedSourceRows
                rows={row.sources}
                value="fileName"
              />
            </span>
            <span
              className="fact-table__source-info"
              data-label="Info uit bron"
              role="cell"
            >
              <StackedSourceRows
                rows={row.sources}
                value="value"
              />
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
            <span className="fact-table__enval" data-label="ENVAL" role="cell">
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
          </div>
        ))}
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
