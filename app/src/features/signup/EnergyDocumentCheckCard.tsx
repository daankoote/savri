import type { EnergyDocumentObservation } from "../invoice-analysis/energyDocumentObservation";
import { DocumentCheckCard, type DocumentCheckRow } from "./DocumentCheckCard";
import type { EnergyDocumentComparison } from "./energyDocumentCrossCheck";
import type {
  SignupPartyNameComparison,
  SignupPartyNameFocusTarget,
} from "./signupPartyNameCrossCheck";
import { formatStructuredDutchAddress } from "./structuredAddress";

type EnergyDocumentCheckCardProps = {
  addressComparison: EnergyDocumentComparison;
  partyComparison: SignupPartyNameComparison;
  confirmableEan: string | null;
  observation: EnergyDocumentObservation;
  onReviewParty: (target: SignupPartyNameFocusTarget) => void;
  onReviewLocation: () => void;
};

function deliveryAddress(observation: EnergyDocumentObservation): string {
  const address = observation.deliveryAddress;
  if (!address.displayable) return "";
  return formatStructuredDutchAddress(address);
}

function displayDate(value: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || "";
}

export function EnergyDocumentCheckCard({
  addressComparison,
  partyComparison,
  confirmableEan,
  observation,
  onReviewParty,
  onReviewLocation,
}: EnergyDocumentCheckCardProps) {
  const holder = observation.contractHolderName.displayable
    ? observation.contractHolderName.value
    : null;
  const address = deliveryAddress(observation);
  const supplier = observation.supplierName.displayable
    ? observation.supplierName.value
    : null;
  const connection =
    observation.electricityConnections.find((candidate) =>
      candidate.displayable && candidate.normalizedEan === confirmableEan
    ) || observation.electricityConnections.find((candidate) =>
      candidate.displayable
    );
  const validFrom = displayDate(connection?.validFrom || null);
  const partyActionLabel = partyComparison.focusTarget === "legalEntity.name"
    ? "Controleer de juridische naam bij Aanvrager"
    : partyComparison.focusTarget === "applicant.lastName"
    ? "Controleer Achternaam bij Aanvrager"
    : "Controleer Voornaam/voornamen bij Aanvrager";
  const rows: DocumentCheckRow[] = [
    {
      label: "EAN elektriciteit",
      displayValue: confirmableEan || "",
      displayable: Boolean(confirmableEan),
    },
    {
      label: "Contracthouder",
      displayValue: holder || "",
      displayable: Boolean(holder),
      comparisonStatus: partyComparison.status,
      actionTarget: partyComparison.focusTarget
        ? {
          label: partyActionLabel,
          onAction: () => onReviewParty(partyComparison.focusTarget!),
        }
        : undefined,
    },
    {
      label: "Leveradres",
      displayValue: address,
      displayable: Boolean(address),
      comparisonStatus: addressComparison.status,
      actionTarget: {
        label: "Controleer de gegevens bij Locatie",
        onAction: onReviewLocation,
      },
    },
    {
      label: "Energieleverancier",
      displayValue: supplier || "",
      displayable: Boolean(supplier),
    },
    {
      label: "Contract vanaf",
      displayValue: validFrom,
      displayable: Boolean(validFrom),
    },
  ];

  return <DocumentCheckCard rows={rows} />;
}
