import type { DocumentFirstFactValue } from "../documentFirstSignupModel";
import type { DocumentReviewRow } from "../documentReviewMatrix";
import { FactReviewControls } from "./FactReviewControls";
import type { FactPresentationRow } from "./factPresentationModel";

type FactTableColumns = {
  label?: string;
  value?: string;
  sources?: string | null;
  actions?: string;
  judgment?: string | null;
};

type FactTableProps = {
  rows: FactPresentationRow[];
  variant: "review" | "document";
  columns?: FactTableColumns;
  onConfirm?: (row: DocumentReviewRow) => void;
  onCorrect?: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onReplaceDocument?: (row: DocumentReviewRow) => void;
};

function judgmentClass(judgment: FactPresentationRow["judgment"]): string {
  return judgment === "Bevestigd"
    ? "status-pill status-pill-ok"
    : judgment === "Kan niet worden ingediend"
    ? "status-pill status-pill-danger"
    : "status-pill status-pill-warning";
}

export function FactTable({
  columns = {},
  onConfirm,
  onCorrect,
  onReplaceDocument,
  rows,
  variant,
}: FactTableProps) {
  const headers = {
    label: columns.label || "Gegeven",
    value: columns.value || "Waarde",
    sources: columns.sources === undefined ? "Bronnen" : columns.sources,
    actions: columns.actions || "Bevestiging / correctie",
    judgment: columns.judgment === undefined ? "Oordeel" : columns.judgment,
  };
  const visibleRows = rows.filter((row) =>
    row.applicability !== "not_applicable"
  );
  if (visibleRows.length === 0) return null;
  const showJudgment = headers.judgment !== null;
  const showActions = variant === "review";
  const showSources = headers.sources !== null;
  const columnClass = !showActions && !showJudgment && !showSources
    ? " fact-table--two-columns"
    : !showActions && (!showJudgment || !showSources)
    ? " fact-table--three-columns"
    : "";

  return (
    <div
      className={`fact-table fact-table--${variant}${
        showActions ? " fact-table--five-columns" : ""
      }${columnClass}`}
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
        {showJudgment
          ? <span role="columnheader">{headers.judgment}</span>
          : null}
      </div>
      {visibleRows.map((row) => (
        <div className="fact-table__row" key={row.id} role="row">
          <span data-label={headers.label} role="cell">
            {row.label}
          </span>
          <span
            className="fact-table__value"
            data-label={headers.value}
            role="cell"
          >
            <span className="fact-table__canonical-value">
              {row.canonicalValue || "—"}
            </span>
          </span>
          {showSources
            ? (
              <span
                className="fact-table__sources"
                data-label={headers.sources || "Bronnen"}
                role="cell"
              >
                {row.sources.length > 0
                  ? row.sources.map((source) => (
                    <span
                      key={`${row.id}:${source.sourceId}:${source.binding}`}
                    >
                      <span>
                        {source.sourceLabel} — {source.observedValue}
                      </span>
                      {source.binding !== source.sourceLabel
                        ? <small>{source.binding}</small>
                        : null}
                    </span>
                  ))
                  : "—"}
              </span>
            )
            : null}
          {showActions
            ? (
              <span
                className="fact-table__action-cell"
                data-label={headers.actions}
                role="cell"
              >
                <FactReviewControls
                  onConfirm={onConfirm}
                  onCorrect={onCorrect}
                  onReplaceDocument={onReplaceDocument}
                  row={row}
                />
              </span>
            )
            : null}
          {showJudgment
            ? (
              <span
                className="fact-table__judgment"
                data-label={headers.judgment || "Oordeel"}
                role="cell"
              >
                {row.judgment
                  ? (
                    <span className={judgmentClass(row.judgment)}>
                      {row.judgment}
                    </span>
                  )
                  : null}
              </span>
            )
            : null}
        </div>
      ))}
    </div>
  );
}
