import { getBrandLabel, getModelLabel } from "./chargerCatalog";
import { DocumentUploadSlot } from "./DocumentUploadSlot";
import { InvoicePdfPreviewPanel, supportsInvoicePdfPreview } from "./InvoicePdfPreviewPanel";
import type {
  AccountType,
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  DocumentsByChargerId,
  SignupLocationDraft,
} from "./signupTypes";

type ChargerDocumentsSectionProps = {
  accountType: AccountType;
  documentsByChargerId: DocumentsByChargerId;
  kvkDocument: File | null;
  locations: SignupLocationDraft[];
  onDocumentChange: (document: ChargerDocumentDraft) => void;
};

function locationTitle(location: SignupLocationDraft, index: number) {
  const address = location.address;
  const hasResolvedAddress = Boolean(address.street.trim() && address.city.trim());

  if (!hasResolvedAddress) return `Locatie ${index + 1}`;

  return [`Locatie ${index + 1}`, formatAddressLabel(address)].filter(Boolean).join(" — ");
}

function formatAddressLabel(address: AddressDraft) {
  const number = `${address.houseNumber.trim()}${address.suffix.trim()}`;
  const streetAndNumber = [address.street.trim(), number].filter(Boolean).join(" ");

  return [streetAndNumber, address.postcode.trim(), address.city.trim(), address.country.trim()]
    .filter(Boolean)
    .join(" — ");
}

function chargerTitleParts(charger: ChargerDraft, index: number) {
  const brandLabel = charger.brand ? getBrandLabel(charger.brand, charger.manualBrand) : "";
  const modelLabel = charger.model ? getModelLabel(charger.brand, charger.model, charger.manualModel) : "";
  const chargerName = [brandLabel, modelLabel].filter(Boolean).join(" ");
  const midLabel = charger.midNumber.trim() ? `MID ${charger.midNumber.trim()}` : "";

  return {
    titleParts: [`Laadpaal ${index + 1}`, chargerName, midLabel].filter(Boolean),
    isMissingMid: !charger.midNumber.trim(),
  };
}

export function ChargerDocumentsSection({
  accountType,
  documentsByChargerId,
  kvkDocument,
  locations,
  onDocumentChange,
}: ChargerDocumentsSectionProps) {
  const isBusiness = accountType !== "particulier";

  return (
    <section className="signup-section" aria-labelledby="documents-title">
      <div className="signup-section-header">
        <p className="eyebrow">Stap 3</p>
        <h2 id="documents-title">Documentatie uploaden</h2>
        <p>Bestanden blijven nu lokaal.</p>
      </div>

      {isBusiness ? (
        <div className="document-group document-group-muted">
          <div>
            <span className="step-number">KVK</span>
            <h3>{accountType === "vve" ? "KVK-uittreksel VVE" : "KVK-uittreksel"}</h3>
          </div>
          <p className="fine-print">{kvkDocument ? kvkDocument.name : "Nog geen bestand gekozen in stap 1."}</p>
        </div>
      ) : null}

      <div className="document-groups">
        {locations.map((location, locationIndex) => (
          <div className="document-location-group" key={location.clientId}>
            {isBusiness ? <h3>{locationTitle(location, locationIndex)}</h3> : null}
            {location.chargers.map((charger, chargerIndex) => {
              const documents = (documentsByChargerId[charger.clientId] || []).filter(
                (document) => !isBusiness || document.documentType === "installation_invoice",
              );
              const invoicePreviewDocument = documents.find((document) =>
                supportsInvoicePdfPreview(document.documentType),
              );
              const title = chargerTitleParts(charger, chargerIndex);

              return (
                <article className="document-group" key={charger.clientId}>
                  <div>
                    <h3>
                      {title.titleParts.join(" — ")}
                      {title.isMissingMid ? (
                        <>
                          {title.titleParts.length > 0 ? " — " : null}
                          <span className="warning-text">MID ontbreekt</span>
                        </>
                      ) : null}
                    </h3>
                  </div>

                  <div className={isBusiness ? "document-slot-grid document-slot-grid-one" : "document-slot-grid"}>
                    {documents.map((document) => (
                      <div className="document-slot-column" key={document.clientId}>
                        <DocumentUploadSlot
                          document={document}
                          onChange={onDocumentChange}
                        />
                        {invoicePreviewDocument?.clientId === document.clientId ? (
                          <InvoicePdfPreviewPanel
                            documentType={invoicePreviewDocument.documentType}
                            file={invoicePreviewDocument.file}
                            title="PDF-preview factuur installatie"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
