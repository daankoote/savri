import { AddressFields } from "./AddressFields";
import { getSignupLocationLabel } from "./SignupLocationTabs";
import type {
  AccountType,
  AddressDraft,
  SignupFieldErrors,
  SignupLocationDraft,
} from "./signupTypes";

type SignupLocationSectionProps = {
  accountType: AccountType;
  fieldErrors: SignupFieldErrors;
  locations: SignupLocationDraft[];
  onAddLocation: () => void;
  onLocationAddressChange: (locationId: string, address: AddressDraft) => void;
  onRemoveLocation: (locationId: string) => void;
};

export function SignupLocationSection({
  accountType,
  fieldErrors,
  locations,
  onAddLocation,
  onLocationAddressChange,
  onRemoveLocation,
}: SignupLocationSectionProps) {
  const supportsMultipleLocations = accountType !== "particulier";

  return (
    <section
      className="signup-section"
      id="signup-locations"
      aria-labelledby="signup-locations-title"
    >
      <div className="signup-section-header">
        <p className="eyebrow">Stap 2</p>
        <h2 id="signup-locations-title">Locatie</h2>
      </div>

      <div className="document-groups">
        {locations.map((location, index) => (
          <div className="location-panel" key={location.clientId}>
            <div className="location-panel-header">
              <h3>{getSignupLocationLabel(location, index)}</h3>
              {supportsMultipleLocations
                ? (
                  <button
                    className="button button-ghost"
                    disabled={locations.length <= 1}
                    onClick={() => onRemoveLocation(location.clientId)}
                    type="button"
                  >
                    Locatie verwijderen
                  </button>
                )
                : null}
            </div>
            <AddressFields
              fieldErrors={fieldErrors}
              locationId={location.clientId}
              value={location.address}
              onChange={(address) =>
                onLocationAddressChange(location.clientId, address)}
            />
          </div>
        ))}
      </div>

      {supportsMultipleLocations
        ? (
          <div className="section-actions">
            <button
              className="button button-secondary"
              onClick={onAddLocation}
              type="button"
            >
              + Locatie toevoegen
            </button>
          </div>
        )
        : null}
    </section>
  );
}
