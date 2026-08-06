import { compareChargerDocumentObservation } from "./chargerDocumentCrossCheck";
import { chargerFieldControlId } from "./ChargerForm";
import { DocumentCheckCard, type DocumentCheckRow } from "./DocumentCheckCard";
import { formatStructuredDutchAddress } from "./structuredAddress";
import type { SignupPartyNameFocusTarget } from "./signupPartyNameCrossCheck";
import type {
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  DocumentType,
  SignupDraft,
} from "./signupTypes";

type InvoicePdfPreviewPanelProps = {
  charger: ChargerDraft;
  document: ChargerDocumentDraft;
  draft: SignupDraft;
  location: AddressDraft;
  onReviewParty: (target: SignupPartyNameFocusTarget) => void;
  onReviewLocation: () => void;
};

export const INVOICE_PDF_ACCEPT = "application/pdf,.pdf";

const PDF_INVOICE_DOCUMENT_TYPES: DocumentType[] = [
  "organization_extract",
  "energy_bill_or_contract",
  "installation_invoice",
];

export function supportsInvoicePdfPreview(documentType: DocumentType) {
  return PDF_INVOICE_DOCUMENT_TYPES.includes(documentType);
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
}

function displayDate(value: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || "";
}

function focusChargerField(chargerId: string, field: string) {
  const target = document.getElementById(
    chargerFieldControlId(chargerId, field),
  );
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function InvoicePdfPreviewPanel({
  charger,
  document: chargerDocument,
  draft,
  location,
  onReviewParty,
  onReviewLocation,
}: InvoicePdfPreviewPanelProps) {
  if (chargerDocument.parseStatus === "idle") return null;
  if (chargerDocument.parseStatus === "parsing") {
    return (
      <p className="invoice-preview-note" aria-live="polite">
        Documentgegevens worden lokaal uitgelezen…
      </p>
    );
  }
  if (chargerDocument.parseStatus === "error" || !chargerDocument.observation) {
    return (
      <p className="field-message" aria-live="polite">
        We konden geen betrouwbare gegevens uit dit document halen.
      </p>
    );
  }

  const observation = chargerDocument.observation;
  const comparisons = compareChargerDocumentObservation(
    charger,
    draft,
    location,
    observation,
  );
  const focus = (field: string) => () =>
    focusChargerField(charger.clientId, field);
  const rows: DocumentCheckRow[] = [
    {
      label: "Merk",
      displayValue: observation.brand.value || "",
      displayable: observation.brand.displayable,
      comparisonStatus: comparisons.brand.status,
      actionTarget: { label: "Controleer Merk", onAction: focus("brand") },
    },
    {
      label: "Model",
      displayValue: observation.model.value || "",
      displayable: observation.model.displayable,
      comparisonStatus: comparisons.model.status,
      actionTarget: { label: "Controleer Model", onAction: focus("model") },
    },
    {
      label: "MID",
      displayValue: observation.midNumber.value || "",
      displayable: observation.midNumber.displayable,
      comparisonStatus: comparisons.midNumber.status,
      actionTarget: { label: "Controleer MID", onAction: focus("midNumber") },
    },
    {
      label: "Serienummer",
      displayValue: observation.serialNumber.value || "",
      displayable: observation.serialNumber.displayable,
      comparisonStatus: comparisons.serialNumber.status,
      actionTarget: {
        label: "Controleer Serienummer",
        onAction: focus("serialNumber"),
      },
    },
    {
      label: "Klant/contracthouder",
      displayValue: observation.customerName.value || "",
      displayable: observation.customerName.displayable,
      comparisonStatus: comparisons.customerName.status,
      actionTarget: comparisons.customerName.focusTarget
        ? {
          label: comparisons.customerName.focusTarget === "legalEntity.name"
            ? "Controleer de juridische naam bij Aanvrager"
            : comparisons.customerName.focusTarget === "applicant.lastName"
            ? "Controleer Achternaam bij Aanvrager"
            : "Controleer Voornaam/voornamen bij Aanvrager",
          onAction: () => onReviewParty(comparisons.customerName.focusTarget!),
        }
        : undefined,
    },
    {
      label: "Locatie",
      displayValue: formatStructuredDutchAddress(observation.location),
      displayable: observation.location.displayable,
      comparisonStatus: comparisons.location.status,
      actionTarget: {
        label: "Controleer de gegevens bij Locatie",
        onAction: onReviewLocation,
      },
    },
    {
      label: "Leverancier/installateur",
      displayValue: observation.supplierInstallerName.value || "",
      displayable: observation.supplierInstallerName.displayable,
    },
    {
      label: "Installatiedatum",
      displayValue: displayDate(observation.installationDate.value),
      displayable: observation.installationDate.displayable,
      comparisonStatus: comparisons.installationYear.status,
      actionTarget: {
        label: "Controleer Jaar van installatie",
        onAction: focus("installationYear"),
      },
    },
  ];

  return <DocumentCheckCard rows={rows} />;
}
