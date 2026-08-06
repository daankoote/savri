import { useState } from "react";
import type { DocumentFirstFactValue } from "../documentFirstSignupModel";
import type { DocumentReviewRow } from "../documentReviewMatrix";
import { CompactFactCorrectionEditor } from "./CompactFactCorrectionEditor";
import type { FactPresentationRow } from "./factPresentationModel";

type FactReviewControlsProps = {
  row: FactPresentationRow;
  onConfirm?: (row: DocumentReviewRow) => void;
  onCorrect?: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onReplaceDocument?: (row: DocumentReviewRow) => void;
};

export function FactReviewControls({
  onConfirm,
  onCorrect,
  onReplaceDocument,
  row,
}: FactReviewControlsProps) {
  const [editing, setEditing] = useState(false);
  const reviewRow = row.reviewRow;
  if (!reviewRow) return null;

  if (editing && onCorrect) {
    return (
      <CompactFactCorrectionEditor
        onCancel={() => setEditing(false)}
        onSave={(value) => {
          onCorrect(reviewRow, value);
          setEditing(false);
        }}
        row={row}
      />
    );
  }

  const candidates = [
    ...new Set(
      row.sources.filter((source) => source.sourceType !== "user")
        .map((source) => source.observedValue).filter(Boolean),
    ),
  ];

  return (
    <div className="fact-table__actions">
      {row.actions.includes("choose") && onCorrect
        ? (
          <div className="fact-table__choices">
            {candidates.map((candidate) => (
              <button
                className="button button-secondary button-compact"
                key={candidate}
                onClick={() => onCorrect(reviewRow, candidate)}
                type="button"
              >
                {candidate}
              </button>
            ))}
            <button
              className="button button-ghost button-compact"
              onClick={() => setEditing(true)}
              type="button"
            >
              Andere waarde
            </button>
          </div>
        )
        : null}
      {row.actions.includes("confirm") && onConfirm
        ? (
          <button
            className="button button-secondary button-compact"
            onClick={() => onConfirm(reviewRow)}
            type="button"
          >
            Bevestigen
          </button>
        )
        : null}
      {row.actions.includes("fill") && onCorrect
        ? (
          <button
            className="button button-secondary button-compact"
            onClick={() => setEditing(true)}
            type="button"
          >
            Invullen
          </button>
        )
        : null}
      {row.actions.includes("replace-document") && onReplaceDocument
        ? (
          <button
            className="button button-secondary button-compact"
            onClick={() => onReplaceDocument(reviewRow)}
            type="button"
          >
            Document vervangen
          </button>
        )
        : null}
      {row.actions.includes("correct") && onCorrect &&
          !row.actions.includes("choose")
        ? (
          <button
            className="button button-ghost button-compact"
            onClick={() => setEditing(true)}
            type="button"
          >
            {row.correctionState === "manual" ? "Bewerken" : "Corrigeren"}
          </button>
        )
        : null}
    </div>
  );
}
