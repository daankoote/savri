import { ChargerForm } from "./ChargerForm";
import { getBackendSupplierLabel, getBrandLabel, getModelLabel } from "./chargerCatalog";
import type { ChargerDraft } from "./signupTypes";

type ChargerCardProps = {
  charger: ChargerDraft;
  index: number;
  canRemove: boolean;
  onChange: (charger: ChargerDraft) => void;
  onRemove: (clientId: string) => void;
};

export function ChargerCard({ canRemove, charger, index, onChange, onRemove }: ChargerCardProps) {
  const brandLabel = charger.brand ? getBrandLabel(charger.brand, charger.manualBrand) : "";
  const modelLabel = charger.model ? getModelLabel(charger.brand, charger.model, charger.manualModel) : "";
  const supplierLabel = charger.backendSupplier
    ? getBackendSupplierLabel(charger.backendSupplier, charger.manualBackendSupplier)
    : "";
  const title = [brandLabel, modelLabel].filter(Boolean).join(" ") || "Nieuwe laadpaal";

  return (
    <article className="charger-card">
      <div className="charger-card-header">
        <div>
          <span className="step-number">Laadpaal {index + 1}</span>
          <h3>{title}</h3>
          {supplierLabel ? <p className="charger-card-meta">{supplierLabel}</p> : null}
        </div>
        <button
          className="button button-ghost"
          disabled={!canRemove}
          onClick={() => onRemove(charger.clientId)}
          type="button"
        >
          Verwijderen
        </button>
      </div>

      <ChargerForm charger={charger} onChange={onChange} />
    </article>
  );
}
