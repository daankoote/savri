import { AddressFields } from "./AddressFields";
import { ChargerImportTab } from "./ChargerImportTab";
import { ChargerList } from "./ChargerList";
import type { AccountType, AddressDraft, ChargerDraft, SignupLocationDraft, SignupTab } from "./signupTypes";

type ChargerInfoSectionProps = {
  accountType: AccountType;
  activeLocationId: string;
  activeTab: SignupTab;
  locations: SignupLocationDraft[];
  onAddCharger: (locationId: string) => void;
  onAddLocation: () => void;
  onChangeCharger: (locationId: string, charger: ChargerDraft) => void;
  onLocationAddressChange: (locationId: string, address: AddressDraft) => void;
  onRemoveCharger: (locationId: string, chargerClientId: string) => void;
  onRemoveLocation: (locationId: string) => void;
  onSelectLocation: (locationId: string) => void;
  onTabChange: (tab: SignupTab) => void;
};

export function ChargerInfoSection({
  accountType,
  activeLocationId,
  activeTab,
  locations,
  onAddCharger,
  onAddLocation,
  onChangeCharger,
  onLocationAddressChange,
  onRemoveCharger,
  onRemoveLocation,
  onSelectLocation,
  onTabChange,
}: ChargerInfoSectionProps) {
  const activeLocation = locations.find((location) => location.clientId === activeLocationId) || locations[0];
  const hasLocationTabs = accountType !== "particulier";

  return (
    <section className="signup-section" aria-labelledby="charger-info-title">
      <div className="signup-section-header">
        <p className="eyebrow">Stap 2</p>
        <h2 id="charger-info-title">Laadpaal informatie</h2>
      </div>

      {hasLocationTabs ? (
        <div className="location-tabs" aria-label="Locaties">
          {locations.map((location, index) => (
            <button
              aria-pressed={location.clientId === activeLocation.clientId}
              className={location.clientId === activeLocation.clientId ? "mode-tab mode-tab-active" : "mode-tab"}
              key={location.clientId}
              onClick={() => onSelectLocation(location.clientId)}
              type="button"
            >
              Locatie {index + 1}
            </button>
          ))}
          <button className="mode-tab" onClick={onAddLocation} type="button">
            + Locatie toevoegen
          </button>
        </div>
      ) : null}

      {hasLocationTabs && activeLocation ? (
        <div className="location-panel">
          <div className="location-panel-header">
            <h3>Locatiegegevens</h3>
            <button
              className="button button-ghost"
              disabled={locations.length <= 1}
              onClick={() => onRemoveLocation(activeLocation.clientId)}
              type="button"
            >
              Locatie verwijderen
            </button>
          </div>
          <AddressFields
            value={activeLocation.address}
            onChange={(address) => onLocationAddressChange(activeLocation.clientId, address)}
          />
        </div>
      ) : null}

      <div className="mode-tabs" aria-label="Laadpaal invoer">
        <button
          aria-pressed={activeTab === "manual"}
          className={activeTab === "manual" ? "mode-tab mode-tab-active" : "mode-tab"}
          onClick={() => onTabChange("manual")}
          type="button"
        >
          Handmatig invoeren
        </button>
        <button
          aria-pressed={activeTab === "import"}
          className={activeTab === "import" ? "mode-tab mode-tab-active" : "mode-tab"}
          onClick={() => onTabChange("import")}
          type="button"
        >
          Importeren
        </button>
      </div>

      {activeTab === "manual" && activeLocation ? (
        <div className="tab-panel">
          <ChargerList
            chargers={activeLocation.chargers}
            onChange={(charger) => onChangeCharger(activeLocation.clientId, charger)}
            onRemove={(chargerClientId) => onRemoveCharger(activeLocation.clientId, chargerClientId)}
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
      ) : (
        <ChargerImportTab />
      )}
    </section>
  );
}
