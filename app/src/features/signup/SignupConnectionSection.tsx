import { useRef } from "react";
import {
  type InvoicePdfParserAdapterResult,
  parseInvoicePdfInput,
} from "../invoice-analysis/invoicePdfParserAdapter";
import { getConfirmableEnergyEanCandidates } from "../invoice-analysis/energyEanCandidateExtractor";
import type { EnergyDocumentObservation } from "../invoice-analysis/energyDocumentObservation";
import { ConnectionEanConfirmation } from "./ConnectionEanConfirmation";
import { DocumentUploadSlot } from "./DocumentUploadSlot";
import { EnergyDocumentCheckCard } from "./EnergyDocumentCheckCard";
import {
  compareDeclaredLocationToObservedDeliveryAddress,
  compareEnergyDocumentPartyName,
} from "./energyDocumentCrossCheck";
import type { SignupPartyNameFocusTarget } from "./signupPartyNameCrossCheck";
import {
  getSignupLocationLabel,
  SignupLocationTabs,
} from "./SignupLocationTabs";
import type {
  ConnectionDeclarationDraft,
  LocationDocumentDraft,
  SignupDraft,
  SignupFieldErrors,
  SignupLocationDraft,
} from "./signupTypes";
import { firstSignupFieldError } from "./signupValidation";
import {
  projectEnergyDocumentObservation,
  projectEnergyEanCandidates,
} from "./documentSemanticProjector";
import {
  transitionLocationToDocumentEanSource,
  transitionLocationToManualEanSource,
} from "./signupNormalizers";

type SignupConnectionSectionProps = {
  activeLocationId: string;
  draft: SignupDraft;
  draftGeneration: number;
  fieldErrors: SignupFieldErrors;
  isDraftGenerationCurrent: (generation: number) => boolean;
  locations: SignupLocationDraft[];
  onConnectionDeclarationChange: (
    locationId: string,
    declaration: ConnectionDeclarationDraft,
  ) => void;
  onEnergyDocumentChange: (document: LocationDocumentDraft) => void;
  onEnergyDocumentObservationChange: (
    locationId: string,
    observation: EnergyDocumentObservation | null,
  ) => void;
  onReviewParty: (target: SignupPartyNameFocusTarget) => void;
  onReviewLocation: (locationId: string) => void;
  onSelectLocation: (locationId: string) => void;
};

export function SignupConnectionSection({
  activeLocationId,
  draft,
  draftGeneration,
  fieldErrors,
  isDraftGenerationCurrent,
  locations,
  onConnectionDeclarationChange,
  onEnergyDocumentChange,
  onEnergyDocumentObservationChange,
  onReviewParty,
  onReviewLocation,
  onSelectLocation,
}: SignupConnectionSectionProps) {
  const parserAttempts = useRef(new Map<string, number>());
  const activeLocation =
    locations.find((location) => location.clientId === activeLocationId) ||
    locations[0];
  const activeLocationIndex = activeLocation
    ? locations.findIndex((location) =>
      location.clientId === activeLocation.clientId
    )
    : -1;

  const activateManualMode = (
    location: SignupLocationDraft,
    preflightStatus:
      | "parser_error"
      | "no_candidate"
      | "manual_entry_required" = "manual_entry_required",
  ) => {
    parserAttempts.current.set(
      location.clientId,
      (parserAttempts.current.get(location.clientId) || 0) + 1,
    );
    const next = transitionLocationToManualEanSource(
      location,
      preflightStatus,
    );
    onEnergyDocumentChange(next.energyDocument);
    onEnergyDocumentObservationChange(location.clientId, null);
    onConnectionDeclarationChange(
      location.clientId,
      next.connectionDeclaration,
    );
  };

  const applyParserResult = (
    location: SignupLocationDraft,
    result: InvoicePdfParserAdapterResult,
  ) => {
    const reset = location.connectionDeclaration;
    if (!result.ok) {
      activateManualMode(location, "parser_error");
      return;
    }
    onEnergyDocumentObservationChange(
      location.clientId,
      projectEnergyDocumentObservation(result.observation_envelope),
    );

    const candidates = projectEnergyEanCandidates(result.observation_envelope);
    const confirmableCandidates = getConfirmableEnergyEanCandidates(candidates);
    if (candidates.length === 0) {
      activateManualMode(location, "no_candidate");
      return;
    }

    if (confirmableCandidates.length === 0) {
      activateManualMode(location, "manual_entry_required");
      return;
    }

    if (confirmableCandidates.length > 1) {
      onConnectionDeclarationChange(location.clientId, {
        ...reset,
        preflightStatus: "multiple_candidates",
        candidates,
      });
      return;
    }

    const candidate = confirmableCandidates[0];
    onConnectionDeclarationChange(location.clientId, {
      ...reset,
      sourceMode: "document",
      preflightStatus: candidate.classification === "electricity"
        ? "electricity_candidate_found"
        : "unclassified_candidate_found",
      candidates,
      selectedCandidateEan: candidate.normalizedEan,
    });
  };

  const handleEnergyDocumentChange = async (
    location: SignupLocationDraft,
    document: LocationDocumentDraft,
  ) => {
    const generation = draftGeneration;
    const attempt = (parserAttempts.current.get(location.clientId) || 0) + 1;
    parserAttempts.current.set(location.clientId, attempt);
    const next = transitionLocationToDocumentEanSource(location, document);
    onEnergyDocumentChange(next.energyDocument);
    onEnergyDocumentObservationChange(location.clientId, null);

    const reset: ConnectionDeclarationDraft = next.connectionDeclaration;
    onConnectionDeclarationChange(location.clientId, reset);
    if (!document.file) return;

    const result = await parseInvoicePdfInput(document.file);
    if (
      parserAttempts.current.get(location.clientId) !== attempt ||
      !isDraftGenerationCurrent(generation)
    ) return;
    applyParserResult({ ...location, connectionDeclaration: reset }, result);
  };

  return (
    <section
      className="signup-section"
      id="signup-connection"
      aria-labelledby="signup-connection-title"
    >
      <div className="signup-section-header">
        <p className="eyebrow">Stap 3</p>
        <h2 id="signup-connection-title">Aansluiting</h2>
        <p className="fine-print">
          Upload je energienota of energiecontract. ENVAL gebruikt dit na
          accountactivatie om je aansluiting te controleren.
        </p>
      </div>

      <SignupLocationTabs
        activeLocationId={activeLocation?.clientId || ""}
        locations={locations}
        onSelectLocation={onSelectLocation}
      />

      {activeLocation
        ? (
          <div className="location-panel">
            <div className="location-panel-header">
              <h3>
                {getSignupLocationLabel(activeLocation, activeLocationIndex)}
              </h3>
              <span className="status-pill">
                {activeLocation.connectionDeclaration.sourceMode === "manual"
                  ? "EAN handmatig invoeren"
                  : activeLocation.energyDocument.file
                  ? "Document gekozen"
                  : "Nog geen document gekozen"}
              </span>
            </div>
            <DocumentUploadSlot
              document={activeLocation.energyDocument}
              error={firstSignupFieldError(
                fieldErrors,
                `locations.${activeLocation.clientId}.energyDocument`,
              )}
              onChange={(document) =>
                void handleEnergyDocumentChange(activeLocation, document)}
            />
            {activeLocation.connectionDeclaration.sourceMode === "document" &&
                activeLocation.energyDocumentObservation
              ? (
                <EnergyDocumentCheckCard
                  addressComparison={compareDeclaredLocationToObservedDeliveryAddress(
                    activeLocation.address,
                    activeLocation.energyDocumentObservation.deliveryAddress,
                  )}
                  partyComparison={compareEnergyDocumentPartyName(
                    draft,
                    activeLocation.energyDocumentObservation.contractHolderName,
                  )}
                  confirmableEan={activeLocation.connectionDeclaration
                    .selectedCandidateEan ||
                    getConfirmableEnergyEanCandidates(
                      activeLocation.connectionDeclaration.candidates,
                    )[0]?.normalizedEan ||
                    null}
                  observation={activeLocation.energyDocumentObservation}
                  onReviewParty={onReviewParty}
                  onReviewLocation={() =>
                    onReviewLocation(activeLocation.clientId)}
                />
              )
              : null}
            <ConnectionEanConfirmation
              error={firstSignupFieldError(
                fieldErrors,
                `locations.${activeLocation.clientId}.confirmedEan`,
              )}
              onChange={(declaration) =>
                onConnectionDeclarationChange(
                  activeLocation.clientId,
                  declaration,
                )}
              onRequireManualEntry={() =>
                activateManualMode(activeLocation, "manual_entry_required")}
              value={activeLocation.connectionDeclaration}
            />
          </div>
        )
        : null}
    </section>
  );
}
