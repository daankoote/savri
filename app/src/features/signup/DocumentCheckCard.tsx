import type { EnergyDocumentComparisonStatus } from "./energyDocumentCrossCheck";
import { energyDocumentComparisonLabel } from "./energyDocumentCrossCheck";
import type { SignupPartyNameComparisonStatus } from "./signupPartyNameCrossCheck";

export type DocumentComparisonStatus =
  | EnergyDocumentComparisonStatus
  | SignupPartyNameComparisonStatus;

export type DocumentCheckRow = {
  label: string;
  displayValue: string;
  comparisonStatus?: DocumentComparisonStatus;
  actionTarget?: {
    label: string;
    onAction: () => void;
  };
  displayable: boolean;
};

type DocumentCheckCardProps = {
  rows: DocumentCheckRow[];
  title?: string;
};

function comparisonLabel(status: DocumentComparisonStatus): string | null {
  if (status === "exact_full_match") return "Komt overeen";
  if (status === "initial_and_surname_match") {
    return "Initiaal en achternaam komen overeen";
  }
  return energyDocumentComparisonLabel(status);
}

function statusClass(status: DocumentComparisonStatus): string {
  if (status === "match" || status === "exact_full_match") {
    return "status-pill status-pill-ok";
  }
  if (status === "mismatch") return "status-pill status-pill-danger";
  return "status-pill status-pill-warning";
}

export function DocumentCheckCard({
  rows,
  title = "Uit het document gehaald",
}: DocumentCheckCardProps) {
  const visibleRows = rows.filter((row) =>
    row.displayable && row.displayValue.trim()
  );
  if (visibleRows.length === 0) return null;

  return (
    <div className="invoice-preview-panel invoice-preview-standalone">
      <h4>{title}</h4>
      <dl className="invoice-preview-list">
        {visibleRows.map((row) => {
          const statusLabel = row.comparisonStatus
            ? comparisonLabel(row.comparisonStatus)
            : null;
          return (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.displayValue}
                {statusLabel && row.comparisonStatus
                  ? (
                    <>
                      {" "}
                      <span className={statusClass(row.comparisonStatus)}>
                        {statusLabel}
                      </span>
                    </>
                  )
                  : null}
                {row.comparisonStatus === "mismatch" && row.actionTarget
                  ? (
                    <button
                      className="button-link"
                      onClick={row.actionTarget.onAction}
                      type="button"
                    >
                      {row.actionTarget.label}
                    </button>
                  )
                  : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
