import { ChargerDocumentsSection } from "./ChargerDocumentsSection";
import { ChargerImportTab } from "./ChargerImportTab";
import { ChargerList } from "./ChargerList";
import {
  getSignupLocationLabel,
  SignupLocationTabs,
} from "./SignupLocationTabs";
import type { SignupPartyNameFocusTarget } from "./signupPartyNameCrossCheck";
import type {
  ChargerDocumentDraft,
  ChargerDraft,
  DocumentsByChargerId,
  SignupDraft,
  SignupFieldErrors,
  SignupLocationDraft,
  SignupTab,
} from "./signupTypes";

type ChargerInfoSectionProps = {
  activeLocationId: string;
  activeTab: SignupTab;
  documentsByChargerId: DocumentsByChargerId;
  draft: SignupDraft;
  draftGeneration: number;
  fieldErrors: SignupFieldErrors;
  isDraftGenerationCurrent: (generation: number) => boolean;
  locations: SignupLocationDraft[];
  onAddCharger: (locationId: string) => void;
  onChangeCharger: (locationId: string, charger: ChargerDraft) => void;
  onDocumentChange: (document: ChargerDocumentDraft) => void;
  onRemoveCharger: (locationId: string, chargerClientId: string) => void;
  onReviewParty: (target: SignupPartyNameFocusTarget) => void;
  onReviewLocation: (locationId: string) => void;
  onSelectLocation: (locationId: string) => void;
  onTabChange: (tab: SignupTab) => void;
};

export function ChargerInfoSection({
  activeLocationId,
  activeTab,
  documentsByChargerId,
  draft,
  draftGeneration,
  fieldErrors,
  isDraftGenerationCurrent,
  locations,
  onAddCharger,
  onChangeCharger,
  onDocumentChange,
  onRemoveCharger,
  onReviewParty,
  onReviewLocation,
  onSelectLocation,
  onTabChange,
}: ChargerInfoSectionProps) {
  const activeLocation =
    locations.find((location) => location.clientId === activeLocationId) ||
    locations[0];
  const activeLocationIndex = activeLocation
    ? locations.findIndex((location) =>
      location.clientId === activeLocation.clientId
    )
    : -1;

  return (
    <section
      className="signup-section"
      id="signup-chargers"
      aria-labelledby="charger-info-title"
    >
      <div className="signup-section-header">
        <p className="eyebrow">Stap 4</p>
        <h2 id="charger-info-title">Laadpalen</h2>
      </div>

      <SignupLocationTabs
        activeLocationId={activeLocation?.clientId || ""}
        chargerCountByLocation
        locations={locations}
        onSelectLocation={onSelectLocation}
      />

      {activeLocation
        ? (
          <h3 className="signup-subheading">
            {getSignupLocationLabel(activeLocation, activeLocationIndex)}
          </h3>
        )
        : null}

      <div className="mode-tabs" aria-label="Laadpaal invoer">
        <button
          aria-pressed={activeTab === "manual"}
          className={activeTab === "manual"
            ? "mode-tab mode-tab-active"
            : "mode-tab"}
          onClick={() => onTabChange("manual")}
          type="button"
        >
          Handmatig invoeren
        </button>
        <button
          aria-pressed={activeTab === "import"}
          className={activeTab === "import"
            ? "mode-tab mode-tab-active"
            : "mode-tab"}
          onClick={() => onTabChange("import")}
          type="button"
        >
          Importeren
        </button>
      </div>

      {activeTab === "manual"
        ? (
          activeLocation
            ? (
              <div className="document-location-group">
                <ChargerList
                  chargers={activeLocation.chargers}
                  fieldErrors={fieldErrors}
                  onChange={(charger) =>
                    onChangeCharger(activeLocation.clientId, charger)}
                  onRemove={(chargerClientId) =>
                    onRemoveCharger(
                      activeLocation.clientId,
                      chargerClientId,
                    )}
                  renderAfterCharger={(charger) => (
                    <ChargerDocumentsSection
                      charger={charger}
                      documents={documentsByChargerId[charger.clientId] || []}
                      draft={draft}
                      draftGeneration={draftGeneration}
                      fieldErrors={fieldErrors}
                      isDraftGenerationCurrent={isDraftGenerationCurrent}
                      location={activeLocation.address}
                      onDocumentChange={onDocumentChange}
                      onReviewParty={onReviewParty}
                      onReviewLocation={() =>
                        onReviewLocation(activeLocation.clientId)}
                    />
                  )}
                />
                <div className="section-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => onAddCharger(activeLocation.clientId)}
                    type="button"
                  >
                    + Laadpaal toevoegen
                  </button>
                </div>
              </div>
            )
            : null
        )
        : <ChargerImportTab />}
    </section>
  );
}
