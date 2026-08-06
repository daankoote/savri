import { useState } from "react";
import { AddressFields } from "../AddressFields";
import type { DocumentFirstFactValue } from "../documentFirstSignupModel";
import { createAddressDraft } from "../signupNormalizers";
import type { AddressDraft } from "../signupTypes";
import {
  type FactPresentationRow,
  isValidFactCorrectionValue,
} from "./factPresentationModel";

type CompactFactCorrectionEditorProps = {
  row: FactPresentationRow;
  onCancel: () => void;
  onSave: (value: DocumentFirstFactValue) => void;
};

function initialAddress(row: FactPresentationRow): AddressDraft {
  return row.correctionValue && typeof row.correctionValue !== "string"
    ? row.correctionValue
    : createAddressDraft();
}

function initialText(row: FactPresentationRow): string {
  return typeof row.correctionValue === "string"
    ? row.correctionValue
    : row.canonicalValue || row.sources[0]?.observedValue || "";
}

export function CompactFactCorrectionEditor({
  onCancel,
  onSave,
  row,
}: CompactFactCorrectionEditorProps) {
  const structuredAddress = row.reviewRow?.factKey === "structuredAddress";
  const [text, setText] = useState(() => initialText(row));
  const [address, setAddress] = useState<AddressDraft>(() =>
    initialAddress(row)
  );
  const [error, setError] = useState("");
  const value: DocumentFirstFactValue = structuredAddress ? address : text;
  const valid = row.reviewRow
    ? isValidFactCorrectionValue(row.reviewRow.factKey, value)
    : false;

  const save = () => {
    if (!valid) {
      setError(
        structuredAddress
          ? "Vul een geldige postcode en huisnummer in en wacht op de adreslookup."
          : "Vul een geldige waarde in.",
      );
      return;
    }
    onSave(typeof value === "string" ? value.trim() : value);
  };

  return (
    <div
      aria-label={`${row.label} corrigeren`}
      className="fact-correction-editor"
      role="group"
    >
      {structuredAddress
        ? (
          <AddressFields
            compact
            fieldErrors={{}}
            locationId={row.locationId || row.id}
            onChange={(next) => {
              setAddress(next);
              setError("");
            }}
            value={address}
          />
        )
        : (
          <input
            aria-label={`${row.label} nieuwe waarde`}
            className="fact-correction-editor__input"
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            value={text}
          />
        )}
      {error
        ? <small className="field-message" role="alert">{error}</small>
        : null}
      <div className="fact-correction-editor__actions">
        <button
          className="button button-primary button-compact"
          disabled={!valid}
          onClick={save}
          type="button"
        >
          Opslaan
        </button>
        <button
          className="button button-ghost button-compact"
          onClick={onCancel}
          type="button"
        >
          Annuleren
        </button>
      </div>
    </div>
  );
}
