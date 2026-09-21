import type { DocumentFirstFactValue } from "../documentFirstSignupModel";
import type { DocumentReviewRow } from "../documentReviewMatrix";
import {
  DocumentFactMatrix,
  type DocumentFactMatrixRow,
} from "../../documents/DocumentFactMatrix";
import { FactReviewControls } from "./FactReviewControls";
import type {
  FactPresentationRow,
  FactPresentationSource,
} from "./factPresentationModel";
import {
  formatPresentationBrandCopy,
  usePresentationBrand,
} from "../../../shared/presentation/PresentationBrandProvider";

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
  onConfirm?: (
    row: DocumentReviewRow,
    value?: DocumentFirstFactValue,
  ) => void;
  onCorrect?: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onInvalidateConfirmation?: (row: DocumentReviewRow) => void;
  onReplaceDocument?: (row: DocumentReviewRow) => void;
  onRestoreSource?: (row: DocumentReviewRow) => void;
  onSelectSource?: (
    row: DocumentReviewRow,
    source: FactPresentationSource,
  ) => void;
};

type SignupFactRowsProps =
  & Pick<
    FactTableProps,
    | "onConfirm"
    | "onCorrect"
    | "onInvalidateConfirmation"
    | "onReplaceDocument"
    | "onRestoreSource"
    | "onSelectSource"
    | "rows"
    | "variant"
  >
  & Readonly<{ displayName?: string }>;

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
  onInvalidateConfirmation,
  onReplaceDocument,
  onRestoreSource,
  onSelectSource,
  rows,
  variant,
}: FactTableProps) {
  const presentation = usePresentationBrand();
  return (
    <DocumentFactMatrix
      columns={{
        label: columns.label,
        value: columns.value,
        sources: columns.sources,
        actions: variant === "review"
          ? columns.actions || "Bevestiging / correctie"
          : null,
        status: columns.judgment,
      }}
      rows={createSignupDocumentFactRows({
        onConfirm,
        onCorrect,
        onInvalidateConfirmation,
        onReplaceDocument,
        onRestoreSource,
        onSelectSource,
        rows,
        variant,
        displayName: presentation.displayName,
      })}
      variant={variant}
    />
  );
}

export function createSignupDocumentFactRows({
  onConfirm,
  onCorrect,
  onInvalidateConfirmation,
  onReplaceDocument,
  onRestoreSource,
  onSelectSource,
  rows,
  variant,
  displayName = "ENVAL",
}: SignupFactRowsProps): DocumentFactMatrixRow[] {
  return rows.map((row) => ({
    id: row.id,
    hidden: row.applicability === "not_applicable",
    label: row.label,
    value: (
      <span className="fact-table__canonical-value">
        {row.canonicalValue || "—"}
      </span>
    ),
    sources: row.sources.length > 0
      ? row.sources.map((source) => (
        <span key={`${row.id}:${source.sourceId}:${source.binding}`}>
          <span>{source.sourceLabel} — {source.observedValue}</span>
          {source.binding !== source.sourceLabel
            ? <small>{source.binding}</small>
            : null}
        </span>
      ))
      : "—",
    actions: variant === "review"
      ? (
        <FactReviewControls
          onConfirm={onConfirm}
          onCorrect={onCorrect}
          onInvalidateConfirmation={onInvalidateConfirmation}
          onReplaceDocument={onReplaceDocument}
          onRestoreSource={onRestoreSource}
          onSelectSource={onSelectSource}
          row={row}
        />
      )
      : undefined,
    status: row.judgment
      ? (
        <span className={judgmentClass(row.judgment)}>
          {formatPresentationBrandCopy(row.judgment, displayName)}
        </span>
      )
      : null,
  }));
}
