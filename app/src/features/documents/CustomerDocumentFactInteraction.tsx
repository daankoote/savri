import { useEffect, useState } from "react";
import { AddressFields } from "../signup/AddressFields";
import type { DocumentFirstFactValue } from "../signup/documentFirstSignupModel";
import type { AddressDraft } from "../signup/signupTypes";
import type { CustomerDocumentEvidenceRelationship } from "../signup/documentFactRegistry.ts";
import {
  normalizeCustomerDocumentFactSourceValue,
} from "./customerDocumentFactSourceResolution.ts";

export type CustomerDocumentFactInteractionState =
  | "EVIDENCE_NOT_READY"
  | "SINGLE_SOURCE_UNRESOLVED"
  | "SOURCE_UNRESOLVED"
  | "SOURCE_CONFIRMED"
  | "SOURCE_CONFLICT_UNRESOLVED"
  | "MANUAL_EDIT"
  | "MANUAL_CONFIRMED"
  | "MISSING_SOURCE_UNRESOLVED"
  | "LOCKED";

export type CustomerDocumentFactSourceChoice = Readonly<{
  id: string;
  fileName: string;
  value: string | null;
  relationship?: CustomerDocumentEvidenceRelationship | null;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
}>;

export type CustomerFacingEnvalRoute =
  | "Nog te beoordelen"
  | "Wacht op klant"
  | "Akkoord"
  | "Correctie nodig"
  | "Klant bevestigd"
  | "ENVAL checken";

export function normalizeCustomerSourceValue(value: string): string {
  return normalizeCustomerDocumentFactSourceValue(value);
}

export type CustomerDocumentFactInteractionModel = Readonly<{
  id: string;
  label: string;
  state: CustomerDocumentFactInteractionState;
  projectedEnvalRoute?: CustomerFacingEnvalRoute;
  sourceValue?: DocumentFirstFactValue;
  suggestedValue?: DocumentFirstFactValue;
  customerValue?: DocumentFirstFactValue;
  canRestoreSources?: boolean;
  emptyValue: DocumentFirstFactValue;
  editor: "text" | "address";
  locationId?: string;
  maxLength?: number;
  isValid: (value: DocumentFirstFactValue) => boolean;
  normalize?: (value: DocumentFirstFactValue) => DocumentFirstFactValue;
  formatValue?: (value: DocumentFirstFactValue) => string;
  onConfirm?: (
    value: DocumentFirstFactValue,
    resolution: "source" | "manual",
  ) => void;
  onCancelResolution?: () => void;
  onInvalidateConfirmation?: () => void;
  onRestoreSource?: () => void;
}>;

function initialValue(
  model: CustomerDocumentFactInteractionModel,
): DocumentFirstFactValue {
  if (model.editor === "address") {
    return model.customerValue ?? model.emptyValue;
  }
  return model.customerValue ?? model.suggestedValue ?? model.sourceValue ??
    model.emptyValue;
}

function shouldStartEditing(
  state: CustomerDocumentFactInteractionState,
): boolean {
  return state === "MANUAL_EDIT";
}

function plainStateLabel(
  state: CustomerDocumentFactInteractionState,
):
  | "Bevestigd"
  | "Vastgelegd"
  | null {
  if (state === "SOURCE_CONFIRMED") return "Bevestigd";
  if (state === "LOCKED") return "Vastgelegd";
  return null;
}

export function CustomerDocumentFactInteraction({
  model,
  sourceChoices = [],
}: {
  model: CustomerDocumentFactInteractionModel;
  sourceChoices?: readonly CustomerDocumentFactSourceChoice[];
}) {
  const [editing, setEditing] = useState(() => shouldStartEditing(model.state));
  const [draft, setDraft] = useState<DocumentFirstFactValue>(() =>
    initialValue(model)
  );
  const [error, setError] = useState("");

  useEffect(() => {
    setEditing(shouldStartEditing(model.state));
    setDraft(initialValue(model));
    setError("");
  }, [model.id]);

  const confirm = () => {
    if (!model.onConfirm || !model.isValid(draft)) {
      setError(
        model.editor === "address"
          ? "Vul een geldige postcode en huisnummer in en wacht op de adreslookup."
          : "Vul een geldige waarde in.",
      );
      return;
    }
    const value = model.normalize ? model.normalize(draft) : draft;
    model.onConfirm(value, "manual");
    setEditing(false);
    setError("");
  };

  const stateLabel = plainStateLabel(model.state);
  if (!editing && model.state === "EVIDENCE_NOT_READY") {
    return (
      <span
        aria-label="Documentbewijs nog niet gereed"
        className="customer-fact-interaction customer-fact-interaction--unavailable"
      >
        —
      </span>
    );
  }
  if (!editing && model.state === "MANUAL_CONFIRMED") {
    const value = model.customerValue ?? model.emptyValue;
    const visibleValue = model.formatValue
      ? model.formatValue(value)
      : typeof value === "string"
      ? value
      : "Handmatig aangepast";
    return (
      <span className="customer-fact-interaction customer-fact-interaction--resolved">
        <span
          aria-label={`Handmatig aangepast: ${visibleValue}`}
          className="customer-fact-confirmed-value"
        >
          {visibleValue}
        </span>
        {model.onCancelResolution
          ? (
            <button
              aria-label="Correctie annuleren"
              className="button button-ghost button-icon customer-fact-cancel"
              onClick={() => {
                setDraft(model.emptyValue);
                setEditing(false);
                setError("");
                model.onCancelResolution?.();
              }}
              title="Correctie annuleren"
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          )
          : null}
      </span>
    );
  }
  if (!editing && stateLabel) {
    return (
      <span className="customer-fact-interaction customer-fact-interaction--resolved">
        <span
          className={model.state === "SOURCE_CONFIRMED"
            ? "customer-fact-confirmed-value"
            : undefined}
        >
          {stateLabel}
        </span>
        {model.state === "SOURCE_CONFIRMED" && model.onCancelResolution
          ? (
            <button
              aria-label="Bevestiging annuleren"
              className="button button-ghost button-icon customer-fact-cancel"
              onClick={() => {
                setDraft(model.emptyValue);
                setEditing(false);
                setError("");
                model.onCancelResolution?.();
              }}
              title="Bevestiging annuleren"
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          )
          : null}
      </span>
    );
  }

  if (!editing && model.state === "SOURCE_UNRESOLVED") {
    return (
      <span className="customer-fact-interaction customer-fact-interaction--actions">
        <button
          aria-label="Bevestigen"
          className="button button-icon customer-fact-confirm"
          onClick={() =>
            model.sourceValue && model.onConfirm?.(model.sourceValue, "source")}
          title="Bevestigen"
          type="button"
        >
          <span aria-hidden="true">✓</span>
        </button>
        <button
          aria-label="Corrigeren"
          className="button button-ghost button-icon customer-fact-edit"
          onClick={() => {
            setDraft(initialValue(model));
            setEditing(true);
          }}
          title="Corrigeren"
          type="button"
        >
          <span aria-hidden="true">✎</span>
        </button>
      </span>
    );
  }

  if (
    !editing &&
    (model.state === "MISSING_SOURCE_UNRESOLVED" ||
      model.state === "SINGLE_SOURCE_UNRESOLVED")
  ) {
    return (
      <span className="customer-fact-interaction customer-fact-interaction--actions">
        <button
          aria-label="Bevestigen"
          className="button button-icon customer-fact-confirm"
          disabled
          title="Bevestigen niet beschikbaar"
          type="button"
        >
          <span aria-hidden="true">✓</span>
        </button>
        <button
          aria-label="Corrigeren"
          className="button button-ghost button-icon customer-fact-edit"
          onClick={() => {
            setDraft(initialValue(model));
            setEditing(true);
          }}
          title="Corrigeren"
          type="button"
        >
          <span aria-hidden="true">✎</span>
        </button>
      </span>
    );
  }

  if (!editing && model.state === "SOURCE_CONFLICT_UNRESOLVED") {
    const seenValues = new Set<string>();
    return (
      <span className="customer-fact-interaction customer-fact-interaction--conflict">
        <span className="customer-fact-source-choice-stack">
          {sourceChoices.map((source) => {
            if (!source.selectable) {
              return (
                <span
                  aria-hidden="true"
                  className="customer-fact-source-choice-line"
                  key={source.id}
                />
              );
            }
            if (!source.value) {
              return (
                <span
                  aria-hidden="true"
                  className="customer-fact-source-choice-line"
                  key={source.id}
                />
              );
            }
            const normalized = normalizeCustomerSourceValue(source.value);
            if (seenValues.has(normalized)) {
              return (
                <span
                  aria-hidden="true"
                  className="customer-fact-source-choice-line"
                  key={source.id}
                />
              );
            }
            seenValues.add(normalized);
            return (
              <label
                className="customer-fact-source-choice-line customer-fact-source-choice"
                key={source.id}
                title={source.value}
              >
                <input
                  aria-label={`Kies ${source.value} uit ${source.fileName}`}
                  checked={source.selected === true}
                  name={`customer-source-choice:${model.id}`}
                  onChange={source.onSelect}
                  type="radio"
                />
                <span className="sr-only">{source.value}</span>
              </label>
            );
          })}
        </span>
        <button
          aria-label="Corrigeren"
          className="button button-ghost button-icon customer-fact-edit"
          onClick={() => {
            setDraft(initialValue(model));
            setEditing(true);
          }}
          title="Corrigeren"
          type="button"
        >
          <span aria-hidden="true">✎</span>
        </button>
      </span>
    );
  }

  return (
    <div
      aria-label={`${model.label} corrigeren`}
      className="customer-fact-interaction fact-correction-editor"
      role="group"
    >
      {model.editor === "address"
        ? (
          <AddressFields
            compact
            fieldErrors={{}}
            locationId={model.locationId || model.id}
            onChange={(value: AddressDraft) => {
              setDraft(value);
              setError("");
            }}
            value={draft as AddressDraft}
          />
        )
        : (
          <input
            aria-label={`${model.label} nieuwe waarde`}
            className="fact-correction-editor__input"
            maxLength={model.maxLength}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            type="text"
            value={typeof draft === "string" ? draft : ""}
          />
        )}
      {error
        ? <small className="field-message" role="alert">{error}</small>
        : null}
      <span className="fact-correction-editor__actions">
        <button
          aria-label="Bevestigen"
          className="button button-icon customer-fact-confirm"
          disabled={!model.isValid(draft)}
          onClick={confirm}
          title="Bevestigen"
          type="button"
        >
          <span aria-hidden="true">✓</span>
        </button>
        {model.onRestoreSource || model.onCancelResolution
          ? (
            <button
              aria-label="Correctie annuleren"
              className="button button-ghost button-icon customer-fact-cancel"
              onClick={() => {
                setDraft(
                  model.suggestedValue ?? model.sourceValue ?? model.emptyValue,
                );
                setEditing(false);
                setError("");
                if (model.onRestoreSource) model.onRestoreSource();
                else model.onCancelResolution?.();
              }}
              title="Correctie annuleren"
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          )
          : null}
      </span>
    </div>
  );
}
