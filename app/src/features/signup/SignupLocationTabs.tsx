import type { SignupLocationDraft } from "./signupTypes";
import { formatStructuredDutchAddress } from "./structuredAddress";

type SignupLocationTabsProps = {
  activeLocationId: string;
  chargerCountByLocation?: boolean;
  locations: SignupLocationDraft[];
  onSelectLocation: (locationId: string) => void;
};

export function getSignupLocationLabel(
  location: SignupLocationDraft,
  index: number,
) {
  const address = formatStructuredDutchAddress({
    street: location.address.street,
    houseNumber: location.address.houseNumber,
    houseNumberAddition: location.address.suffix,
    postalCode: null,
    city: null,
    country: null,
  });

  if (address) return address;

  return `Locatie ${index + 1}`;
}

export function SignupLocationTabs({
  activeLocationId,
  chargerCountByLocation = false,
  locations,
  onSelectLocation,
}: SignupLocationTabsProps) {
  if (locations.length <= 1) return null;

  return (
    <div className="location-tabs" aria-label="Locaties">
      {locations.map((location, index) => {
        const label = getSignupLocationLabel(location, index);
        const chargerCount = location.chargers.length;

        return (
          <button
            aria-pressed={location.clientId === activeLocationId}
            className={location.clientId === activeLocationId
              ? "mode-tab mode-tab-active"
              : "mode-tab"}
            key={location.clientId}
            onClick={() => onSelectLocation(location.clientId)}
            type="button"
          >
            {chargerCountByLocation ? `${label} (${chargerCount})` : label}
          </button>
        );
      })}
    </div>
  );
}
