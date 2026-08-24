import { type Dispatch, useRef } from "react";
import {
  allRequiredDocumentEvidenceReady,
  DocumentEvidenceWorkflow,
} from "../documents/DocumentEvidenceWorkflow.tsx";
import { createCustomerDocumentWorkflowModel } from "../documents/CustomerDocumentWorkflowController.ts";
import { getConfirmableEnergyEanCandidates } from "../invoice-analysis/energyEanCandidateExtractor";
import { parseInvoicePdfInput } from "../invoice-analysis/invoicePdfParserAdapter";
import { projectParserObservationForCurrentIntake } from "../invoice-analysis/parserObservationProjection.ts";
import {
  type DocumentFirstSignupAction,
  type DocumentFirstSignupDraft,
} from "./documentFirstSignupModel";
import { documentFirstSignupToLegacyDraft } from "./documentFirstSignupModel";
import { projectEnergyEanCandidates } from "./documentSemanticProjector";
import {
  createDocumentUploadCardModel,
  isDocumentUploadReady,
} from "./DocumentUploadSlot";
import {
  removeSignupDocument,
  uploadSignupDocument,
} from "./signupQuarantineUploadClient";
import { SignupLocationTabs } from "./SignupLocationTabs";
import { createDocumentFirstWorkflowGroups } from "./DocumentFirstCheckMatrix.tsx";
import type { DocumentFirstFactValue } from "./documentFirstSignupModel.ts";
import type { DocumentReviewRow } from "./documentReviewMatrix.ts";
import type { FactPresentationSection } from "./presentation/factPresentationModel.ts";
import type { FactPresentationSource } from "./presentation/factPresentationModel.ts";
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
  reviewChargers: FactPresentationSection[];
  reviewLocations: FactPresentationSection[];
  onConfirm: (
    row: DocumentReviewRow,
    value?: DocumentFirstFactValue,
  ) => void;
  onCorrect: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onInvalidateConfirmation: (row: DocumentReviewRow) => void;
  onReplaceDocument: (row: DocumentReviewRow) => void;
  onRestoreSource: (row: DocumentReviewRow) => void;
  onSelectSource: (
    row: DocumentReviewRow,
    source: FactPresentationSource,
  ) => void;
  canContinue: boolean;
  onContinue: () => void;
};

export function DocumentFirstDocumentsStep({
  activeLocationId,
  canContinue,
  dispatch,
  draft,
  draftGeneration,
  isDraftGenerationCurrent,
  onConfirm,
  onContinue,
  onCorrect,
  onInvalidateConfirmation,
  onReplaceDocument,
  onRestoreSource,
  onSelectSource,
  onSelectLocation,
  reviewChargers,
  reviewLocations,
}: DocumentFirstDocumentsStepProps) {
  const energyAttempts = useRef(new Map<string, number>());
  const chargerAttempts = useRef(new Map<string, number>());
  const energyAbortControllers = useRef(new Map<string, AbortController>());
  const chargerAbortControllers = useRef(new Map<string, AbortController>());
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

  const removeLocation = async (locationId: string) => {
    energyAttempts.current.set(
      locationId,
      (energyAttempts.current.get(locationId) || 0) + 1,
    );
    (draft.chargerOrderByLocationId[locationId] || []).forEach((chargerId) => {
      chargerAbortControllers.current.get(chargerId)?.abort();
      chargerAttempts.current.set(
        chargerId,
        (chargerAttempts.current.get(chargerId) || 0) + 1,
      );
    });
    energyAbortControllers.current.get(locationId)?.abort();
    const documents = [
      draft.energyDocumentsByLocationId[locationId],
      ...(draft.chargerOrderByLocationId[locationId] || []).flatMap((
        chargerId,
      ) => draft.chargerDocumentsByChargerId[chargerId] || []),
    ].filter(
      (document): document is LocationDocumentDraft | ChargerDocumentDraft =>
        Boolean(document),
    );
    for (const document of documents) {
      await removeSignupDocument({
        accountType: draft.accountBasis.accountType,
        email: draft.accountBasis.email,
        clientSlotId: document.clientId,
      });
    }
    dispatch({ type: "remove_location", locationId });
  };

  const removeCharger = async (locationId: string, chargerId: string) => {
    chargerAbortControllers.current.get(chargerId)?.abort();
    chargerAttempts.current.set(
      chargerId,
      (chargerAttempts.current.get(chargerId) || 0) + 1,
    );
    for (const document of draft.chargerDocumentsByChargerId[chargerId] || []) {
      await removeSignupDocument({
        accountType: draft.accountBasis.accountType,
        email: draft.accountBasis.email,
        clientSlotId: document.clientId,
      });
    }
    dispatch({ type: "remove_charger", locationId, chargerId });
  };

  const handleEnergyDocument = async (
    document: LocationDocumentDraft,
  ) => {
    const locationId = document.locationClientId;
    const generation = draftGeneration;
    energyAbortControllers.current.get(locationId)?.abort();
    const controller = new AbortController();
    energyAbortControllers.current.set(locationId, controller);
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
    if (!document.file) {
      void removeSignupDocument({
        accountType: draft.accountBasis.accountType,
        email: draft.accountBasis.email,
        clientSlotId: document.clientId,
        signal: controller.signal,
      });
      return;
    }

    const uploading: LocationDocumentDraft = {
      ...document,
      quarantineStatus: "uploading",
      quarantineFileReference: null,
      quarantineRevision: null,
    };
    dispatch({ type: "update_energy_document", document: uploading });
    const upload = await uploadSignupDocument({
      accountType: draft.accountBasis.accountType,
      email: draft.accountBasis.email,
      clientSlotId: document.clientId,
      documentType: document.documentType,
      file: document.file,
      signal: controller.signal,
    });
    if (
      energyAttempts.current.get(locationId) !== attempt ||
      !isDraftGenerationCurrent(generation) || (!upload.ok && upload.aborted)
    ) return;
    if (upload.ok && upload.receipt.parserObservation) {
      const envelope = projectParserObservationForCurrentIntake(
        upload.receipt.parserObservation,
      );
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
      } else if (confirmable.length > 1) {
        updateConnection(locationId, {
          ...reset,
          candidates,
          preflightStatus: "multiple_candidates",
        });
      } else {
        const candidate = confirmable[0];
        updateConnection(locationId, {
          ...reset,
          candidates,
          selectedCandidateEan: candidate.normalizedEan,
          preflightStatus: candidate.classification === "electricity"
            ? "electricity_candidate_found"
            : "unclassified_candidate_found",
        });
      }
    } else {
      updateConnection(locationId, {
        ...reset,
        preflightStatus: "parser_error",
      });
    }
    dispatch({
      type: "update_energy_document",
      document: upload.ok
        ? {
          ...uploading,
          quarantineStatus: "confirmed_quarantine",
          quarantineFileReference: upload.receipt.fileReference,
          quarantineRevision: upload.receipt.revisionNumber,
        }
        : { ...uploading, quarantineStatus: "error" },
    });
  };

  const handleChargerDocument = async (
    document: ChargerDocumentDraft,
  ) => {
    const generation = draftGeneration;
    const chargerId = document.chargerClientId;
    chargerAbortControllers.current.get(chargerId)?.abort();
    const controller = new AbortController();
    chargerAbortControllers.current.set(chargerId, controller);
    const attempt = (chargerAttempts.current.get(chargerId) || 0) + 1;
    chargerAttempts.current.set(chargerId, attempt);
    const reset: ChargerDocumentDraft = {
      ...document,
      observation: null,
      parseStatus: document.file ? "parsing" : "idle",
    };
    dispatch({ type: "update_charger_document", document: reset });
    if (!document.file) {
      void removeSignupDocument({
        accountType: draft.accountBasis.accountType,
        email: draft.accountBasis.email,
        clientSlotId: document.clientId,
        signal: controller.signal,
      });
      return;
    }

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
    if (result.ok) {
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
    }
    const parsed: ChargerDocumentDraft = {
      ...reset,
      parseStatus: result.ok ? "parsed" : "error",
      quarantineStatus: "uploading",
      quarantineFileReference: null,
      quarantineRevision: null,
    };
    dispatch({ type: "update_charger_document", document: parsed });
    const upload = await uploadSignupDocument({
      accountType: draft.accountBasis.accountType,
      email: draft.accountBasis.email,
      clientSlotId: document.clientId,
      documentType: document.documentType,
      file: document.file,
      signal: controller.signal,
    });
    if (
      chargerAttempts.current.get(chargerId) !== attempt ||
      !isDraftGenerationCurrent(generation) || (!upload.ok && upload.aborted)
    ) return;
    dispatch({
      type: "update_charger_document",
      document: upload.ok
        ? {
          ...parsed,
          quarantineStatus: "confirmed_quarantine",
          quarantineFileReference: upload.receipt.fileReference,
          quarantineRevision: upload.receipt.revisionNumber,
        }
        : { ...parsed, quarantineStatus: "error" },
    });
  };

  const uploads = activeLocation
    ? [
      {
        id: activeLocation.energyDocument.clientId,
        card: createDocumentUploadCardModel({
          document: activeLocation.energyDocument,
          helpText: draft.parserObservations.byDocumentId[
              activeLocation.energyDocument.clientId
            ]?.envelope.factCandidates.length === 0
            ? "Geen gegevens gevonden."
            : undefined,
          onChange: (document) => void handleEnergyDocument(document),
          scope: `Locatie ${activeLocationNumber}`,
          title: "Energienota of energiecontract",
        }),
        itemAction: draft.accountBasis.accountType !== "particulier"
          ? (
            <button
              className="button button-ghost button-compact"
              disabled={draft.locationOrder.length <= 1}
              onClick={() => void removeLocation(activeLocation.clientId)}
              type="button"
            >
              Locatie verwijderen
            </button>
          )
          : undefined,
      },
      ...(draft.chargerOrderByLocationId[activeLocation.clientId] || [])
        .flatMap((chargerId) => {
          const document = draft.chargerDocumentsByChargerId[chargerId]
            ?.find((candidate) =>
              candidate.documentType === "installation_invoice"
            );
          if (!document) return [];
          const chargerNumber = globalChargerNumber(chargerId);
          return [
            {
              id: document.clientId,
              card: createDocumentUploadCardModel({
                document,
                helpText:
                  draft.parserObservations.byDocumentId[document.clientId]
                      ?.envelope.factCandidates.length === 0
                    ? "Geen gegevens gevonden."
                    : undefined,
                onChange: (next) => void handleChargerDocument(next),
                scope: `Laadpaal ${chargerNumber}`,
                title: "Installatiefactuur",
              }),
              itemAction: (
                <button
                  aria-label="Laadpaal verwijderen"
                  className="document-upload-card-remove"
                  disabled={(draft.chargerOrderByLocationId[
                    activeLocation.clientId
                  ] || []).length <= 1}
                  onClick={() =>
                    void removeCharger(activeLocation.clientId, chargerId)}
                  title="Laadpaal verwijderen"
                  type="button"
                >
                  <span aria-hidden="true">×</span>
                </button>
              ),
            },
          ];
        }),
    ]
    : [];
  const evidenceSlots = [
    ...draft.locationOrder.flatMap((locationId) => {
      const document = draft.energyDocumentsByLocationId[locationId];
      return document
        ? [{
          id: document.clientId,
          required: true,
          replacementRequired: false,
          usableEvidenceReady: isDocumentUploadReady(document),
        }]
        : [];
    }),
    ...draft.locationOrder.flatMap((locationId) =>
      (draft.chargerOrderByLocationId[locationId] || []).map(
        (chargerId) => {
          const document = (draft.chargerDocumentsByChargerId[chargerId] || [])
            .find((candidate) =>
              candidate.documentType === "installation_invoice"
            );
          return {
            id: document?.clientId || `missing-installation:${chargerId}`,
            required: true,
            replacementRequired: false,
            usableEvidenceReady: document
              ? isDocumentUploadReady(document)
              : false,
          };
        },
      )
    ),
  ];
  const groups = createDocumentFirstWorkflowGroups({
    chargers: reviewChargers,
    evidenceReady: allRequiredDocumentEvidenceReady(evidenceSlots),
    locations: reviewLocations,
    onConfirm,
    onCorrect,
    onInvalidateConfirmation,
    onReplaceDocument,
    onRestoreSource,
    onSelectSource,
  });
  const workflowModel = createCustomerDocumentWorkflowModel({
    evidenceSlots,
    groups,
    id: "signup-document-workflow",
    primaryAction: {
      disabled: !canContinue,
      label: "Volgende",
      onClick: onContinue,
    },
    uploadActions: activeLocation
      ? (
        <>
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
        </>
      )
      : undefined,
    uploadPrelude: (
      <SignupLocationTabs
        activeLocationId={activeLocation?.clientId || ""}
        chargerCountByLocation
        locations={legacy.locations}
        onSelectLocation={onSelectLocation}
      />
    ),
    uploads,
  });

  return <DocumentEvidenceWorkflow {...workflowModel} />;
}
