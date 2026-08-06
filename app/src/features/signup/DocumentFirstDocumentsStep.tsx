import { type Dispatch, useRef } from "react";
import { getConfirmableEnergyEanCandidates } from "../invoice-analysis/energyEanCandidateExtractor";
import { parseInvoicePdfInput } from "../invoice-analysis/invoicePdfParserAdapter";
import {
  type DocumentFirstSignupAction,
  type DocumentFirstSignupDraft,
} from "./documentFirstSignupModel";
import { documentFirstSignupToLegacyDraft } from "./documentFirstSignupModel";
import { projectEnergyEanCandidates } from "./documentSemanticProjector";
import { DocumentUploadSlot } from "./DocumentUploadSlot";
import { SignupLocationTabs } from "./SignupLocationTabs";
import type {
  ChargerDocumentDraft,
  ConnectionDeclarationDraft,
  LocationDocumentDraft,
} from "./signupTypes";

type DocumentFirstDocumentsStepProps = {
  activeLocationId: string;
  dispatch: Dispatch<DocumentFirstSignupAction>;
  draft: DocumentFirstSignupDraft;
  draftGeneration: number;
  isDraftGenerationCurrent: (generation: number) => boolean;
  onSelectLocation: (locationId: string) => void;
};

export function DocumentFirstDocumentsStep({
  activeLocationId,
  dispatch,
  draft,
  draftGeneration,
  isDraftGenerationCurrent,
  onSelectLocation,
}: DocumentFirstDocumentsStepProps) {
  const energyAttempts = useRef(new Map<string, number>());
  const chargerAttempts = useRef(new Map<string, number>());
  const legacy = documentFirstSignupToLegacyDraft(draft);
  const activeLocation =
    legacy.locations.find((location) =>
      location.clientId === activeLocationId
    ) || legacy.locations[0];
  const activeLocationNumber = activeLocation
    ? draft.locationOrder.indexOf(activeLocation.clientId) + 1
    : 0;
  const globalChargerNumber = (chargerId: string) =>
    draft.locationOrder.flatMap((locationId) =>
      draft.chargerOrderByLocationId[locationId] || []
    ).indexOf(chargerId) + 1;

  const updateConnection = (
    locationId: string,
    value: ConnectionDeclarationDraft,
  ) => dispatch({ type: "update_connection_declaration", locationId, value });

  const removeLocation = (locationId: string) => {
    energyAttempts.current.set(
      locationId,
      (energyAttempts.current.get(locationId) || 0) + 1,
    );
    (draft.chargerOrderByLocationId[locationId] || []).forEach((chargerId) =>
      chargerAttempts.current.set(
        chargerId,
        (chargerAttempts.current.get(chargerId) || 0) + 1,
      )
    );
    dispatch({ type: "remove_location", locationId });
  };

  const removeCharger = (locationId: string, chargerId: string) => {
    chargerAttempts.current.set(
      chargerId,
      (chargerAttempts.current.get(chargerId) || 0) + 1,
    );
    dispatch({ type: "remove_charger", locationId, chargerId });
  };

  const handleEnergyDocument = async (
    document: LocationDocumentDraft,
  ) => {
    const locationId = document.locationClientId;
    const generation = draftGeneration;
    const attempt = (energyAttempts.current.get(locationId) || 0) + 1;
    energyAttempts.current.set(locationId, attempt);
    dispatch({ type: "update_energy_document", document });
    const reset: ConnectionDeclarationDraft = {
      sourceMode: "document",
      preflightStatus: document.file ? "parsing" : "idle",
      candidates: [],
      selectedCandidateEan: "",
      confirmedEan: "",
      manualEan: "",
      customerConfirmed: false,
    };
    updateConnection(locationId, reset);
    if (!document.file) return;

    const result = await parseInvoicePdfInput(document.file);
    if (
      energyAttempts.current.get(locationId) !== attempt ||
      !isDraftGenerationCurrent(generation)
    ) return;

    if (!result.ok) {
      updateConnection(locationId, {
        ...reset,
        preflightStatus: "parser_error",
      });
      return;
    }

    const envelope = result.observation_envelope;
    dispatch({
      type: "set_document_observation",
      documentId: document.clientId,
      value: {
        documentId: document.clientId,
        contentFingerprint: envelope.contentFingerprint,
        parserVersion: envelope.parserVersion,
        envelope,
      },
    });
    const candidates = projectEnergyEanCandidates(envelope);
    const confirmable = getConfirmableEnergyEanCandidates(candidates);
    if (confirmable.length === 0) {
      updateConnection(locationId, {
        ...reset,
        candidates,
        preflightStatus: candidates.length === 0
          ? "no_candidate"
          : "manual_entry_required",
      });
      return;
    }
    if (confirmable.length > 1) {
      updateConnection(locationId, {
        ...reset,
        candidates,
        preflightStatus: "multiple_candidates",
      });
      return;
    }
    const candidate = confirmable[0];
    updateConnection(locationId, {
      ...reset,
      candidates,
      selectedCandidateEan: candidate.normalizedEan,
      preflightStatus: candidate.classification === "electricity"
        ? "electricity_candidate_found"
        : "unclassified_candidate_found",
    });
  };

  const handleChargerDocument = async (
    document: ChargerDocumentDraft,
  ) => {
    const generation = draftGeneration;
    const chargerId = document.chargerClientId;
    const attempt = (chargerAttempts.current.get(chargerId) || 0) + 1;
    chargerAttempts.current.set(chargerId, attempt);
    const reset: ChargerDocumentDraft = {
      ...document,
      observation: null,
      parseStatus: document.file ? "parsing" : "idle",
    };
    dispatch({ type: "update_charger_document", document: reset });
    if (!document.file) return;

    const result = await parseInvoicePdfInput(document.file);
    if (
      chargerAttempts.current.get(chargerId) !== attempt ||
      !isDraftGenerationCurrent(generation)
    ) return;
    dispatch({
      type: "update_charger_document",
      document: {
        ...reset,
        observation: null,
        parseStatus: result.ok ? "parsed" : "error",
      },
    });
    if (!result.ok) return;
    const envelope = result.observation_envelope;
    dispatch({
      type: "set_document_observation",
      documentId: document.clientId,
      value: {
        documentId: document.clientId,
        contentFingerprint: envelope.contentFingerprint,
        parserVersion: envelope.parserVersion,
        envelope,
      },
    });
  };

  return (
    <section
      aria-labelledby="document-first-documents-title"
      className="signup-section"
      id="signup-documents"
    >
      <div className="signup-section-header">
        <p className="eyebrow">Stap 2</p>
        <h2 id="document-first-documents-title">Documenten</h2>
      </div>

      <SignupLocationTabs
        activeLocationId={activeLocation?.clientId || ""}
        chargerCountByLocation
        locations={legacy.locations}
        onSelectLocation={onSelectLocation}
      />

      {activeLocation
        ? (
          <div className="document-location-group">
            <div className="document-upload-grid">
              <DocumentUploadSlot
                document={activeLocation.energyDocument}
                documentBinding={`Locatie ${activeLocationNumber}`}
                helpText={draft.parserObservations.byDocumentId[
                    activeLocation.energyDocument.clientId
                  ]?.envelope.factCandidates.length === 0
                  ? "Geen gegevens gevonden."
                  : "Upload het energiecontract of de energienota voor deze locatie."}
                hideDocumentLabel
                onChange={(document) => void handleEnergyDocument(document)}
                scope={`Locatie ${activeLocationNumber}`}
                scopeAction={draft.accountBasis.accountType !== "particulier"
                  ? {
                    disabled: draft.locationOrder.length <= 1,
                    label: "Locatie verwijderen",
                    onClick: () => removeLocation(activeLocation.clientId),
                  }
                  : undefined}
                title="Energienota of energiecontract"
              />

              {(draft.chargerOrderByLocationId[activeLocation.clientId] || [])
                .map((chargerId) => {
                  const document = draft.chargerDocumentsByChargerId[chargerId]
                    ?.find((candidate) =>
                      candidate.documentType === "installation_invoice"
                    );
                  if (!document) return null;
                  const chargerNumber = globalChargerNumber(chargerId);
                  return (
                    <DocumentUploadSlot
                      document={document}
                      documentBinding={`Locatie ${activeLocationNumber} · Laadpaal ${chargerNumber}`}
                      helpText={draft.parserObservations
                          .byDocumentId[document.clientId]
                          ?.envelope.factCandidates.length === 0
                        ? "Geen gegevens gevonden."
                        : "Upload de installatiefactuur voor deze laadpaal."}
                      hideDocumentLabel
                      key={chargerId}
                      onChange={(next) => void handleChargerDocument(next)}
                      scope={`Laadpaal ${chargerNumber}`}
                      scopeAction={{
                        disabled: (draft.chargerOrderByLocationId[
                          activeLocation.clientId
                        ] || []).length <= 1,
                        label: "Laadpaal verwijderen",
                        onClick: () =>
                          removeCharger(activeLocation.clientId, chargerId),
                      }}
                      title="Installatiefactuur"
                    />
                  );
                })}
            </div>

            <div className="section-actions">
              <button
                className="button button-secondary"
                onClick={() =>
                  dispatch({
                    type: "add_charger",
                    locationId: activeLocation.clientId,
                  })}
                type="button"
              >
                + Laadpaal toevoegen
              </button>
              {draft.accountBasis.accountType !== "particulier"
                ? (
                  <button
                    className="button button-secondary"
                    onClick={() => dispatch({ type: "add_location" })}
                    type="button"
                  >
                    + Locatie toevoegen
                  </button>
                )
                : null}
            </div>
          </div>
        )
        : null}
    </section>
  );
}
