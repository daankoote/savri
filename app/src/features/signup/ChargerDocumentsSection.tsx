import { getBrandLabel, getModelLabel } from "./chargerCatalog";
import { DocumentUploadSlot } from "./DocumentUploadSlot";
import type {
  AccountType,
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

function chargerTitle(charger: ChargerDraft, index: number) {
  const brandLabel = charger.brand ? getBrandLabel(charger.brand, charger.manualBrand) : "";
  const modelLabel = charger.model ? getModelLabel(charger.brand, charger.model, charger.manualModel) : "";
  const chargerName = [brandLabel, modelLabel].filter(Boolean).join(" ");
  const midLabel = charger.midNumber.trim() ? `MID ${charger.midNumber.trim()}` : "MID ontbreekt";
  return [`Laadpaal ${index + 1}`, chargerName, midLabel].filter(Boolean).join(" — ");
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
            {isBusiness ? <h3>Locatie {locationIndex + 1}</h3> : null}
            {location.chargers.map((charger, chargerIndex) => {
              const documents = (documentsByChargerId[charger.clientId] || []).filter(
                (document) => !isBusiness || document.documentType === "installation_invoice",
              );

              return (
                <article className="document-group" key={charger.clientId}>
                  <div>
                    <h3>{chargerTitle(charger, chargerIndex)}</h3>
                  </div>

                  <div className={isBusiness ? "document-slot-grid document-slot-grid-one" : "document-slot-grid"}>
                    {documents.map((document) => (
                      <DocumentUploadSlot
                        document={document}
                        key={document.clientId}
                        onChange={onDocumentChange}
                      />
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
